const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_SECTION_RULES = [
  { key: "ability", label: "能力", pattern: /能力/ },
  { key: "resource", label: "资源", pattern: /资源/ },
  { key: "cognition", label: "认知", pattern: /认知/ },
  { key: "relationship", label: "关系", pattern: /关系/ },
  { key: "overall", label: "总报告", pattern: /(总资产|总报告|资产总览|总体判断|总结|总览)/ }
];

function stripThinkBlocks(text) {
  return String(text || "").replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "").trim();
}

function stripInternalMarkers(text) {
  return String(text || "")
    .replace(
      /\[(INVENTORY_COMPLETE|REVIEW_COMPLETE|USER_REFUSED_INVENTORY|FORK_TO_BUSINESS_HEALTH|BUSINESS_HEALTH_COMPLETE|RESIST_PARK_REDIRECT)\]/g,
      ""
    )
    .replace(/\[GOTO_(ASSET_INVENTORY|PARK|EXECUTION|MINDSET)\]/g, "")
    .replace(/\[STAY_IN_(FREE_CHAT|BUSINESS_HEALTH|FALLBACK)\]/g, "")
    .trim();
}

function sanitizeFinalReport(text) {
  return stripInternalMarkers(stripThinkBlocks(text));
}

function parseTitledSections(text) {
  const sections = {};
  let currentKey = "";

  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line) {
        return;
      }

      const bracketMatch = line.match(/^【(.+?)】$/);
      if (bracketMatch) {
        currentKey = bracketMatch[1].trim();
        if (!sections[currentKey]) {
          sections[currentKey] = [];
        }
        return;
      }

      const chineseNumberedMatch = line.match(/^(?:#{1,6}\s*)?[一二三四五六七八九十]+、\s*(.+?)\s*$/);
      if (chineseNumberedMatch) {
        const title = chineseNumberedMatch[1]
          .trim()
          .replace(/\*+$/, "")
          .replace(/^\*+/, "")
          .trim();
        if (title) {
          currentKey = title;
          if (!sections[currentKey]) {
            sections[currentKey] = [];
          }
          return;
        }
      }

      if (!currentKey) {
        return;
      }

      sections[currentKey].push(line);
    });

  return sections;
}

function getSectionTitles(text) {
  return Object.keys(parseTitledSections(text));
}

function validateRequiredSections(sectionMapOrTitles, fullText = "") {
  const titles = Array.isArray(sectionMapOrTitles)
    ? sectionMapOrTitles.map((item) => String(item || "").trim()).filter(Boolean)
    : Object.keys(sectionMapOrTitles || {});
  const content = String(fullText || "");
  const matched = {};
  const missing = [];

  REQUIRED_SECTION_RULES.forEach((rule) => {
    const title = titles.find((item) => rule.pattern.test(item));
    const contentMatch = !title && rule.pattern.test(content);
    matched[rule.key] = title || (contentMatch ? "__matched_in_content__" : "");
    if (!title && !contentMatch) {
      missing.push(rule.label);
    }
  });

  return {
    titles,
    matched,
    missing,
    ok: missing.length === 0
  };
}

function summarizeReport(text) {
  const sanitized = sanitizeFinalReport(text);
  const sections = parseTitledSections(sanitized);
  const titles = Object.keys(sections);
  const coverage = validateRequiredSections(titles, sanitized);
  const emptySections = titles.filter((title) => !Array.isArray(sections[title]) || sections[title].length === 0);

  return {
    sanitized,
    rawLength: String(text || "").length,
    sanitizedLength: sanitized.length,
    sectionCount: titles.length,
    sectionTitles: titles,
    coverage,
    emptySections,
    hasThinkTag: /<think\b/i.test(String(text || "")),
    hasResidualThinkTag: /<think\b/i.test(sanitized)
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonReport(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

module.exports = {
  REQUIRED_SECTION_RULES,
  stripThinkBlocks,
  stripInternalMarkers,
  sanitizeFinalReport,
  parseTitledSections,
  getSectionTitles,
  validateRequiredSections,
  summarizeReport,
  writeJsonReport
};
