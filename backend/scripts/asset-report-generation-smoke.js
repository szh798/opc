/**
 * 资产报告生成 (Dify 4-报告生成流) 端到端 smoke 脚本
 *
 * 目标：
 *   1. 直接调用真实 reportGeneration workflow
 *   2. 校验报告长度、章节结构、版本语义
 *   3. 同时输出 Markdown 摘要 + JSON 明细，便于长期回归
 *
 * 用法：
 *   cd backend && node scripts/asset-report-generation-smoke.js
 */

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const {
  summarizeReport,
  writeJsonReport
} = require("./asset-report-test-helpers");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const baseUrl = String(process.env.DIFY_API_BASE_URL || "").replace(/\/+$/, "");
const apiKey = String(process.env.DIFY_API_KEY_ASSET_REPORT || "").trim();
const timeoutMs = Number(process.env.DIFY_REQUEST_TIMEOUT_MS || 300000);
const minReportChars = Number(process.env.SMOKE_MIN_REPORT_CHARS || 3000);
const markdownReportPath = path.join(__dirname, "..", "reports", "asset-report-generation-sample.md");
const jsonReportPath = path.join(__dirname, "..", "reports", "asset-report-generation-sample.json");

function log(line) {
  // eslint-disable-next-line no-console
  console.log(line);
}

function buildFirstInventoryInputs() {
  return {
    scenario: "workflow_first_inventory",
    case: "首次盘点 (firstInventory)",
    expectedVersion: "1",
    expectedReview: false,
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
    scenario: "workflow_review_update",
    case: "复盘更新 (reviewUpdate)",
    expectedVersion: "2",
    expectedReview: true,
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

function assertWorkflowCase(caseConfig, result) {
  const failures = [];

  if (result.httpStatus !== 200) {
    failures.push(`http_${result.httpStatus}`);
  }
  if (result.workflowStatus !== "succeeded") {
    failures.push(`workflow_status_${result.workflowStatus || "empty"}`);
  }
  if (!result.reportSummary.sanitized) {
    failures.push("empty_final_report");
  }
  if (result.reportSummary.hasResidualThinkTag) {
    failures.push("residual_think_tag");
  }
  if (result.reportSummary.sanitizedLength < minReportChars) {
    failures.push(`report_too_short_${result.reportSummary.sanitizedLength}`);
  }
  if (!result.reportSummary.coverage.ok) {
    failures.push(`missing_sections_${result.reportSummary.coverage.missing.join("_")}`);
  }
  if (result.reportSummary.emptySections.length > 0) {
    failures.push(`empty_sections_${result.reportSummary.emptySections.join("_")}`);
  }
  if (String(caseConfig.inputs.report_version || "") !== caseConfig.expectedVersion) {
    failures.push("input_version_mismatch");
  }
  if (String(caseConfig.inputs.is_review || "").toLowerCase() !== String(caseConfig.expectedReview)) {
    failures.push("input_review_flag_mismatch");
  }

  return {
    pass: failures.length === 0,
    failureReason: failures.join(", ")
  };
}

async function runCase(caseConfig) {
  log(`\n========== ${caseConfig.case} ==========`);
  log(`POST ${baseUrl}/workflows/run`);
  log(`inputs keys: ${Object.keys(caseConfig.inputs).join(", ")}`);

  const startedAt = Date.now();
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
    throw new Error(`[${caseConfig.case}] HTTP error: ${error.message}`);
  }

  const elapsedMs = Date.now() - startedAt;
  const data = response.data && typeof response.data === "object" ? response.data : {};
  const execution = data.data && typeof data.data === "object" ? data.data : {};
  const outputs = execution.outputs && typeof execution.outputs === "object" ? execution.outputs : {};
  const rawFinalReport = String(outputs.final_report || "");
  const reportSummary = summarizeReport(rawFinalReport);

  const result = {
    scenario: caseConfig.scenario,
    case: caseConfig.case,
    httpStatus: response.status,
    workflowStatus: String(execution.status || ""),
    elapsedMs,
    reportVersion: String(caseConfig.inputs.report_version || ""),
    isReview: String(caseConfig.inputs.is_review || "").toLowerCase() === "true",
    reportSummary,
    inputs: caseConfig.inputs,
    rawExecutionError: String(execution.error || "")
  };
  const assertion = assertWorkflowCase(caseConfig, result);
  result.pass = assertion.pass;
  result.failureReason = assertion.failureReason;

  log(`HTTP ${response.status} in ${elapsedMs}ms`);
  log(`workflow status: ${result.workflowStatus}`);
  log(`final_report raw length: ${reportSummary.rawLength} chars`);
  log(`final_report sanitized length: ${reportSummary.sanitizedLength} chars`);
  log(`section titles: ${reportSummary.sectionTitles.join(" | ") || "(none)"}`);

  if (!result.pass) {
    throw new Error(`${caseConfig.case} failed: ${result.failureReason || "unknown_failure"}`);
  }

  log(`[PASS] ${caseConfig.case}`);
  return result;
}

function writeMarkdownReport(results) {
  const lines = [
    "# Asset Report Generation Smoke Report",
    "",
    `- Generated At: ${new Date().toISOString()}`,
    `- Dify Base URL: \`${baseUrl}\``,
    `- Min Report Length: \`${minReportChars}\` chars`,
    `- Cases: ${results.length}`,
    ""
  ];

  results.forEach((result) => {
    lines.push(`## ${result.case}`);
    lines.push(`- Scenario: \`${result.scenario}\``);
    lines.push(`- Pass: \`${result.pass}\``);
    lines.push(`- Workflow Status: \`${result.workflowStatus}\``);
    lines.push(`- Elapsed: \`${result.elapsedMs}ms\``);
    lines.push(`- Report Version: \`${result.reportVersion}\``);
    lines.push(`- Is Review: \`${result.isReview}\``);
    lines.push(`- Raw Length: \`${result.reportSummary.rawLength}\` chars`);
    lines.push(`- Sanitized Length: \`${result.reportSummary.sanitizedLength}\` chars`);
    lines.push(`- Section Count: \`${result.reportSummary.sectionCount}\``);
    lines.push(`- Required Sections: \`${result.reportSummary.coverage.ok ? "ok" : result.reportSummary.coverage.missing.join(", ")}\``);
    lines.push(`- Failure Reason: \`${result.failureReason || "n/a"}\``);
    lines.push("");
    lines.push("### Section Titles");
    lines.push("");
    result.reportSummary.sectionTitles.forEach((title) => {
      lines.push(`- ${title}`);
    });
    lines.push("");
    lines.push("### Inputs");
    lines.push("```json");
    lines.push(JSON.stringify(result.inputs, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("### Sanitized Final Report");
    lines.push(result.reportSummary.sanitized);
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  fs.mkdirSync(path.dirname(markdownReportPath), { recursive: true });
  fs.writeFileSync(markdownReportPath, lines.join("\n"), "utf8");
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
  log(`Min report length: ${minReportChars} chars`);

  const cases = [buildFirstInventoryInputs(), buildReviewUpdateInputs()];
  const results = [];

  for (const caseConfig of cases) {
    results.push(await runCase(caseConfig));
  }

  writeMarkdownReport(results);
  writeJsonReport(jsonReportPath, {
    generatedAt: new Date().toISOString(),
    baseUrl,
    minReportChars,
    pass: results.every((item) => item.pass),
    cases: results.map((item) => ({
      scenario: item.scenario,
      case: item.case,
      pass: item.pass,
      failure_reason: item.failureReason || "",
      workflow_status: item.workflowStatus,
      elapsed_ms: item.elapsedMs,
      report_version: item.reportVersion,
      is_review: item.isReview,
      report_length_chars: item.reportSummary.sanitizedLength,
      raw_length_chars: item.reportSummary.rawLength,
      section_titles: item.reportSummary.sectionTitles
    }))
  });

  log(`\n[PASS] all cases succeeded`);
  log(`[REPORT] ${markdownReportPath}`);
  log(`[REPORT] ${jsonReportPath}`);
}

main().catch((error) => {
  log(`\n[FAIL] ${error && error.message ? error.message : String(error)}`);
  process.exitCode = 1;
});
