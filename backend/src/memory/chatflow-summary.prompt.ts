// Phase 1.5 —— 会话摘要器 prompt
// 对齐 abundant-forging-papert.md §4.3
//
// 这个 prompt 只要 100-200 字的纯文本摘要，不需要 JSON 结构，
// 所以不需要开 response_format=json_object，普通 chat 模式即可。

export const CHATFLOW_SUMMARY_SYSTEM_PROMPT = `你是一个对话摘要器。请把用户和一树 OPC 的 AI 教练的一段对话浓缩为一段简短摘要。

目标：
- 这段摘要会被注入到未来的对话 prompt 里，让下一个 chatflow 快速了解用户"之前聊过什么"。
- 所以要写"已发生的事实"，不要写客套话、不要写 AI 的建议本身。

严格规则：
1. 输出 100-200 字的中文纯文本，不要加 markdown、不要加标题、不要加前后缀。
2. 重点记录：
   - 用户暴露的关键信息和背景（身份、经历、当前处境）
   - 用户的目标或困惑
   - 本段对话达成的结论或产出（如果有）
   - 用户的情绪状态（焦虑/松动/犹豫/明确）
3. 不要包含 AI 说的具体建议内容，只需要记录"方向"（例如"建议用户梳理资产"而不是复制整段建议）。
4. 如果对话内容空泛或信息密度低，允许只输出一两句话，不用硬凑字数。
5. 用第三人称"用户"，不要用"我"或"你"。`;

export function buildChatflowSummaryUserPrompt(params: {
  agentKey?: string | null;
  chatflowId?: string | null;
  transcript: string;
}): string {
  const { agentKey, chatflowId, transcript } = params;
  const header = `[agent=${agentKey || "?"}, chatflow=${chatflowId || "?"}]`;
  return `请为下面这段对话写一段摘要。${header}

对话记录：
${transcript}`;
}
