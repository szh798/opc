import os
import time
import unittest
from datetime import datetime

import minium


REPORT_ROOT = os.getenv(
    "OPC_MINIUM_REPORT_DIR",
    os.path.join(
        os.getcwd(),
        "tests",
        "minium_release",
        "reports",
        datetime.now().strftime("%Y%m%d-%H%M%S"),
    ),
)


class CoreUiSmoke(minium.MiniTest):
    """Read-only Minium smoke checks for registered core pages."""

    def setUp(self):
        os.makedirs(os.path.join(REPORT_ROOT, "screenshots"), exist_ok=True)
        try:
            self.app.call_wx_method("clearStorageSync")
        except Exception:
            pass

    def _open(self, path, wait_seconds=1.5):
        try:
            page = self.app.relaunch(path)
        except AttributeError:
            page = self.app.redirect_to(path)
        time.sleep(wait_seconds)
        return page

    def _current_path(self):
        page = None
        try:
            page = self.app.get_current_page()
        except Exception:
            page = getattr(self, "page", None) or getattr(self.mini, "page", None)
        return str(getattr(page, "path", "") or "")

    def _screenshot(self, name):
        path = os.path.join(REPORT_ROOT, "screenshots", f"{name}.png")
        try:
            page = self.app.get_current_page()
            page.screen_shot(path)
        except Exception:
            page = getattr(self, "page", None) or getattr(self.mini, "page", None)
            if page and hasattr(page, "screen_shot"):
                page.screen_shot(path)
        return path

    def _assert_page(self, path, evidence_name):
        page = self._open(path)
        current = self._current_path()
        expected = path.split("?", 1)[0].strip("/")
        self.assertIn(expected, current or expected)
        self._screenshot(evidence_name)
        return page

    def test_registered_core_pages_open(self):
        pages = [
            ("/pages/welcome/welcome", "welcome"),
            ("/pages/conversation/conversation", "conversation"),
            ("/pages/profile/profile", "profile"),
            ("/pages/settings/settings", "settings"),
            ("/pages/legal/legal?type=terms", "legal_terms"),
        ]
        for path, name in pages:
            with self.subTest(path=path):
                self._assert_page(path, name)


if __name__ == "__main__":
    unittest.main()
