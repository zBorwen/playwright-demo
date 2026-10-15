"""检查按需 SDD 的记录与证据；不执行任务，也不充当宿主权限门禁。"""
import argparse
import hashlib
import json
import re
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
    spec = task.get('spec')
    names = ([spec] if spec else []) if stage == 'design' else task['scope']
    if not isinstance(names, list) or (not names and stage != 'design') or any(not isinstance(n, str) for n in names):
        raise ValueError('摘要范围必须为非空路径列表')
    digest = hashlib.sha256()
    if not spec:
        contract = {'goal': task['goal'], 'criteria': task.get('criteria'), 'requirements_revision': task.get('requirements_revision', 1)}
        digest.update(json.dumps(contract, ensure_ascii=False, sort_keys=True).encode())
    for name in sorted(set(names)):
        path = local_path(root, name)
        if name.startswith(('workflow/tasks/', 'workflow/evidence/')):
            raise ValueError('scope 不得包含状态或证据，避免自引用')
        if path.is_dir():
            raise ValueError(f'scope 必须列具体文件: {name}')
        if stage == 'implementation' and name == 'HANDOFF.md':
            continue
        if name == spec:
            content = f"requirements-revision:{task.get('requirements_revision', 1)}".encode()
        else:
            content = b'file\0' + path.read_bytes() if path.exists() else b'deleted'
        for part in (name.encode(), content):
            digest.update(len(part).to_bytes(8, 'big'))
            digest.update(part)
    return digest.hexdigest()


def changed_files(root, base_commit):
    if not isinstance(base_commit, str) or not re.fullmatch(r'[0-9a-f]{40}', base_commit):
        raise ValueError('base_commit 必须是任务开始时的完整提交 SHA')
    subprocess.check_call(['git', 'merge-base', '--is-ancestor', base_commit, 'HEAD'], cwd=root)
    result = set()
    for args in (['diff', '--name-only', '--no-renames', '-z', base_commit],
                 ['diff', '--cached', '--name-only', '--no-renames', '-z', base_commit],
                 ['ls-files', '--others', '--exclude-standard', '-z']):
        output = subprocess.check_output(['git', *args], cwd=root)
        result.update(p for p in output.decode().split('\0') if p)
    return result


def validate_handoff(root, task):
    """仅在实际交接时显式检查快照，普通 check 不依赖 HANDOFF。"""
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    try:
        handoff = local_path(root, 'HANDOFF.md').read_text()
        sections = re.findall(r'^##[ \t]+当前任务[^\n]*\n(.*?)(?=^##[ \t]|\Z)', handoff, re.M | re.S)
        headings = re.findall(r'^##[ \t]+当前任务[^\n]*$', handoff, re.M)
        require(len(headings) == len(sections) == 1, 'HANDOFF 必须恰好有一个当前任务段落')
        if len(sections) == 1:
            links = re.findall(r'(?<![A-Za-z0-9_./-])workflow/tasks/[A-Za-z0-9_.-]+\.yaml(?![A-Za-z0-9_./-])', sections[0])
            require(links == [f"workflow/tasks/{task['id']}.yaml"], 'HANDOFF 当前任务须唯一指向本任务 YAML')
    except (KeyError, TypeError, ValueError, OSError) as exc:
        errors.append(f'无效交接快照: {exc}')
    return errors


def validate(root, task, changed):
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    def evidence(name):
        path = local_path(root, name)
        return path.is_file() and bool(path.read_text().strip())

    try:
        project = read_yaml(root / 'workflow/routes.yaml').get('project', {})
        require(project.get('status') == 'ready', '项目尚未初始化：先分析目标项目并填写约定与路由')
        analyzed = project.get('analyzed_commit')
        require(isinstance(analyzed, str) and bool(re.fullmatch(r'[0-9a-f]{40}', analyzed)), '缺少项目分析基准 analyzed_commit')
        phase = task['phase']
        require(task.get('version') == 1, 'version 必须为 1')
        require(isinstance(task.get('base_commit'), str) and bool(re.fullmatch(r'[0-9a-f]{40}', task['base_commit'])), '缺少有效 base_commit')
        require(bool(task.get('id')) and bool(task.get('goal')), '缺少 id/goal')
        revision = task.get('requirements_revision', 1)
        require(type(revision) is int and revision > 0, 'requirements_revision 必须为正整数')
        spec = task.get('spec')
        if spec is not None:
            require(Path(spec).suffix.lower() == '.md', 'Spec 必须为 Markdown 文档')
            require(evidence(spec), 'Spec 不存在或为空')
            require(not task.get('criteria'), '已有 Spec 时不重复维护 criteria')
        else:
            criteria = task.get('criteria')
            require(isinstance(criteria, list) and bool(criteria) and all(isinstance(c, str) and c.strip() for c in criteria), '无 Spec 时在 criteria 内记录实际验收依据')
        require(phase in {'scoped', 'implementing', 'verifying', 'reviewing', 'done', 'paused'}, '未知 phase')
        require(phase != 'paused' or bool(task.get('pause_reason')), '暂停需要原因')
        scope = task['scope']
        require(isinstance(scope, list) and bool(scope), 'scope 必须为非空列表')
        design_hash = fingerprint(root, task, 'design')
        implementation_hash = fingerprint(root, task, 'implementation')
        if spec:
            require(spec in scope, 'scope 必须包含已引用的 Spec')
        excluded = task.get('excluded_changes', {})
        require(isinstance(excluded, dict) and all(isinstance(v, str) and v.strip() for v in excluded.values()), '排除改动必须说明原因')
        actual = {p for p in changed if p != 'HANDOFF.md' and not p.startswith(('workflow/tasks/', 'workflow/evidence/'))}
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
        for name, expected in [
            ('design', design_hash),
            ('verification', implementation_hash),
            ('review', implementation_hash),
        ]:
            check = task['checks'][name] if name == 'verification' else task['checks'].get(name, {'status': 'na', 'reason': '未选择该检查'})
            status = check['status']
            required = name == 'verification' or status != 'na'
            require(status in {'pending', 'passed', 'failed', 'na', 'waived'}, f'未知检查状态: {name}')
            if status in {'failed', 'na', 'waived'}:
                require(bool(check.get('reason')), f'{name} 需要原因')
            if status == 'na':
                require(not required, f'{name} 必须执行，不能标为 na')
            if status == 'waived':
                require(name != 'verification', '验证不能豁免')
                report = check.get('report')
                require((isinstance(report, str) and bool(report.strip())) or evidence(check.get('evidence')), f'{name} 缺少用户豁免证据')
            if status == 'passed':
                report = check.get('report')
                if report is not None:
                    require(isinstance(report, str) and bool(report.strip()), f'{name} 缺少内联证据')
                    require(not check.get('evidence'), f'{name} 不重复保存内联和文件证据')
                    if name in {'design', 'review'}:
                        reviewer = check.get('reviewer')
                        require(isinstance(reviewer, str) and bool(reviewer.strip()), f'{name} 缺少独立 reviewer 标识')
                else:
                    require(evidence(check.get('evidence')), f'{name} 缺少证据文件')
                require(check.get('fingerprint') == expected, f'{name} 证据已过期')
            require(not (phase == 'done' and status == 'failed'), f'{name} 已失败，不能完成任务')
            gate = phase == 'done'
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
    parser.add_argument('command', choices=['route', 'check', 'check-handoff', 'fingerprint'])
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
        errors = validate_handoff(ROOT, task) if args.command == 'check-handoff' else validate(ROOT, task, changed_files(ROOT, task['base_commit']))
        print('\n'.join(errors) if errors else 'PASS: 状态、路由与证据条件通过（不代表用户验收或模型理解证明）')
        return 1 if errors else 0
    except (ValueError, OSError, yaml.YAMLError, subprocess.CalledProcessError, KeyError, TypeError) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
