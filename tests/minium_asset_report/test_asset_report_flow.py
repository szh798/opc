import base64
import json
import os
import time
import unittest

import minium
import requests


BACKEND_BASE_URL = os.getenv("OPC_BACKEND_BASE_URL", "http://127.0.0.1:3000")
REPORT_TIMEOUT_SECONDS = int(os.getenv("OPC_ASSET_REPORT_TIMEOUT_SECONDS", "240"))
POLL_INTERVAL_SECONDS = float(os.getenv("OPC_ASSET_REPORT_POLL_SECONDS", "3"))
MIN_REPORT_CHARS = int(os.getenv("OPC_ASSET_REPORT_MIN_CHARS", "3000"))

ASSET_REPORT_PROMPT = """我想完成一轮真实的资产盘点，并最终拿到资产报告。

我的真实背景：
我正在做一个叫一树 OPC 的创业者指导小程序，目标用户是想做一人公司、副业、AI 自动化或小成本创业的人。这个项目已经有小程序前端、NestJS 后端、Prisma 数据库、PostgreSQL、本地开发环境、Dify 工作流接入、资产盘点、路由对话、档案页、报告页等模块。

能力资产：
1. 我能把模糊的创业产品想法拆成页面、组件、接口、数据库表、状态机和用户流程。
2. 我能独立搭建微信小程序前端、NestJS 后端、Prisma 数据库和 Dify 工作流。
3. 我能定位工程问题，比如端口占用、Prisma 命令找不到、Dify key 无效、mock 和真实流混淆。
4. 我能把对话产品设计成用户状态、触发条件、交付物和下一步行动。

资源资产：
1. 我已经有一个接近可运行的一树 OPC 项目。
2. 我有微信开发者工具、本地后端、PostgreSQL、Dify 工作流和真实 API key。
3. 我有完整的产品文档、架构文档、资产盘点 DSL、提示词和测试脚本。
4. 我可以把开发过程、踩坑过程、产品方法论沉淀成内容吸引同频用户。

认知资产：
1. 我相信一人公司的核心是资产复用、自动化、低成本验证和持续交付。
2. 我理解 AI 产品的价值不是简单聊天，而是在关键节点生成报告、计划、判断和下一步行动。
3. 我知道先跑通真实闭环，比一开始追求完整大系统更重要。
4. 我适合做方法论 + 工具链 + 产品化服务，而不是纯体力型外包。

关系资产：
1. 我能接触到创业者、产品人、开发者、自由职业者和想做副业的人。
2. 我可以找熟人试用一树 OPC，收集第一批真实反馈。
3. 我可以通过项目过程内容吸引对 AI 工具、一人公司、小程序、自动化工作流感兴趣的人。
4. 我未来可以围绕 AI 工具搭建、小程序 MVP、Dify 工作流、创业者资产盘点做轻咨询或产品化服务。

请基于以上信息完成本轮资产盘点，输出结构化的 profile_snapshot、dimension_reports 和 report_brief。信息已经足够，请不要继续追问，直接收口本轮盘点并生成资产报告。"""


class TestAssetReportFlow(minium.MiniTest):
    """Minium e2e: route to asset flow -> send prompt from UI -> wait pending/ready -> open report."""

    def setUp(self):
        self._reset_storage()
        self._page = self._open_conversation()
        self._wait(2)

    def _wait(self, seconds):
        time.sleep(seconds)

    def _open_conversation(self, query=""):
        path = "/pages/conversation/conversation"
        if query:
            path = f"{path}?{query.lstrip('?')}"
        try:
            return self.app.relaunch(path)
        except AttributeError:
            return self.app.redirect_to(path)

    def _open_profile(self):
        try:
            return self.app.relaunch("/pages/profile/profile")
        except AttributeError:
            return self.app.redirect_to("/pages/profile/profile")

    def _reset_storage(self):
        try:
            self.app.call_wx_method("clearStorageSync")
        except Exception:
            pass

    def _current_page(self):
        return (
            getattr(self, "_page", None)
            or getattr(self, "page", None)
            or getattr(self.mini, "page", None)
            or getattr(self.app, "page", None)
        )

    def _refresh_page_reference(self):
        self._page = None
        return self._current_page()

    def _page_data(self):
        return getattr(self._current_page(), "data", {}) or {}

    def _get(self, selector, timeout=10):
        return self._current_page().get_element(selector, max_timeout=timeout)

    def _tap(self, selector, timeout=10):
        element = self._get(selector, timeout=timeout)
        try:
            element.click()
        except Exception:
            element.tap()

    def _input(self, selector, text, timeout=10):
        element = self._get(selector, timeout=timeout)
        try:
            element.input(text)
        except Exception:
            element.fill(text)

    def _login_if_needed(self):
        nickname = f"minium_asset_{int(time.time())}"
        response = requests.post(
            f"{BACKEND_BASE_URL}/auth/wechat-login",
            json={
                "simulateFreshUser": True,
                "nickname": nickname
            },
            timeout=15,
        )
        response.raise_for_status()
        login_data = response.json()
        access_token = str(login_data.get("accessToken") or "").strip()
        self.assertTrue(access_token, login_data)
        self._access_token = access_token
        self._user_id = self._extract_user_id(login_data, access_token)
        self.app.call_wx_method("setStorageSync", ["opc_access_token", access_token])
        self._wait(1)

    def _extract_user_id(self, login_data, access_token):
        user = login_data.get("user") if isinstance(login_data, dict) else {}
        user_id = str((user or {}).get("id") or login_data.get("userId") or "").strip()
        if user_id:
            return user_id
        try:
            payload = access_token.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            decoded = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8"))
            return str(decoded.get("sub") or "").strip()
        except Exception:
            return ""

    def _storage_token(self):
        try:
            token = self.app.call_wx_method("getStorageSync", ["opc_access_token"])
            return str(token or "").strip()
        except Exception:
            return ""

    def _headers(self):
        token = getattr(self, "_access_token", "") or self._storage_token()
        if not token:
            return {}
        return {"Authorization": f"Bearer {token}"}

    def _backend_get(self, path):
        response = requests.get(
            f"{BACKEND_BASE_URL}{path}",
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    def _session_id_from_page(self):
        data = self._page_data()
        return str(data.get("conversationStateId") or "").strip()

    def _wait_for_session_id(self, timeout=20):
        deadline = time.time() + timeout
        while time.time() < deadline:
            session_id = self._session_id_from_page()
            if session_id:
                return session_id
            time.sleep(1)
        self.fail("conversation page did not initialize a router session")

    def _assert_router_is_asset(self, session_id):
        snapshot = self._backend_get(f"/router/sessions/{session_id}")
        self.assertEqual(snapshot.get("agentKey"), "asset", snapshot)
        self.assertEqual(snapshot.get("chatflowId"), "cf_asset_inventory", snapshot)

    def _enter_asset_flow(self):
        self._page = self._open_conversation("routeAction=asset_radar")
        self._wait(5)

    def _send_asset_prompt_from_ui(self):
        self._input(".conversation-footer .composer__input", ASSET_REPORT_PROMPT, timeout=20)
        self._tap(".conversation-footer .composer__send", timeout=10)

    def _wait_for_pending_then_ready(self, session_id):
        deadline = time.time() + REPORT_TIMEOUT_SECONDS
        timeline = []
        saw_pending = False
        last_status_key = ""

        while time.time() < deadline:
            backend_status = self._backend_get(f"/router/sessions/{session_id}/asset-report/status")
            page_status = str(self._page_data().get("assetReportStatus") or "").lower().strip()
            report_status = str(backend_status.get("reportStatus") or "").lower().strip()
            key = f"{report_status}|{backend_status.get('inventoryStage') or ''}|{backend_status.get('lastError') or ''}"
            if key != last_status_key:
                timeline.append({
                    "at": time.time(),
                    "backend": report_status,
                    "page": page_status,
                    "inventoryStage": str(backend_status.get("inventoryStage") or ""),
                    "reportVersion": str(backend_status.get("reportVersion") or ""),
                    "lastError": str(backend_status.get("lastError") or "")
                })
                last_status_key = key

            if report_status == "pending":
                saw_pending = True

            if report_status == "ready":
                self.assertTrue(saw_pending, timeline)
                return backend_status, timeline

            if report_status == "failed":
                self.fail(f"asset report failed: {backend_status}")

            time.sleep(POLL_INTERVAL_SECONDS)

        self.fail(f"asset report did not become ready in time, timeline={timeline}")

    def _assert_report_card_rendered(self):
        try:
            self._get("#artifact-card-open_asset_report", timeout=30)
            return
        except Exception:
            pass

        data = self._page_data()
        messages = data.get("messages") if isinstance(data, dict) else []
        has_report_card = any(
            isinstance(message, dict)
            and message.get("type") == "artifact_card"
            and message.get("primaryAction") == "open_asset_report"
            for message in (messages or [])
        )
        self.assertTrue(has_report_card, f"open_asset_report card was not rendered, messages={messages}")

    def _open_report_from_card(self):
        self._tap("#artifact-primary-button", timeout=15)
        deadline = time.time() + 15
        while time.time() < deadline:
            self._refresh_page_reference()
            data = self._page_data()
            profile = data.get("profile") if isinstance(data, dict) else None
            if isinstance(profile, dict):
                return profile
            time.sleep(1)
        self.fail("did not navigate to profile page after tapping asset report card")

    def _assert_profile_report_quality(self, profile=None):
        current_profile = profile if isinstance(profile, dict) else self._backend_get("/profile")
        asset_report = current_profile.get("assetReport") if isinstance(current_profile, dict) else {}
        self.assertTrue(asset_report.get("hasReport"), asset_report)
        final_report = str(asset_report.get("finalReport") or "")
        self.assertGreaterEqual(len(final_report), MIN_REPORT_CHARS, len(final_report))
        self.assertNotIn("<think", final_report.lower())
        self.assertEqual(str(asset_report.get("reportVersion") or "").strip(), "1", asset_report)

        sections = asset_report.get("sections") or []
        self.assertGreaterEqual(len(sections), 5, sections)
        titles = [str(item.get("title") or "") for item in sections if isinstance(item, dict)]
        for keyword in ["能力", "资源", "认知", "关系", "总"]:
            self.assertTrue(any(keyword in title for title in titles), titles)
        for section in sections:
            if not isinstance(section, dict):
                continue
            lines = section.get("lines") or []
            self.assertTrue(lines, sections)

    def test_asset_report_generation(self):
        requests.get(f"{BACKEND_BASE_URL}/health", timeout=10).raise_for_status()

        self._login_if_needed()
        self._enter_asset_flow()
        session_id = self._wait_for_session_id()
        self._assert_router_is_asset(session_id)

        self._send_asset_prompt_from_ui()
        report_status, timeline = self._wait_for_pending_then_ready(session_id)

        self.assertEqual(report_status.get("reportStatus"), "ready", report_status)
        self.assertTrue(report_status.get("lastReportAt"), report_status)
        self.assertEqual(str(report_status.get("reportVersion") or "").strip(), "1", report_status)
        self.assertGreaterEqual(len(timeline), 2, timeline)

        self._assert_report_card_rendered()
        profile_from_page = self._open_report_from_card()
        self._assert_profile_report_quality(profile_from_page)


if __name__ == "__main__":
    unittest.main()
