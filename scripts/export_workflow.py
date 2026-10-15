"""把通用 workflow 白名单导出到新目录，不覆盖现有项目。"""
import argparse
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
CORE_FILES = (
    'AGENTS.md',
    'docs/workflow/change.md',
    'docs/workflow/portable.md',
    'scripts/workflow.py',
    'scripts/test_workflow.py',
    'scripts/requirements-workflow.txt',
    'workflow/templates/task.yaml',
    'workflow/templates/spec.md',
    'workflow/templates/HANDOFF.md',
)
PROJECT_TEMPLATES = {
    'workflow/templates/conventions.md': 'docs/workflow/conventions.md',
    'workflow/templates/routes.yaml': 'workflow/routes.yaml',
}


def export_workflow(destination):
    files = {name: name for name in CORE_FILES}
    files.update(PROJECT_TEMPLATES)
    for source in files:
        if not (ROOT / source).is_file():
            raise ValueError(f'缺少导出源文件: {source}')
    # 原子创建目录，现有目录（即使为空）也拒绝覆盖。
    destination.mkdir(parents=True, exist_ok=False)
    for source, target in files.items():
        output = destination / target
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / source, output)
    for name in ['docs/specs', 'workflow/tasks']:
        (destination / name).mkdir(exist_ok=True)
    (destination / '.gitignore').write_text('__pycache__/\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    try:
        export_workflow(args.destination)
    except (OSError, ValueError) as exc:
        parser.exit(1, f'导出失败：{exc}\n')
    print(f'已导出：{args.destination.resolve()}；按 docs/workflow/portable.md 配置目标项目。')


if __name__ == '__main__':
    main()
