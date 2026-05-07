import json
import os
import time
import unittest
import ctypes
from datetime import datetime

import minium


REPORT_ROOT = os.getenv(
    "OPC_MINIUM_REPORT_DIR",
    os.path.join(
        os.getcwd(),
        "outputs",
        "minium-fullpage-report",
        datetime.now().strftime("%Y%m%d-%H%M%S"),
    ),
)
SCREENSHOT_DIR = os.path.join(REPORT_ROOT, "screenshots")
SUMMARY_PATH = os.path.join(REPORT_ROOT, "fullpage-summary.json")


PAGES = [
    ("welcome", "/pages/welcome/welcome"),
    ("legal_terms", "/pages/legal/legal?type=terms"),
    ("legal_privacy", "/pages/legal/legal?type=privacy"),
    ("phone_login", "/pages/phone-login/phone-login"),
    ("conversation", "/pages/conversation/conversation"),
    ("conversation_asset", "/pages/conversation/conversation?routeAction=asset_radar"),
    ("ai_assistant_redirect", "/pages/ai-assistant/ai-assistant"),
    ("ip_assistant_redirect", "/pages/ip-assistant/ip-assistant"),
    ("profile", "/pages/profile/profile"),
    ("settings", "/pages/settings/settings"),
    ("project_detail", "/pages/project-detail/project-detail?id=media-service"),
    ("tree", "/pages/tree/tree"),
    ("milestone", "/pages/milestone/milestone"),
    ("weekly_report", "/pages/weekly-report/weekly-report"),
    ("monthly_check", "/pages/monthly-check/monthly-check"),
    ("social_proof", "/pages/social-proof/social-proof"),
    ("share_preview", "/pages/share-preview/share-preview?title=FullPageSmoke"),
]


def selected_pages():
    names = {
        item.strip()
        for item in os.getenv("OPC_MINIUM_PAGE_NAMES", "").split(",")
        if item.strip()
    }
    if not names:
        return PAGES
    return [item for item in PAGES if item[0] in names]


def focus_devtools_window():
    """Bring WeChat DevTools to front so IDE screenshots do not stall."""
    if os.name != "nt":
        return False

    user32 = ctypes.windll.user32
    matching_hwnds = []

    def enum_windows(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buffer, length + 1)
        title = buffer.value
        if "微信开发者工具" in title or "WeChat Developer Tools" in title:
            matching_hwnds.append(hwnd)
        return True

    enum_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows(enum_proc(enum_windows), 0)
    if not matching_hwnds:
        return False

    hwnd = matching_hwnds[0]
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.6)
    return True


class FullPageScreenshots(minium.MiniTest):
    """Open every registered page and save one evidence screenshot per state."""

    def setUp(self):
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        try:
            self.app.call_wx_method("clearStorageSync")
        except Exception:
            pass

    def _open(self, path, wait_seconds=2.5):
        try:
            page = self.app.relaunch(path)
        except AttributeError:
            page = self.app.redirect_to(path)
        time.sleep(wait_seconds)
        return page

    def _current_page(self):
        try:
            return self.app.get_current_page()
        except Exception:
            return getattr(self, "page", None) or getattr(self.mini, "page", None)

    def _current_path(self):
        page = self._current_page()
        return str(getattr(page, "path", "") or "")

    def _screenshot(self, index, name):
        path = os.path.join(SCREENSHOT_DIR, f"{index:02d}_{name}.png")
        last_error = ""

        for attempt in range(1, 4):
            if os.path.exists(path):
                os.remove(path)
            focus_devtools_window()
            try:
                self.app._screen_shot_timeout = 25
                self.app.screen_shot(path)
            except Exception as exc:
                last_error = str(exc)
            time.sleep(0.4)
            if os.path.exists(path) and os.path.getsize(path) > 0:
                return path
            last_error = last_error or f"screenshot was not written: {path}"

        raise RuntimeError(last_error)
        return path

    def test_all_pages_open_and_screenshot(self):
        results = []
        errors = []

        for index, (name, path) in enumerate(selected_pages(), start=1):
            with self.subTest(page=name):
                item = {
                    "name": name,
                    "requested_path": path,
                    "status": "passed",
                    "current_path": "",
                    "screenshot": "",
                    "error": "",
                }
                try:
                    self._open(path)
                    item["current_path"] = self._current_path()
                    item["screenshot"] = self._screenshot(index, name)
                except Exception as exc:
                    item["status"] = "failed"
                    item["error"] = str(exc)
                    errors.append(f"{name}: {exc}")
                finally:
                    results.append(item)

        os.makedirs(REPORT_ROOT, exist_ok=True)
        with open(SUMMARY_PATH, "w", encoding="utf-8") as output:
            json.dump(
                {
                    "generated_at": datetime.now().isoformat(timespec="seconds"),
                    "report_root": REPORT_ROOT,
                    "screenshots": SCREENSHOT_DIR,
                    "pages": results,
                },
                output,
                ensure_ascii=False,
                indent=2,
            )

        self.assertFalse(errors, "\n".join(errors))


if __name__ == "__main__":
    unittest.main()
