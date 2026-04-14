/**
 * 资产报告生成 (Dify 4-报告生成流) 端到端 smoke 脚本
 *
 * 目的：直接调用 Dify workflow 4-报告生成流，用真实且完整的输入参数
 *       跑通整条工作流，把 final_report 正文落到本地 markdown 文件。
 *
 * 与 asset-inventory-three-path-smoke.js 的区别：
 *   那个脚本只测试 router 是否路由到了正确的 chatflow (1/2/3)，
 *   这个脚本才真正触发 workflow 4 并验证产出。
 *
 * 用法：
 *   cd backend && node scripts/asset-report-generation-smoke.js
 *
 * 依赖的环境变量 (来自 backend/.env)：
 *   DIFY_API_BASE_URL         - 例如 http://localhost:8080/v1
 *   DIFY_API_KEY_ASSET_REPORT - Dify 4-报告生成流 的 app key
 */

const fs = require("node:fs");
const path = require("node:path");

const axios = require("axios");

// 从 backend/.env 加载环境变量
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const baseUrl = String(process.env.DIFY_API_BASE_URL || "").replace(/\/+$/, "");
const apiKey = String(process.env.DIFY_API_KEY_ASSET_REPORT || "").trim();
const timeoutMs = Number(process.env.DIFY_REQUEST_TIMEOUT_MS || 300000);
const reportPath = path.join(__dirname, "..", "reports", "asset-report-generation-sample.md");

function log(line) {
  // eslint-disable-next-line no-console
  console.log(line);
}

function buildFirstInventoryInputs() {
  return {
    case: "首次盘点 (firstInventory)",
    inputs: {
      profile_snapshot: [
        "【真实案例】",
        "- 案例1: 独立从 0 到 1 搭建公司内部 OKR 平台，3 个月内覆盖 200+ 员工",
        "- 案例2: 业余时间做技术博客，半年涨粉 5000，单篇最高阅读 8万",
        "",
        "【能力资产】",
        "- 产品设计 + 前端落地全链路",
        "- 技术写作与内容传播",
        "- 小团队从 0 到 1 的推进力",
        "",
        "【资源资产】",
        "- 技术博客 5000 订阅用户",
        "- 前同事 CTO 人脉 x3",
        "",
        "【认知资产】",
        "- 对开发者工具市场有独立判断",
        "- 熟悉 B 端 SaaS 冷启动打法",
        "",
        "【关系资产】",
        "- 3 位潜在合伙人愿意长期交流",
        "- 前老板是早期天使投资人候选"
      ].join("\n"),
      dimension_reports: [
        "## 能力维度",
        "- 强点: 产品设计 + 前端工程双栖，能独立交付",
        "- 弱点: 后端深度与团队管理经验不足",
        "- 证据: OKR 平台上线后零故障运行 6 个月",
        "",
        "## 资源维度",
        "- 强点: 有一个 5000 人的技术受众",
        "- 弱点: 未变现，未积累付费用户名单",
        "- 证据: 博客 Google Analytics 留存率 35%",
        "",
        "## 认知维度",
        "- 强点: 对 DevTools / B 端 SaaS 有自己的叙事",
        "- 弱点: 商业化经验不足，未主导过定价",
        "- 证据: 多篇博客被头部产品经理引用",
        "",
        "## 关系维度",
        "- 强点: 高质量弱连接多 (前同事 CTO、技术大V)",
        "- 弱点: 缺乏深度合作关系，没共同推进过项目",
        "- 证据: 3 位潜在合伙人建立了月度交流节奏"
      ].join("\n"),
      report_brief:
        "用户是技术+产品双栖的独立贡献者，核心优势在于从 0 到 1 的交付能力与技术内容沉淀，短板是商业化经验与团队管理。" +
        "建议先用博客受众做小规模付费产品验证，借助前 CTO 关系补齐后端/团队能力，再考虑是否进入 DevTools 创业赛道。",
      change_summary: "",
      report_version: "1",
      is_review: "false"
    }
  };
}

function buildReviewUpdateInputs() {
  return {
    case: "复盘更新 (reviewUpdate)",
    inputs: {
      profile_snapshot: [
        "【能力资产】",
        "- 产品设计 + 前端落地全链路 (已验证)",
        "- 技术写作与内容传播 (已验证)",
        "- 新增: AI 应用集成能力 (近 3 个月上线 2 个内部工具)",
        "",
        "【资源资产】",
        "- 技术博客 8000 订阅用户 (+3000)",
        "- 新增: 小红书 2000 粉丝",
        "",
        "【认知资产】",
        "- 对开发者工具市场有独立判断",
        "- 新增: 对 AI 工作流产品有一线上手经验",
        "",
        "【关系资产】",
        "- 3 位潜在合伙人",
        "- 新增: 认识 1 位 Agent 方向早期投资人"
      ].join("\n"),
      dimension_reports: [
        "## 能力维度",
        "- 相比上版: 新增 AI 应用集成维度",
        "- 证据: 交付 2 个内部 AI 工具，用户 NPS 65",
        "",
        "## 资源维度",
        "- 相比上版: 受众规模 +60%，多渠道布局启动",
        "",
        "## 认知维度",
        "- 相比上版: 从旁观者变成 AI 应用一线实践者",
        "",
        "## 关系维度",
        "- 相比上版: 新增一位投资人 warm connection"
      ].join("\n"),
      report_brief:
        "用户能力结构从纯技术产品型向 AI 原生应用型迁移，资源规模翻倍并开始多渠道布局。建议围绕 AI 工具方向收敛，把新关系转化为第一笔合作。",
      change_summary:
        "近 3 个月最大的变化是:(1) 深度上手 AI 应用开发并交付了 2 个真实产品;(2) 内容受众规模 +60% 且开始多渠道布局;" +
        "(3) 新增一位 Agent 方向的早期投资人 warm connection。",
      report_version: "2",
      is_review: "true"
    }
  };
}

async function runCase(caseConfig) {
  log(`\n========== ${caseConfig.case} ==========`);
  log(`POST ${baseUrl}/workflows/run`);
  log(`inputs keys: ${Object.keys(caseConfig.inputs).join(", ")}`);

  const start = Date.now();
  let response;
  try {
    response = await axios.post(
      `${baseUrl}/workflows/run`,
      {
        inputs: caseConfig.inputs,
        response_mode: "blocking",
        user: `smoke-asset-report-${Date.now()}`
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: timeoutMs,
        validateStatus: () => true
      }
    );
  } catch (error) {
    log(`[FAIL] HTTP error: ${error.message}`);
    throw error;
  }

  const elapsedMs = Date.now() - start;
  log(`HTTP ${response.status} in ${elapsedMs}ms`);

  if (response.status !== 200) {
    log(`[FAIL] non-200 response:`);
    log(JSON.stringify(response.data, null, 2));
    throw new Error(`${caseConfig.case} returned HTTP ${response.status}`);
  }

  const data = response.data && typeof response.data === "object" ? response.data : {};
  const execution = data.data && typeof data.data === "object" ? data.data : {};
  const outputs = execution.outputs && typeof execution.outputs === "object" ? execution.outputs : {};
  const status = String(execution.status || "");
  const finalReport = String(outputs.final_report || "").trim();

  log(`workflow status: ${status}`);
  log(`final_report length: ${finalReport.length} chars`);

  if (status !== "succeeded") {
    log(`[FAIL] workflow status is not "succeeded"`);
    log(`execution error: ${execution.error || "(none)"}`);
    throw new Error(`${caseConfig.case} workflow status: ${status}`);
  }

  if (!finalReport) {
    log(`[FAIL] final_report is empty`);
    throw new Error(`${caseConfig.case} produced empty final_report`);
  }

  // 回归断言：这个脚本直接调用 Dify /workflows/run，返回的是 outputs 原文，
  // 不经过 router.service.ts 的 <think> 剥离逻辑。因此这里的 final_report 仍会
  // 包含 <think>...</think> 段（这是模型行为）。我们要验证的是——一旦模型
  // 某天去掉了这个段，或 Dify 工作流内部加了剥离——脚本能继续跑；同时要保证
  // 后端侧（router.service.ts）的剥离逻辑在 integration 时能真正生效。
  //
  // 所以这里做两层检查：
  //   (a) 如果 final_report 里出现了 <think>，提示这是 raw 输出，走后端路径时
  //       会被 router.service.ts 剥离 —— 信息性日志，不算失败；
  //   (b) 模拟后端剥离逻辑，验证剥离后仍有实质内容，并且不再包含 <think>。
  const hasThinkTag = /<think\b[^>]*>[\s\S]*?<\/think>/i.test(finalReport);
  const stripped = finalReport.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
  log(`contains <think> block: ${hasThinkTag}`);
  log(`final_report length after <think> strip: ${stripped.length} chars`);

  if (/<think\b/i.test(stripped)) {
    log(`[FAIL] <think> tag survived the strip regex — router.service.ts fix would not work`);
    throw new Error(`${caseConfig.case} <think> strip regex is incomplete`);
  }
  if (!stripped) {
    log(`[FAIL] final_report is empty after stripping <think> block`);
    throw new Error(`${caseConfig.case} produced only <think> content`);
  }

  log(`[PASS] ${caseConfig.case}`);
  return {
    case: caseConfig.case,
    status,
    elapsedMs,
    finalReport,
    inputs: caseConfig.inputs
  };
}

function writeMarkdownReport(results) {
  const lines = [
    "# Asset Report Generation Smoke Report",
    "",
    `- Generated At: ${new Date().toISOString()}`,
    `- Dify Base URL: \`${baseUrl}\``,
    `- Cases: ${results.length}`,
    ""
  ];

  for (const r of results) {
    lines.push(`## ${r.case}`);
    lines.push(`- Status: \`${r.status}\``);
    lines.push(`- Elapsed: \`${r.elapsedMs}ms\``);
    lines.push(`- Final Report Length: \`${r.finalReport.length}\` chars`);
    lines.push("");
    lines.push("### Inputs");
    lines.push("```json");
    lines.push(JSON.stringify(r.inputs, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("### Final Report");
    lines.push(r.finalReport);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  return reportPath;
}

async function main() {
  if (!baseUrl) {
    throw new Error("DIFY_API_BASE_URL is not set (check backend/.env)");
  }
  if (!apiKey) {
    throw new Error("DIFY_API_KEY_ASSET_REPORT is not set (check backend/.env)");
  }

  log(`Dify base URL: ${baseUrl}`);
  log(`Using api key: ${apiKey.slice(0, 10)}...`);
  log(`Timeout: ${timeoutMs}ms`);

  const cases = [buildFirstInventoryInputs(), buildReviewUpdateInputs()];
  const results = [];
  for (const c of cases) {
    results.push(await runCase(c));
  }

  const file = writeMarkdownReport(results);
  log(`\n[PASS] all cases succeeded`);
  log(`[REPORT] ${file}`);
}

main().catch((error) => {
  log(`\n[FAIL] ${error && error.message ? error.message : String(error)}`);
  process.exitCode = 1;
});
