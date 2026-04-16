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
        self._assert_report_card_rendered()

    def _assert_profile_report_sections(self):
        self._page = self._open_profile()
        time.sleep(4)
        data = getattr(self._current_page(), "data", {}) or {}
        profile = data.get("profile") or {}
        report = profile.get("assetReport") or {}
        self.assertTrue(report.get("hasReport"), report)
        sections = report.get("sections") or []
        titles = [str(item.get("title") or "") for item in sections if isinstance(item, dict)]
        for title in ["能力资产小报告", "资源资产小报告", "认知资产小报告", "关系资产小报告", "总资产报告"]:
            self.assertTrue(any(title in item for item in titles), titles)

    def _open_profile(self):
        try:
            return self.app.relaunch("/pages/profile/profile")
        except AttributeError:
            return self.app.redirect_to("/pages/profile/profile")

    def test_seeded_asset_reports_render(self):
        requests.get(f"{BACKEND_BASE_URL}/health", timeout=10).raise_for_status()

        self._login_if_needed()
        session = self._create_router_session()
        session_id = str(session.get("conversationStateId") or session.get("sessionId") or "").strip()
        self.assertTrue(session_id, f"router session should be created: {session}")
        self._assert_router_is_asset(session_id)

        self._seed_ready_report(getattr(self, "_user_id", ""), session_id)
        status = self._backend_get(f"/router/sessions/{session_id}/asset-report/status")
        self.assertEqual(status.get("reportStatus"), "ready", status)

        self._assert_report_card_rendered_from_polling(session_id)
        self._assert_profile_report_sections()


if __name__ == "__main__":
    unittest.main()
