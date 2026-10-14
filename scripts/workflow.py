"""检查按需 SDD 的记录与证据；不执行任务，也不充当宿主权限门禁。"""
import argparse
import hashlib
from pathlib import Path
import subprocess
import sys

import yaml

ROOT = Path(__file__).resolve().parents[1]


def local_path(root, name):
    if not isinstance(name, str) or not name or Path(name).is_absolute():
        raise ValueError('必须使用非空仓库相对路径')
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()) or '..' in Path(name).parts:
        raise ValueError(f'路径超出仓库: {name}')
    if any(part == '.env' or part.startswith('.env.') for part in (*Path(name).parts, *path.relative_to(root.resolve()).parts)):
        raise ValueError('不能读取环境秘密文件')
    return path


def read_yaml(path):
    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        raise ValueError('YAML 顶层必须为映射')
    return data


def route(root, paths):
    config = read_yaml(root / 'workflow/routes.yaml')
    docs, unknown = set(), []
    for name in paths:
        local_path(root, name)
        matches = [r for r in config['routes'] if any(
            name.startswith(p) if p.endswith('/') else name == p
            for p in r['prefixes'])]
        if not matches:
            unknown.append(name)
        for match in matches:
            docs.update(match['docs'])
    return sorted(docs), sorted(unknown)


def fingerprint(root, task, stage):
    names = [task['spec']] if stage == 'design' else task['scope']
    if not isinstance(names, list) or not names or any(not isinstance(n, str) for n in names):
        raise ValueError('摘要范围必须为非空路径列表')
    digest = hashlib.sha256()
    for name in sorted(set(names)):
        path = local_path(root, name)
        if name.startswith(('workflow/tasks/', 'workflow/evidence/')):
            raise ValueError('scope 不得包含状态或证据，避免自引用')
        if path.is_dir():
            raise ValueError(f'scope 必须列具体文件: {name}')
        content = b'file\0' + path.read_bytes() if path.exists() else b'deleted'
        for part in (name.encode(), content):
            digest.update(len(part).to_bytes(8, 'big'))
            digest.update(part)
    return digest.hexdigest()


def changed_files(root):
    result = set()
    for args in (['diff', '--name-only', '--no-renames', '-z', 'HEAD'],
                 ['ls-files', '--others', '--exclude-standard', '-z']):
        output = subprocess.check_output(['git', *args], cwd=root)
        result.update(p for p in output.decode().split('\0') if p)
    return result


def validate(root, task, changed):
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    def evidence(name):
        path = local_path(root, name)
        return path.is_file() and bool(path.read_text().strip())

    try:
        kind, risk, phase = task['kind'], task['risk'], task['phase']
        require(task.get('version') == 1, 'version 必须为 1')
        require(bool(task.get('id')) and bool(task.get('goal')), '缺少 id/goal')
        require(kind in {'small', 'bug', 'feature', 'refactor'}, '未知 kind')
        require(risk in {'low', 'normal', 'high'}, '未知 risk')
        require(phase in {'scoped', 'implementing', 'verifying', 'reviewing', 'done', 'paused'}, '未知 phase')
        require(phase != 'paused' or bool(task.get('pause_reason')), '暂停需要原因')
        require(evidence(task['spec']), 'Spec 不存在或为空')
        scope = task['scope']
        require(isinstance(scope, list) and bool(scope), 'scope 必须为非空列表')
        design_hash = fingerprint(root, task, 'design')
        implementation_hash = fingerprint(root, task, 'implementation')
        require(task['spec'] in scope, 'scope 必须包含 Spec，确保需求变化使实现证据失效')
        excluded = task.get('excluded_changes', {})
        require(isinstance(excluded, dict) and all(isinstance(v, str) and v.strip() for v in excluded.values()), '排除改动必须说明原因')
        actual = {p for p in changed if not p.startswith(('workflow/tasks/', 'workflow/evidence/'))}
        require(not (actual - set(scope) - set(excluded)), f'未覆盖实际改动: {sorted(actual - set(scope) - set(excluded))}')
        docs, unknown = route(root, scope)
        context = task['context']
        require(isinstance(context, dict), 'context 必须映射路径到使用理由')
        for name, reason in context.items():
            require(bool(isinstance(reason, str) and reason.strip()) and evidence(name), f'上下文无效: {name}')
        for name in docs:
            require(name in context and evidence(name), f'缺少路由资料: {name}')
        notes = task.get('unknown_paths', {})
        for name in unknown:
            require(isinstance(notes.get(name), str) and bool(notes[name].strip()), f'未知路径需调查说明: {name}')
        design_required = kind == 'refactor' or risk == 'high'
        review_required = design_required or not (kind in {'small', 'bug'} and risk == 'low')
        for name, required, expected in [
            ('design', design_required, design_hash),
            ('verification', True, implementation_hash),
            ('review', review_required, implementation_hash),
        ]:
            check = task['checks'][name]
            status = check['status']
            require(status in {'pending', 'passed', 'failed', 'na', 'waived'}, f'未知检查状态: {name}')
            if status in {'failed', 'na', 'waived'}:
                require(bool(check.get('reason')), f'{name} 需要原因')
            if status == 'na':
                require(not required, f'{name} 必须执行，不能标为 na')
            if status == 'waived':
                require(name != 'verification', '验证不能豁免')
                require(evidence(check.get('evidence')), f'{name} 缺少用户豁免证据')
            if status == 'passed':
                require(evidence(check.get('evidence')), f'{name} 缺少证据文件')
                require(check.get('fingerprint') == expected, f'{name} 证据已过期')
            gate = phase == 'done' or (name == 'design' and phase in {'implementing', 'verifying', 'reviewing'})
            if gate and required:
                require(status in {'passed', 'waived'}, f'{name} 尚未满足阶段条件')
        acceptance = task['acceptance']
        require(acceptance['status'] in {'pending', 'accepted', 'na'}, '未知验收状态')
        if acceptance['status'] == 'accepted':
            require(evidence(acceptance.get('evidence')), '用户验收缺少证据')
        if acceptance['status'] == 'na':
            require(bool(acceptance.get('reason')), '验收不适用需要原因')
    except (KeyError, TypeError, ValueError, OSError, AttributeError) as exc:
        errors.append(f'无效任务记录: {exc}')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['route', 'check', 'fingerprint'])
    parser.add_argument('paths', nargs='+')
    args = parser.parse_args()
    try:
        if args.command == 'route':
            docs, unknown = route(ROOT, args.paths)
            print(yaml.safe_dump({'docs': docs, 'unknown_paths': unknown}, allow_unicode=True, sort_keys=False))
            return 0
        task = read_yaml(local_path(ROOT, args.paths[0]))
        if args.command == 'fingerprint':
            if len(args.paths) != 2 or args.paths[1] not in {'design', 'implementation'}:
                raise ValueError('fingerprint 需要任务文件和 design|implementation')
            print(fingerprint(ROOT, task, args.paths[1]))
            return 0
        errors = validate(ROOT, task, changed_files(ROOT))
        print('\n'.join(errors) if errors else 'PASS: 状态、路由与证据条件通过（不代表用户验收或模型理解证明）')
        return 1 if errors else 0
    except (ValueError, OSError, yaml.YAMLError, subprocess.CalledProcessError, KeyError, TypeError) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
