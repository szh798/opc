import os
import subprocess
import time
import unittest

import requests

from tests.minium_asset_report import test_asset_report_flow as asset_flow


REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND_BASE_URL = asset_flow.BACKEND_BASE_URL


class TestAssetReportRendering(asset_flow.TestAssetReportFlow):
    """Minium e2e: seed a ready report -> poll status -> render report card/profile."""

    @unittest.skip("real Dify generation is covered by test_asset_report_flow")
    def test_asset_report_generation(self):
        pass

    def _seed_ready_report(self, user_id, session_id):
        self.assertTrue(user_id, "user id should exist before seeding asset report")
        env = {
            **os.environ,
            "OPC_SEED_USER_ID": user_id,
            "OPC_SEED_SESSION_ID": session_id,
        }
        result = subprocess.run(
            ["node", "tests/minium_asset_report/seed_asset_report_fixture.js"],
            cwd=REPO_ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def _assert_report_card_rendered_from_polling(self, session_id):
        self._page.call_method("applyRouterStatePatch", {
            "conversationStateId": session_id,
            "currentAgentId": "asset",
            "activeChatflowId": "cf_asset_inventory",
            "routeMode": "guided",
        })
        self._page.call_method("watchAssetReportStatus", [session_id, {"maxPoll": 3, "pollInterval": 500}])
        time.sleep(2)
        data = self._page_data()
        self.assertEqual(str(data.get("assetReportStatus") or "").lower(), "ready", data)
        self._assert_report_card_rendered()

    def _assert_profile_report_sections(self, profile):
        asset_report = profile.get("assetReport") or {}
        self.assertTrue(asset_report.get("hasReport"), asset_report)
        sections = asset_report.get("sections") or []
        titles = [str(item.get("title") or "") for item in sections if isinstance(item, dict)]
        for title in ["能力资产小报告", "资源资产小报告", "认知资产小报告", "关系资产小报告", "总资产报告"]:
            self.assertTrue(any(title in item for item in titles), titles)
        self.assertEqual(len(sections), 5, sections)
        self.assertGreaterEqual(len(str(asset_report.get("finalReport") or "")), asset_flow.MIN_REPORT_CHARS)

    def test_seeded_asset_reports_render(self):
        requests.get(f"{BACKEND_BASE_URL}/health", timeout=10).raise_for_status()

        self._login_if_needed()
        self._enter_asset_flow()
        session_id = self._wait_for_session_id()
        self._assert_router_is_asset(session_id)

        self._seed_ready_report(getattr(self, "_user_id", ""), session_id)
        status = self._backend_get(f"/router/sessions/{session_id}/asset-report/status")
        self.assertEqual(status.get("reportStatus"), "ready", status)

        self._assert_report_card_rendered_from_polling(session_id)
        profile_from_page = self._open_report_from_card()
        self._assert_profile_report_sections(profile_from_page)


if __name__ == "__main__":
    unittest.main()
