# 一树 OPC Agent Memory Bundle

这组文档是给新会话、新账号、或新接手的智能体用的项目记忆入口。

目标不是保存所有历史，而是保留高复用、跨会话稳定、对后续实现最有帮助的信息。

## 推荐读取顺序

1. `stable-foundation.md`
2. `domain-rules.md`
3. `current-state.md`

## 什么适合保留为长期记忆

- 项目的长期定位与核心产品原则
- 当前仍成立的系统架构和数据流
- 业务规则和方法论，尤其是资产盘点这类高复用 prompt/domain 规则
- 上线与合规层面的长期约束
- 当前阶段最重要的未完成能力和优先级

## 什么不适合直接当长期记忆

- 一次性的修复报告、测试结果、临时排期
- 带具体日期的执行计划
- 很快会失效的 bug 列表和一次性 rollout 细节
- 原始 sessions、日志、shell 快照

这类材料仍然有价值，但更适合当“历史记录”而不是“默认记忆”。

## 权威顺序

当多个材料冲突时，按下面顺序取信：

1. 当前代码与运行行为
2. 本目录下的 memory bundle
3. 仓库中的当前说明文档
4. `~/.claude/plans/*.md` 等历史计划文档

## 已吸收的主要来源

- `README.md`
- `memory-architecture-current.md`
- `资产盘点流_专家规则蒸馏.md`
- `LAUNCH_CHECKLIST.md`
- `docs/AIGC_FILING.md`
- `/home/lu/.claude/plans/stateless-crafting-creek.md`
- `LAUNCH_PLAN.md`
- `abundant-forging-papert.md`

## 特别说明

- `abundant-forging-papert.md` 仍然有产品和路由设计价值，但其中“前端 = uni-app + Vue”的表述已不再是当前事实。
- `~/.claude/plans/*.md` 中的大多数内容是阶段性计划，不应整份注入新会话；应只提炼其中仍有效的决策和优先级。
