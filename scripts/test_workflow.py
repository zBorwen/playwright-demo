"""验证状态门槛、证据失效和路由遗漏，不依赖应用服务。"""
from pathlib import Path
import tempfile
import subprocess
import unittest

import workflow


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'workflow').mkdir()
        (self.root / 'workflow/routes.yaml').write_text('project:\n  status: ready\n  analyzed_commit: '+ 'a' * 40 + '\nroutes:\n- prefixes: [app.py]\n  docs: [guide.md]\n- prefixes: [spec.md]\n  docs: []\n')
        for name in ['spec.md', 'app.py', 'guide.md', 'proof.md']:
            (self.root / name).write_text(name)
        self.task = dict(version=1, base_commit='a' * 40, id='demo', goal='demo', kind='feature', risk='normal',
                         phase='done', requirements_revision=1, spec='spec.md', scope=['spec.md', 'app.py'],
                         context={'guide.md': '模块约定'}, acceptance={'status': 'pending'},
                         checks={'design': {'status': 'na', 'reason': '非重构/高风险'}})
        (self.root / 'HANDOFF.md').write_text('## 当前任务：demo\n- `workflow/tasks/demo.yaml`\n')
        digest = workflow.fingerprint(self.root, self.task, 'implementation')
        for name in ['verification', 'review']:
            self.task['checks'][name] = dict(status='passed', evidence='proof.md', fingerprint=digest)

    def errors(self):
        return workflow.validate(self.root, self.task, {'app.py'})

    def test_uninitialized_project_blocks_task_check(self):
        config = self.root / 'workflow/routes.yaml'
        original = config.read_text()
        config.write_text(original.replace('status: ready', 'status: uninitialized'))
        self.assertTrue(any('尚未初始化' in e for e in self.errors()))
        config.write_text(original.replace('a' * 40, 'null'))
        self.assertTrue(any('分析基准' in e for e in self.errors()))

    def test_record_without_labels_or_spec_can_finish(self):
        for key in ['kind', 'risk', 'spec']:
            self.task.pop(key)
        self.task['scope'] = ['app.py']
        self.task['criteria'] = ['返回既定结果']
        self.task['checks'].pop('design')
        self.task['checks'].pop('review')
        self.task['checks']['verification']['fingerprint'] = workflow.fingerprint(self.root, self.task, 'implementation')
        self.assertEqual(self.errors(), [])
        self.task['criteria'] = ['返回新的结果']
        self.assertTrue(any('过期' in e for e in self.errors()))

    def test_labels_do_not_select_reviews(self):
        self.task.update(kind='refactor', risk='high')
        self.task['checks'].pop('review')
        self.assertEqual(self.errors(), [])
        self.task['checks']['review'] = {'status': 'pending'}
        self.assertTrue(any('review 尚未满足' in e for e in self.errors()))

    def test_selected_design_must_not_be_claimed_complete(self):
        self.task['checks']['design'] = {'status': 'pending'}
        self.assertTrue(any('design 尚未满足' in e for e in self.errors()))
        self.task['phase'] = 'implementing'
        self.assertEqual(self.errors(), [])

    def test_missing_or_duplicate_acceptance_basis(self):
        self.task.pop('spec')
        self.assertTrue(self.errors())
        self.task['criteria'] = ['']
        self.assertTrue(self.errors())
        self.task['spec'] = 'spec.md'
        self.task['criteria'] = ['重复来源']
        self.assertTrue(self.errors())

    def test_complete(self):
        self.assertEqual(self.errors(), [])

    def test_missing_review(self):
        self.task['checks']['review'] = {'status': 'pending'}
        self.assertTrue(self.errors())

    def test_untracked_content_invalidates(self):
        (self.root / 'app.py').write_text('new content')
        self.assertTrue(any('过期' in e for e in self.errors()))

    def test_deleted_content_invalidates(self):
        (self.root / 'app.py').unlink()
        self.assertTrue(any('过期' in e for e in self.errors()))

    def test_spec_editorial_change_does_not_invalidate(self):
        (self.root / 'spec.md').write_text('clarified wording, same behavior')
        self.assertEqual(self.errors(), [])

    def test_requirements_revision_invalidates(self):
        self.task['requirements_revision'] += 1
        self.assertTrue(any('过期' in e for e in self.errors()))

    def test_invalid_revision_rejected(self):
        for value in [0, -1, True, '1']:
            self.task['requirements_revision'] = value
            self.assertTrue(self.errors())

    def test_high_risk_does_not_block_implementation(self):
        self.task.update(kind='small', risk='high', phase='implementing')
        self.task['checks']['design'] = {'status': 'pending'}
        self.task['checks']['review'] = {'status': 'pending'}
        self.assertEqual(self.errors(), [])
        self.task['phase'] = 'done'
        self.assertTrue(any('review 尚未满足' in e for e in self.errors()))

    def test_small_low_na(self):
        self.task.update(kind='small', risk='low')
        self.task['checks']['review'] = {'status': 'na', 'reason': '局部小改自检'}
        self.assertEqual(self.errors(), [])

    def test_refactor_no_automatic_design_gate(self):
        self.task.update(kind='refactor', phase='implementing')
        self.task['checks']['design'] = {'status': 'pending'}
        self.assertEqual(self.errors(), [])

    def test_high_risk_user_waiver_can_finish(self):
        self.task.update(kind='refactor', risk='high')
        self.task['checks']['review'] = {'status': 'waived', 'reason': '用户接管审查', 'report': '用户本轮明确要求跳过独立审查并自行验收；仍未独立审查。'}
        self.assertEqual(self.errors(), [])
        del self.task['checks']['review']['report']
        self.assertTrue(self.errors())

    def test_nonblocking_review_suggestions_can_finish(self):
        self.task['checks']['review'].pop('evidence')
        self.task['checks']['review'].update(report='范围内无阻塞；重命名建议不属本次验收，保留建议不扩需求。', reviewer='independent-reviewer')
        self.assertEqual(self.errors(), [])

    def test_routing_omission(self):
        self.task['context'] = {}
        self.assertTrue(any('路由' in e for e in self.errors()))

    def test_unknown_path(self):
        self.assertEqual(workflow.route(self.root, ['other.py'])[1], ['other.py'])

    def test_scope_omission(self):
        self.assertTrue(workflow.validate(self.root, self.task, {'new.py'}))

    def test_invalid_enum(self):
        self.task['phase'] = 'finished'
        self.assertTrue(self.errors())

    def test_missing_evidence(self):
        (self.root / 'proof.md').unlink()
        self.assertTrue(self.errors())

    def test_no_verification_waiver(self):
        self.task['checks']['verification'] = dict(status='waived', reason='skip', evidence='proof.md')
        self.assertTrue(self.errors())

    def test_self_reference(self):
        self.task['scope'].append('workflow/tasks/demo.yaml')
        self.assertTrue(self.errors())

    def test_path_and_secret_boundary(self):
        for path in ['../secret', '/tmp/secret', '.env', 'folder/.env.local']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                workflow.local_path(self.root, path)

    def test_symlink_to_secret_rejected(self):
        (self.root / '.env').write_text('fixture only')
        (self.root / 'alias').symlink_to(self.root / '.env')
        with self.assertRaises(ValueError):
            workflow.local_path(self.root, 'alias')

    def test_optional_failed_check_blocks_done(self):
        self.task.update(kind='small', risk='low')
        for name in ['design', 'review']:
            with self.subTest(name=name):
                original = self.task['checks'][name]
                self.task['checks'][name] = {'status': 'failed', 'reason': '实际发现问题'}
                self.assertTrue(any('已失败' in e for e in self.errors()))
                self.task['checks'][name] = original

    def test_handoff_does_not_invalidate_implementation(self):
        (self.root / 'HANDOFF.md').write_text('next step')
        before = workflow.fingerprint(self.root, self.task, 'implementation')
        self.task['scope'].append('HANDOFF.md')
        self.assertEqual(before, workflow.fingerprint(self.root, self.task, 'implementation'))
        (self.root / 'HANDOFF.md').write_text('updated progress')
        self.assertEqual(before, workflow.fingerprint(self.root, self.task, 'implementation'))
        (self.root / 'app.py').write_text('implementation changed')
        self.assertNotEqual(before, workflow.fingerprint(self.root, self.task, 'implementation'))

    def test_inline_reports_keep_fingerprint_gate(self):
        for name in ['verification', 'review']:
            self.task['checks'][name].pop('evidence')
            self.task['checks'][name]['report'] = '实际执行检查：通过；范围 app.py'
        self.task['checks']['review']['reviewer'] = 'independent-reviewer'
        self.assertEqual(self.errors(), [])
        self.task['checks']['review']['report'] = ' '
        self.assertTrue(self.errors())
        self.task['checks']['review']['report'] = 'PASS'
        del self.task['checks']['review']['reviewer']
        self.assertTrue(self.errors())
        self.task['checks']['review']['reviewer'] = 'independent-reviewer'
        (self.root / 'app.py').write_text('new implementation')
        self.assertTrue(any('过期' in e for e in self.errors()))

    def test_duplicate_report_is_rejected(self):
        self.task['checks']['verification']['report'] = 'passed'
        self.assertTrue(self.errors())

    def test_handoff_current_is_unique_and_matches(self):
        for text in [
            '## 当前任务：demo\nworkflow/tasks/demo.yaml\n## 当前任务：old\nworkflow/tasks/old.yaml',
            '## 当前任务：demo\nworkflow/tasks/demo.yaml\n## 当前任务：old',
            '## 当前任务：demo\nworkflow/tasks/demo.yaml.bak',
            '## 当前任务：demo\nwrong/workflow/tasks/demo.yaml',
            '## 当前任务：old\nworkflow/tasks/old.yaml',
            '## 当前任务：demo\nworkflow/tasks/demo.yaml workflow/tasks/other.yaml',
            '## 历史任务\nworkflow/tasks/demo.yaml',
        ]:
            with self.subTest(text=text):
                (self.root / 'HANDOFF.md').write_text(text)
                self.assertTrue(workflow.validate_handoff(self.root, self.task))
        (self.root / 'HANDOFF.md').write_text('## 当前任务：demo\nworkflow/tasks/demo.yaml\n## 历史任务\nworkflow/tasks/old.yaml')
        self.assertEqual(workflow.validate_handoff(self.root, self.task), [])
        (self.root / 'HANDOFF.md').unlink()
        self.assertTrue(workflow.validate_handoff(self.root, self.task))

    def test_normal_check_does_not_require_handoff(self):
        (self.root / 'HANDOFF.md').unlink()
        self.assertEqual(self.errors(), [])
        (self.root / 'HANDOFF.md').write_text('old snapshot for another task')
        self.assertEqual(workflow.validate(self.root, self.task, {'app.py', 'HANDOFF.md'}), [])

    def test_missing_base_is_rejected(self):
        del self.task['base_commit']
        self.assertTrue(self.errors())

    def test_git_scope_includes_committed_staged_unstaged_and_new(self):
        def git(*args):
            return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.DEVNULL).decode().strip()
        git('init')
        git('add', '.')
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'base')
        base = git('rev-parse', 'HEAD')
        self.task['base_commit'] = base
        (self.root / 'missed.py').write_text('committed outside scope')
        git('add', 'missed.py')
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'task work')
        changed = workflow.changed_files(self.root, base)
        self.assertEqual(changed, {'missed.py'})
        self.assertTrue(any('未覆盖实际改动' in e for e in workflow.validate(self.root, self.task, changed)))
        (self.root / 'staged.py').write_text('staged')
        git('add', 'staged.py')
        (self.root / 'app.py').write_text('unstaged')
        (self.root / 'new.py').write_text('untracked')
        (self.root / 'guide.md').unlink()
        self.assertEqual(workflow.changed_files(self.root, base), {'missed.py', 'staged.py', 'app.py', 'new.py', 'guide.md'})
        (self.root / 'proof.md').write_text('staged proof change')
        git('add', 'proof.md')
        (self.root / 'proof.md').write_text('proof.md')
        self.assertIn('proof.md', workflow.changed_files(self.root, base))
        for invalid in ['HEAD', '', 'f' * 40]:
            with self.subTest(base=invalid), self.assertRaises((ValueError, subprocess.CalledProcessError)):
                workflow.changed_files(self.root, invalid)

    def test_pause_and_acceptance(self):
        self.task['phase'] = 'paused'
        self.assertTrue(self.errors())
        self.task['pause_reason'] = '用户变更'
        self.assertEqual(self.errors(), [])
        self.task['acceptance'] = {'status': 'accepted'}
        self.assertTrue(self.errors())


if __name__ == '__main__':
    unittest.main()
