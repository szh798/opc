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
INPUT_SELECTOR = ".conversation-footer .composer__input"
SEND_SELECTOR = ".conversation-footer .composer__send"
SKILL_SELECTOR = ".conversation-footer .composer__skill-entry"
SKILL_SHEET_SELECTOR = ".skill-sheet-layer--show"
SKILL_SHEET_CLOSE_SELECTOR = ".skill-sheet__close"
SKILL_SHEET_ITEM_SELECTOR = ".skill-sheet__item"
SKILL_CHIP_SELECTOR = ".conversation-footer .composer__skill-chip"


class ConversationUiContract(minium.MiniTest):
    """Read-only UI contract checks for the conversation page."""

    def setUp(self):
        os.makedirs(os.path.join(REPORT_ROOT, "screenshots"), exist_ok=True)
        try:
            self.app.call_wx_method("clearStorageSync")
        except Exception:
            pass
        self._page = self._open_conversation()

    def _open_conversation(self, query=""):
        path = "/pages/conversation/conversation"
        if query:
            path = f"{path}?{query.lstrip('?')}"
        try:
            page = self.app.relaunch(path)
        except AttributeError:
            page = self.app.redirect_to(path)
        time.sleep(2)
        return page

    def _current_page(self):
        try:
            return self.app.get_current_page()
        except Exception:
            return getattr(self, "_page", None) or getattr(self, "page", None) or getattr(self.mini, "page", None)

    def _get(self, selector, timeout=8):
        return self._current_page().get_element(selector, max_timeout=timeout)

    def _maybe_get(self, selector, timeout=3):
        try:
            return self._get(selector, timeout=timeout)
        except Exception:
            return None

    def _tap(self, selector, timeout=8):
        element = self._get(selector, timeout=timeout)
        try:
            element.click()
        except Exception:
            element.tap()

    def _input(self, selector, text, timeout=8):
        element = self._get(selector, timeout=timeout)
        try:
            element.input(text)
        except Exception:
            element.fill(text)

    def _screenshot(self, name):
        path = os.path.join(REPORT_ROOT, "screenshots", f"{name}.png")
        try:
            self._current_page().screen_shot(path)
        except Exception:
            page = self._current_page()
            if page and hasattr(page, "screen_shot"):
                page.screen_shot(path)
        return path

    def _page_data(self):
        return getattr(self._current_page(), "data", {}) or {}

    def test_conversation_initial_contract(self):
        self._get(".conversation-footer", timeout=12)
        self._get(INPUT_SELECTOR, timeout=12)
        self._get(SEND_SELECTOR, timeout=12)
        self._get(SKILL_SELECTOR, timeout=12)
        data = self._page_data()
        self.assertIn("messages", data)
        self.assertIsInstance(data.get("messages"), list)
        self._screenshot("conversation_initial")

    def test_skill_entry_opens_and_closes_sheet(self):
        self._get(".conversation-footer", timeout=12)
        self._tap(SKILL_SELECTOR, timeout=12)
        time.sleep(1)
        data = self._page_data()
        self.assertTrue(data.get("skillSheetVisible"), data)
        self.assertEqual(len(data.get("skills") or []), 8, data.get("skills"))
        self._get(SKILL_SHEET_SELECTOR, timeout=8)
        self._get(SKILL_SHEET_ITEM_SELECTOR, timeout=8)
        self._screenshot("conversation_skill_sheet_open")

        self._tap(SKILL_SHEET_CLOSE_SELECTOR, timeout=8)
        time.sleep(1)
        data = self._page_data()
        self.assertFalse(data.get("skillSheetVisible"), data)
        self._screenshot("conversation_skill_sheet_closed")

    def test_skill_select_sets_composer_chip(self):
        self._get(".conversation-footer", timeout=12)
        self._tap(SKILL_SELECTOR, timeout=12)
        time.sleep(1)
        self._tap(SKILL_SHEET_ITEM_SELECTOR, timeout=8)
        time.sleep(1)
        data = self._page_data()
        self.assertFalse(data.get("skillSheetVisible"), data)
        self.assertTrue(data.get("selectedSkillTitle"), data)
        self.assertTrue(data.get("selectedSkillRouteAction"), data)
        self._get(SKILL_CHIP_SELECTOR, timeout=8)
        self._screenshot("conversation_skill_chip_selected")

    def test_input_submit_renders_user_message_or_error(self):
        text = "minium ui smoke"
        self._input(INPUT_SELECTOR, text, timeout=12)
        self._tap(SEND_SELECTOR, timeout=8)
        time.sleep(2)
        data = self._page_data()
        messages = data.get("messages") or []
        rendered_texts = [str(item.get("text") or "") for item in messages if isinstance(item, dict)]
        has_user_message = any(text in item for item in rendered_texts)
        has_error_fallback = any(("失败" in item or "重试" in item or "超时" in item) for item in rendered_texts)
        self.assertTrue(has_user_message or has_error_fallback, messages)
        self._screenshot("conversation_submit")

    def test_asset_route_can_render_quick_replies_or_artifact_state(self):
        self._page = self._open_conversation("routeAction=asset_radar")
        time.sleep(2)
        data = self._page_data()
        messages = data.get("messages") or []
        quick_replies = data.get("quickReplies") or []
        has_card_state = any(
            isinstance(item, dict)
            and item.get("type") in ("artifact_card", "policy_opportunity_card", "login_card", "agent")
            for item in messages
        )
        self.assertTrue(quick_replies or has_card_state, data)
        self._screenshot("conversation_asset_route")

    def test_artifact_card_selector_contract_when_present(self):
        card = self._maybe_get("[data-minium-role='artifact-card']", timeout=3)
        if not card:
            self.skipTest("artifact card is not present in the initial read-only state")
        self._screenshot("conversation_artifact_card")


if __name__ == "__main__":
    unittest.main()
