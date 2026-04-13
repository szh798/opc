# Router v2 API Contract（流程图补全版）

更新时间：2026-04-13

## 1. Session

### `POST /router/sessions`

用途：创建或恢复会话。  
关键返回字段：

- `sessionId`
- `conversationStateId`
- `agentKey`
- `routeMode`
- `chatflowId`
- `firstScreenMessages`
- `quickReplies`
- `assetReportStatus`
- `reportVersion`
- `lastReportAt`
- `lastError`
- `assetWorkflowKey`

### `GET /router/sessions/:id`

用途：读取会话快照。  
关键返回字段同上，并包含：

- `status`（`in_progress|completed|abandoned`）
- `moduleSessions`
- `recentMessages`

## 2. Stream

### `POST /router/sessions/:id/stream/start`

请求体：

```json
{
  "input": {
    "inputType": "text | quick_reply | agent_switch | system_event",
    "text": "string",
    "quickReplyId": "string",
    "routeAction": "string",
    "agentKey": "master|asset|execution|mindset|steward",
    "metadata": {}
  }
}
```

返回关键字段：

- `streamId`
- `agentKey`
- `routeMode`
- `chatflowId`
- `assetReportStatus`
- `lastError`

### `GET /router/streams/:streamId`

事件类型固定：

- `meta`
- `token`
- `card`
- `done`
- `error`

## 3. Deterministic actions

### `POST /router/sessions/:id/quick-reply`

请求体：

```json
{
  "quickReplyId": "qr-xxx",
  "routeAction": "route_explore | route_scale | route_park | asset_radar | trigger_review",
  "metadata": {}
}
```

### `POST /router/sessions/:id/agent-switch`

请求体：

```json
{
  "agentKey": "master|asset|execution|mindset|steward"
}
```

### `POST /router/sessions/:id/memory/inject-preview`

用途：联调期查看本轮将注入记忆。

## 4. Asset report async status（新增）

### `GET /router/sessions/:id/asset-report/status`

响应字段固定：

```json
{
  "assetWorkflowKey": "firstInventory|resumeInventory|reviewUpdate|reportGeneration",
  "inventoryStage": "opening|ability|resource|cognition|relationship|ready_for_report|report_generated",
  "reportStatus": "idle|pending|ready|failed",
  "reportVersion": "string",
  "lastReportAt": "ISO datetime",
  "lastError": "string"
}
```

## 5. Dify interface reservation

后端转发给 Dify 的字段规范：

- 主对话：`query + conversation_id + inputs + user`
- `firstInventory`：`intake_summary`
- `resumeInventory`：`prev_stage`, `prev_profile_snapshot`, `prev_dimension_reports`, `prev_next_question`
- `reviewUpdate`：`old_profile_snapshot`, `old_dimension_reports`, `last_report_date`, `review_version`
- `reportGeneration`：`profile_snapshot`, `dimension_reports`, `report_brief`, `change_summary`, `report_version`, `is_review`

完成标记协议（后端内部）：

- `INVENTORY_COMPLETE`
- `REVIEW_COMPLETE`
