"""本项目的路由验收，不随通用模板导出。"""
import unittest
import workflow


class ProjectRouteTests(unittest.TestCase):
    def test_project_css_and_state_routes(self):
        docs, unknown = workflow.route(workflow.ROOT, ['packages/frontend/src/index.css'])
        self.assertEqual((docs, unknown), ([], []))
        docs, unknown = workflow.route(workflow.ROOT, ['packages/frontend/src/store/app-store.ts'])
        self.assertIn('docs/frontend-state-management.md', docs)
        self.assertEqual(unknown, [])


if __name__ == '__main__':
    unittest.main()
