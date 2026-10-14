"""验证状态门槛、证据失效和路由遗漏，不依赖应用服务。"""
from pathlib import Path
import tempfile
import unittest

import workflow


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'workflow').mkdir()
        (self.root / 'workflow/routes.yaml').write_text('routes:\n- prefixes: [app.py]\n  docs: [guide.md]\n- prefixes: [spec.md]\n  docs: []\n')
        for name in ['spec.md', 'app.py', 'guide.md', 'proof.md']:
            (self.root / name).write_text(name)
        self.task = dict(version=1, id='demo', goal='demo', kind='feature', risk='normal',
                         phase='done', spec='spec.md', scope=['spec.md', 'app.py'],
                         context={'guide.md': '模块约定'}, acceptance={'status': 'pending'},
                         checks={'design': {'status': 'na', 'reason': '非重构/高风险'}})
        digest = workflow.fingerprint(self.root, self.task, 'implementation')
        for name in ['verification', 'review']:
            self.task['checks'][name] = dict(status='passed', evidence='proof.md', fingerprint=digest)

    def errors(self):
        return workflow.validate(self.root, self.task, {'app.py'})

    def test_project_css_and_state_routes(self):
        docs, unknown = workflow.route(workflow.ROOT, ['packages/frontend/src/index.css'])
        self.assertEqual((docs, unknown), ([], []))
        docs, unknown = workflow.route(workflow.ROOT, ['packages/frontend/src/store/app-store.ts'])
        self.assertIn('docs/frontend-state-management.md', docs)
        self.assertEqual(unknown, [])

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

    def test_spec_invalidates(self):
        (self.root / 'spec.md').write_text('changed requirement')
        self.assertTrue(any('过期' in e for e in self.errors()))

    def test_high_risk_overrides_small(self):
        self.task.update(kind='small', risk='high', phase='implementing')
        self.assertTrue(any('design' in e for e in self.errors()))

    def test_small_low_na(self):
        self.task.update(kind='small', risk='low')
        self.task['checks']['review'] = {'status': 'na', 'reason': '局部小改自检'}
        self.assertEqual(self.errors(), [])

    def test_refactor_design_gate(self):
        self.task.update(kind='refactor', phase='implementing')
        self.assertTrue(self.errors())
        self.task['checks']['design'] = dict(status='passed', evidence='proof.md',
            fingerprint=workflow.fingerprint(self.root, self.task, 'design'))
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

    def test_pause_and_acceptance(self):
        self.task['phase'] = 'paused'
        self.assertTrue(self.errors())
        self.task['pause_reason'] = '用户变更'
        self.assertEqual(self.errors(), [])
        self.task['acceptance'] = {'status': 'accepted'}
        self.assertTrue(self.errors())


if __name__ == '__main__':
    unittest.main()
