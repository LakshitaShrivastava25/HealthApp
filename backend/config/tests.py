from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from . import health as health_module


class HealthEndpointTests(TestCase):
    def setUp(self):
        health_module.running_commit.cache_clear()
        self.addCleanup(health_module.running_commit.cache_clear)

    def test_ok_without_authentication(self):
        with patch.dict('os.environ', {'RENDER_GIT_COMMIT': 'abc123'}):
            response = APIClient().get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'ok')
        self.assertEqual(response.data['database'], 'ok')

    def test_reports_render_commit_when_no_revision_file(self):
        with patch.dict('os.environ', {'RENDER_GIT_COMMIT': 'abc123'}), \
                patch.object(health_module.settings, 'BASE_DIR', health_module.settings.BASE_DIR / 'no-such-dir'):
            response = APIClient().get('/api/health/')
        self.assertEqual(response.data['commit'], 'abc123')

    def test_503_when_database_is_unreachable(self):
        with patch.object(health_module.connection, 'cursor', side_effect=RuntimeError('db down')):
            response = APIClient().get('/api/health/')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['status'], 'error')
        self.assertNotIn('db down', str(response.data))
