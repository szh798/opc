# Minium 资产报告自动化测试

当前测试分两层：

1. `test_asset_report_flow`
   走真实小程序 UI，会进入 `asset_radar`，发送资产盘点输入，并验证会话、报告状态、卡片插入和档案页打开流程。

2. `test_asset_report_rendering`
   直接使用 fixture seed 一份 `ready` 报告，稳定验证报告卡片渲染和档案页 section 展示。

## 前置条件

后端已启动：

```powershell
cd D:\workspace\opc\backend
npm run dev
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

微信开发者工具 CLI 路径：

```text
D:\软件\微信web开发者工具\cli.bat
```

## 安装 Minium

```powershell
cd D:\workspace\opc
python -m pip install -r tests\minium_asset_report\requirements.txt
```

## 配置

复制配置：

```powershell
Copy-Item tests\minium_asset_report\config.example.json tests\minium_asset_report\config.json
```

确认 `project_path` 和 `dev_tool_path` 是本机真实路径。

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

## 调试

查看后端日志：

```powershell
Get-Content backend\backend-dev.err.log -Tail 80
Get-Content backend\backend-dev.out.log -Tail 120
```
