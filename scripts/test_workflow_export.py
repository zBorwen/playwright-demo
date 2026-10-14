"""在不同业务目录布局验证导出的独立 workflow。"""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import yaml
import export_workflow


class ExportTests(unittest.TestCase):
    def test_existing_destination_is_untouched(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'existing'
            target.mkdir()
            keep = target / 'AGENTS.md'
            keep.write_text('existing rules')
            with self.assertRaises(FileExistsError):
                export_workflow.export_workflow(target)
            self.assertEqual(keep.read_text(), 'existing rules')
            self.assertEqual(list(target.iterdir()), [keep])

    def test_portable_package_is_independent(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'kit'
            export_workflow.export_workflow(target)
            names = {p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}
            expected = set(export_workflow.CORE_FILES) | set(export_workflow.PROJECT_TEMPLATES.values()) | {'.gitignore'}
            self.assertEqual(names, expected)
            self.assertEqual(list((target / 'workflow/tasks').iterdir()), [])
            self.assertFalse((target / 'workflow/evidence').exists())
            self.assertEqual(yaml.safe_load((target / 'workflow/routes.yaml').read_text())['project'], {'status': 'uninitialized', 'analyzed_commit': None})
            for name in names:
                text = (target / name).read_text()
                self.assertNotIn('playwright-demo', text)
                self.assertNotIn('/Users/hylas', text)
            result = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'scripts', '-p', 'test_workflow*.py'], cwd=target, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_two_project_layouts(self):
        for app in ['service/handler.py', 'web/client/index.js']:
            with self.subTest(app=app), tempfile.TemporaryDirectory() as temp:
                root = Path(temp) / 'project'
                export_workflow.export_workflow(root)

                def run(*args, ok=True):
                    result = subprocess.run(args, cwd=root, capture_output=True, text=True)
                    if ok:
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    return result

                def tool(*args, ok=True):
                    return run(sys.executable, 'scripts/workflow.py', *args, ok=ok)

                self.assertEqual(yaml.safe_load(tool('route', app).stdout)['unknown_paths'], [app])
                routes_path = root / 'workflow/routes.yaml'
                routes = yaml.safe_load(routes_path.read_text())
                routes['routes'].append({'prefixes': [app.split('/')[0] + '/'], 'docs': ['docs/workflow/conventions.md']})
                routes_path.write_text(yaml.safe_dump(routes, allow_unicode=True))
                path = root / app
                path.parent.mkdir(parents=True)
                path.write_text('initial fixture\n')
                run('git', 'init')
                run('git', 'add', '.')
                run('git', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'base')
                base = run('git', 'rev-parse', 'HEAD').stdout.strip()
                routes['project'] = {'status': 'ready', 'analyzed_commit': base}
                routes_path.write_text(yaml.safe_dump(routes, allow_unicode=True))
                task = yaml.safe_load((root / 'workflow/templates/task.yaml').read_text())
                task.update(id='sample', goal='fixture task', base_commit=base, phase='done', spec='docs/specs/sample.md', scope=[app, 'docs/specs/sample.md', 'HANDOFF.md', 'workflow/routes.yaml'])
                task['context']['docs/workflow/conventions.md'] = 'fixture module rule'
                (root / 'docs/specs/sample.md').write_text('REQ-1 fixture behavior')
                (root / 'HANDOFF.md').write_text('## 当前任务：sample\n`workflow/tasks/sample.yaml`\n')
                path.write_text('changed fixture\n')
                record = root / 'workflow/tasks/sample.yaml'
                record.write_text(yaml.safe_dump(task, allow_unicode=True))
                digest = tool('fingerprint', 'workflow/tasks/sample.yaml', 'implementation').stdout.strip()
                for check in ['verification', 'review']:
                    task['checks'][check] = {'status': 'passed', 'report': 'Synthetic test fixture evidence only', 'fingerprint': digest}
                task['checks']['review']['reviewer'] = 'fixture-reviewer'
                record.write_text(yaml.safe_dump(task, allow_unicode=True))
                tool('check', 'workflow/tasks/sample.yaml')
                path.write_text('later change\n')
                self.assertNotEqual(tool('check', 'workflow/tasks/sample.yaml', ok=False).returncode, 0)


if __name__ == '__main__':
    unittest.main()
