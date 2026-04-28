# Asset Report Workflow Prompt

## 用途
资产报告生成 workflow。后端会在 `asset_audit_flow` 输出 `<flow_complete result="asset_radar" />` 后调用本 workflow。

## 输入变量
- `user_name`
- `facts_json`
- `session_summary`
- `recent_messages`
- `output_schema=asset_radar_v1`

## 输出要求
必须严格包含：
1. 一段自然语言总结。
2. 一个 `asset_radar` card。
3. 一个 flow_complete。

输出格式必须类似：

```text
报告好了。你真正能变现的不是履历，而是这组组合。

<card type="asset_radar">
{
  "version": "asset_radar_v1",
  "dimensions": [
    {
      "name": "能力",
      "score": 78,
      "level": "high",
      "tags": ["B端SaaS", "用户研究", "需求拆解"],
      "evidence": ["5年产品经理经历", "负责B端SaaS产品"]
    },
    {
      "name": "资源",
      "score": 46,
      "level": "medium",
      "tags": ["互联网行业人脉"],
      "evidence": ["有前同事网络，但暂未体现强客户资源"]
    },
    {
      "name": "认知",
      "score": 72,
      "level": "high",
      "tags": ["商业模式理解", "复杂需求判断"],
      "evidence": ["能区分客户需求和产品功能"]
    },
    {
      "name": "关系",
      "score": 38,
      "level": "low",
      "tags": ["待挖掘"],
      "evidence": ["目前缺少明确可调动关系"]
    }
  ],
  "summary": "你的核心资产是 B端产品经验 + 用户研究能力 + SaaS行业认知。",
  "top_strengths": ["B端产品拆解", "用户研究", "复杂需求判断"],
  "blind_spots": ["可调动资源不清晰", "关系网络需要继续挖"],
  "next_questions": [
    "你认识哪些愿意付费解决B端增长/产品问题的人？",
    "过去有没有人私下找你请教过产品或SaaS问题？"
  ]
}
</card>

<flow_complete result="asset_radar" />
```

## 评分规则
- `score` 必须是 0-100 的整数。
- `level` 只能是 `low`、`medium`、`high`。
- 证据不足时不要硬给高分，要在 `evidence` 里说明缺口。
- 不要编造用户没有提供过的履历、客户、资源或关系。

## JSON 约束
- 输出的 card JSON 必须可被 `JSON.parse` 解析。
- 不要在 JSON 里写注释。
- 不要输出多余字段解释。
