# 资产盘点 Dify 工作流拆分方案

## 总览

将原来的单体 `资产盘点流.dsl.yml` 拆分为 **4 个独立工作流**，各司其职：

| # | 文件名 | 类型 | 触发条件 | 输出标志位 |
|---|--------|------|----------|-----------|
| 1 | `1-首次资产盘点流.dsl.yml` | advanced-chat | 新用户首次进入盘点 | `[INVENTORY_COMPLETE]` / `[USER_REFUSED_INVENTORY]` |
| 2 | `2-断点续盘流.dsl.yml` | advanced-chat | 用户上次没做完回来继续 | `[INVENTORY_COMPLETE]` / `[USER_REFUSED_INVENTORY]` |
| 3 | `3-复盘更新流.dsl.yml` | advanced-chat | 老用户主动发起复盘 | `[REVIEW_COMPLETE]` |
| 4 | `4-报告生成流.dsl.yml` | workflow | 上述任一流完成后由后端调用 | `final_report` 文本 |
| 5 | `5-通用兜底对话流.dsl.yml` | advanced-chat | 首登状态选择页自由输入兜底 | `[HANDOFF_TO_ASSET_INVENTORY]` / `[HANDOFF_TO_PARK]` / `[STAY_IN_FALLBACK]` |
| 6 | `6-闲聊收集流.dsl.yml` | advanced-chat | 用户拒绝结构化盘点后由本流暗中收集信息 | `[GOTO_ASSET_INVENTORY]` / `[GOTO_PARK]` / `[GOTO_EXECUTION]` / `[GOTO_MINDSET]` / `[STAY_IN_FREE_CHAT]` |
| 7 | `7-生意体检流.dsl.yml` | advanced-chat | 用户披露已有生意后由资产盘点分叉进入 | `[BUSINESS_HEALTH_COMPLETE]` / `[GOTO_EXECUTION]` / `[GOTO_MINDSET]` / `[RESIST_PARK_REDIRECT]` / `[STAY_IN_BUSINESS_HEALTH]` |

## 架构图

```
主对话流 → 后端 Router 判断 → ┬─ 首次盘点流 ─┐
                              ├─ 断点续盘流 ─┤→ 后端检测完成标志 → 报告生成流 → 写入DB
                              └─ 复盘更新流 ─┘
```

## 后端路由伪代码

```typescript
async function routeToInventory(userId: string, action: string) {
  const inventory = await db.inventory.findUnique({ where: { userId } });

  if (action === 'trigger_review' && inventory?.status === 'completed') {
    // 情况3: 用户主动复盘
    return difyClient.invoke('3-复盘更新流', {
      old_profile_snapshot: inventory.profileSnapshot,
      old_dimension_reports: inventory.dimensionReports,
      last_report_date: inventory.completedAt,
      review_version: String(inventory.version + 1),
    });
  }

  if (inventory?.status === 'in_progress') {
    // 情况2: 断点续传
    return difyClient.invoke('2-断点续盘流', {
      prev_stage: inventory.currentStage,
      prev_profile_snapshot: inventory.profileSnapshot,
      prev_dimension_reports: inventory.dimensionReports,
      prev_next_question: inventory.nextQuestion,
      backend_ready_for_report: 'false',
    });
  }

  // 情况1: 首次盘点
  return difyClient.invoke('1-首次资产盘点流', {
    intake_summary: mainFlowContext?.summary || '',
    backend_ready_for_report: 'false',
  });
}
```

## 后端检测完成 → 调用报告生成

```typescript
async function handleChatResponse(userId: string, response: string) {
  if (response.includes('[INVENTORY_COMPLETE]') || response.includes('[REVIEW_COMPLETE]')) {
    const inventory = await db.inventory.findUnique({ where: { userId } });

    const report = await difyClient.invokeWorkflow('4-报告生成流', {
      profile_snapshot: inventory.profileSnapshot,
      dimension_reports: inventory.dimensionReports,
      report_brief: inventory.reportBrief,
      change_summary: inventory.changeSummary || '',
      report_version: String(inventory.version),
      is_review: response.includes('[REVIEW_COMPLETE]') ? 'true' : 'false',
    });

    await db.report.create({
      data: { userId, content: report.final_report, version: inventory.version }
    });

    return report.final_report;
  }
}
```

## 导入到 Dify 的步骤

1. 打开 Dify 控制台
2. 点击"创建应用" → "导入 DSL"
3. 依次导入 4 个 yml 文件
4. 在 Dify 中获取每个应用的 API Key 和 App ID
5. 将这些 Key 配置到后端的环境变量中：

   - `DIFY_API_KEY_ASSET_FIRST` → `1-首次资产盘点流.dsl.yml`
   - `DIFY_API_KEY_ASSET_RESUME` → `2-断点续盘流.dsl.yml`
   - `DIFY_API_KEY_ASSET_REVIEW` → `3-复盘更新流.dsl.yml`
   - `DIFY_API_KEY_ASSET_REPORT` → `4-报告生成流.dsl.yml`
   - `DIFY_API_KEY_ONBOARDING_FALLBACK` → `5-通用兜底对话流.dsl.yml`
   - `DIFY_API_KEY_INFO_COLLECTION` → `6-闲聊收集流.dsl.yml`
   - `DIFY_API_KEY_BUSINESS_HEALTH` → `7-生意体检流.dsl.yml`

## 各工作流入参说明

### 1-首次资产盘点流
| 参数 | 必填 | 说明 |
|------|------|------|
| `intake_summary` | 否 | 主对话流聊天中收集到的用户背景摘要 |
| `backend_ready_for_report` | 否 | 后端是否已判定四个维度完成且可出报告，传 `'true'`/`'false'` |

### 2-断点续盘流
| 参数 | 必填 | 说明 |
|------|------|------|
| `prev_stage` | 是 | 上次停在哪个阶段 |
| `prev_profile_snapshot` | 是 | 上次的资产画像快照 |
| `prev_dimension_reports` | 否 | 上次的维度小报告 |
| `prev_next_question` | 否 | 上次准备问的下一个问题 |
| `backend_ready_for_report` | 否 | 后端是否已判定四个维度完成且可出报告，传 `'true'`/`'false'` |

### 3-复盘更新流
| 参数 | 必填 | 说明 |
|------|------|------|
| `old_profile_snapshot` | 是 | 旧的完整资产画像 |
| `old_dimension_reports` | 是 | 旧的四维小报告 |
| `last_report_date` | 否 | 上次报告时间 |
| `review_version` | 否 | 复盘版本号 |

### 4-报告生成流
| 参数 | 必填 | 说明 |
|------|------|------|
| `profile_snapshot` | 是 | 完整资产画像快照 |
| `dimension_reports` | 是 | 四维小报告全文 |
| `report_brief` | 是 | 报告摘要 |
| `change_summary` | 否 | 变更摘要（仅复盘时） |
| `report_version` | 否 | 版本号 |
| `is_review` | 否 | 是否为复盘更新 |

## 注意事项

1. **报告生成流是 Workflow 模式，不是 Chatflow**——它不需要多轮对话，后端直接传入数据、拿到结果即可。
2. **流 1/2/3 的结构化输出 schema 完全一致**（除了复盘流多了 `change_summary`），方便后端用统一的解析逻辑。
3. **`[INVENTORY_COMPLETE]` 和 `[REVIEW_COMPLETE]` 是给后端看的隐式标记**，后端需要截取并替换掉这些标记，不要展示给用户。
4. 所有流使用的模型都是 `glm-5`（智谱），如需更换请统一修改。
5. **首次盘点流的 `ready_for_report` 由后端判定**：LLM 只在收到 `backend_ready_for_report='true'` 时才允许输出 `ready_for_report`。
6. **断点续盘流的 `ready_for_report` 也由后端判定**：与首次盘点流保持一致，避免 LLM 自行估计是否已完成。
