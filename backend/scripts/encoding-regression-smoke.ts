import { strict as assert } from "node:assert";
import {
  buildConversationLabelFromText,
  buildRouterConversationLabel,
  hasLikelyMojibake,
  normalizeKnownMojibake
} from "../src/shared/text-normalizer";

function run() {
  const multilingualCases = [
    "你好，世界",
    "欢迎使用一树OPC 🚀",
    "English + 中文 + العربية + 日本語",
    "Special chars: !@#$%^&*()_+-=[]{}|;':\",./<>?"
  ];

  for (const value of multilingualCases) {
    assert.equal(normalizeKnownMojibake(value), value, "normal text should stay unchanged");
    assert.equal(hasLikelyMojibake(value), false, "normal text should not be flagged as mojibake");
  }

  assert.equal(normalizeKnownMojibake("璺敱浼氳瘽-master"), "路由会话-master");
  assert.equal(normalizeKnownMojibake("璺敱娴佷笉瀛樺湪: s1"), "路由流不存在: s1");
  assert.equal(normalizeKnownMojibake("璺敱浼氳瘽涓嶅瓨鍦? s2"), "路由会话不存在: s2");
  assert.equal(hasLikelyMojibake("璺敱浼氳瘽-master"), true);

  assert.equal(buildRouterConversationLabel("master"), "路由会话-master");
  assert.equal(buildRouterConversationLabel(""), "路由会话-master");

  const label = buildConversationLabelFromText("欢迎使用一树OPC 🚀", new Date("2026-04-14T00:00:00.000Z"));
  assert.ok(/\d+\/\d+\s/.test(label), "label should start with M/D ");
  assert.ok(label.includes("欢迎使用一树OPC 🚀"), "label should include emoji snippet");

  console.log("[encoding-smoke] all assertions passed");
}

run();
