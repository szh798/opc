# Minium 资产报告自动化测试

这套用例现在分成两层：

1. `test_asset_report_flow`
   从真实小程序会话页进入 `asset_radar`，用 UI 发送资产盘点输入，验证：
   - 当前 session 真的走到 `agentKey=asset / chatflowId=cf_asset_inventory`
   - `/asset-report/status` 真的经历 `pending -> ready`
   - 会话页插入 `open_asset_report` 卡片
   - 点击“查看报告”后进入档案页
   - 档案页拿到的正式报告长度达到阈值，且章节结构完整

2. `test_asset_report_rendering`
   用 fixture 直接 seed 一份 `ready` 报告，稳定验证：
   - 对话页轮询 ready 后能插入报告卡
   - 点击卡片后能打开档案页
   - 档案页按 section 渲染 5 段报告，而不是退回纯文本 fallback

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

只跑真实链路 UI：

```powershell
minitest -m tests.minium_asset_report.test_asset_report_flow -c tests\minium_asset_report\config.json -g
```

只跑稳定渲染链路：

```powershell
minitest -m tests.minium_asset_report.test_asset_report_rendering -c tests\minium_asset_report\config.json -g
```

按 suite 跑两层：

```powershell
minitest -s tests\minium_asset_report\suite.json -c tests\minium_asset_report\config.json -g
```

## 关键环境变量

- `OPC_BACKEND_BASE_URL`
- `OPC_ASSET_REPORT_TIMEOUT_SECONDS`
- `OPC_ASSET_REPORT_POLL_SECONDS`
- `OPC_ASSET_REPORT_MIN_CHARS`

默认阈值：

- 报告超时：`240s`
- 轮询间隔：`3s`
- 最小报告长度：`3000` 字符

## 调试点

如果失败，先看：

```powershell
Get-Content backend\backend-dev.err.log -Tail 80
Get-Content backend\backend-dev.out.log -Tail 120
```

常见失败：

- `Access token is invalid`: Dify key 或登录态异常
- 一直卡在 `idle/pending`: 报告工作流慢，或资产盘点未真正收口
- 找不到 `open_asset_report` 卡片：后端 ready 了，但前端轮询或卡片渲染没完成
- 打开卡片后没进入档案页：导航链路或页面加载失败
