# Minium 资产报告自动化测试

这套用例覆盖：

1. 打开会话页
2. 模拟新用户登录
3. 通过 `routeAction=asset_radar` 强制进入资产盘点流
4. 发送一段完整资产盘点话术
5. 通过后端接口确认当前走的是 `agentKey=asset` / `chatflowId=cf_asset_inventory`
6. 轮询 `/router/sessions/:id/asset-report/status`
7. 等待 `reportStatus: ready`
8. 校验前端出现 `open_asset_report` 资产报告卡

## 前置条件

后端已启动：

```powershell
cd D:\OneDrive\桌面\opc1.1\opc\backend
npm run dev
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

`.env` 建议为真实 Dify 测试模式：

```env
DIFY_ENABLED=true
DEV_MOCK_DIFY=false
DIFY_API_KEY=
DIFY_API_KEY_ASSET_FIRST=...
DIFY_API_KEY_ASSET_RESUME=...
DIFY_API_KEY_ASSET_REVIEW=...
DIFY_API_KEY_ASSET_REPORT=...
```

微信开发者工具需要开启 CLI/服务端口能力。当前本机路径样例：

```text
D:\软件\微信web开发者工具\cli.bat
```

## 安装 Minium

当前机器如果没有 Python/Pip，请先安装 Python 3，并勾选 `Add Python to PATH`。

```powershell
cd D:\OneDrive\桌面\opc1.1\opc
python -m pip install -r tests\minium_asset_report\requirements.txt
```

## 配置

复制配置：

```powershell
Copy-Item tests\minium_asset_report\config.example.json tests\minium_asset_report\config.json
```

确认 `project_path` 和 `dev_tool_path` 是你本机真实路径。

## 运行

```powershell
cd D:\OneDrive\桌面\opc1.1\opc
minitest -m tests.minium_asset_report.test_asset_report_flow -c tests\minium_asset_report\config.json -g
```

或者按 suite 跑：

```powershell
minitest -s tests\minium_asset_report\suite.json -c tests\minium_asset_report\config.json -g
```

## 调试点

如果用例失败，先看：

```powershell
Get-Content backend\backend-dev.err.log -Tail 80
Get-Content backend\backend-dev.out.log -Tail 120
```

常见失败：

- `Access token is invalid`: 某个 Dify key 不对，或请求没有走资产流而走了全局/管家 key。
- 一直 `pending`: 报告生成 workflow 很慢，调大 `OPC_ASSET_REPORT_TIMEOUT_SECONDS`。
- 找不到 `#artifact-card-open_asset_report`: 后端报告已 ready，但前端轮询超时或卡片未渲染。

可临时调长超时：

```powershell
$env:OPC_ASSET_REPORT_TIMEOUT_SECONDS=300
minitest -m tests.minium_asset_report.test_asset_report_flow -c tests\minium_asset_report\config.json -g
```
