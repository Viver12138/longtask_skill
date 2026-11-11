#!/usr/bin/env node
/**
 * longtask 静态一致性检查。
 *
 * 无依赖，直接运行：
 *   node scripts/validate.mjs
 *
 * 检查项：
 *  1. 必需文件存在
 *  2. SKILL.md frontmatter 与版本
 *  3. Markdown 代码围栏配对
 *  4. Markdown 相对链接可解析
 *  5. 协议 / 模板 / 验证矩阵版本一致
 *  6. 会话状态枚举完整
 *  7. 已废弃术语与旧路径未回流
 *  8. 交接模板关键字段存在
 *  9. 场景矩阵数量
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

const FILES = [
  "SKILL.md",
  "README.md",
  "README.zh-CN.md",
  "references/protocol.md",
  "references/templates.md",
  "references/examples.md",
  "references/validation.md",
  "adapters/generic.md",
  "docs/longtask-design.md",
  "scripts/validate.mjs",
];

const EXPECTED_VERSION = "1.4";
const STATES = [
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "VERIFYING",
  "READY_FOR_HANDOFF",
  "HANDED_OFF",
  "FAILED",
];

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

function checkRequiredFiles() {
  for (const file of FILES) {
    if (!exists(file)) errors.push(`缺少文件：${file}`);
  }
}

function checkFrontmatter() {
  const skill = read("SKILL.md");
  const match = skill.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    errors.push("SKILL.md 缺少 frontmatter");
    return;
  }
  const frontmatter = match[1];
  for (const key of ["name", "description", "metadata"]) {
    if (!new RegExp(`^${key}:`, "m").test(frontmatter)) {
      errors.push(`SKILL.md frontmatter 缺少 ${key}`);
    }
  }
  const name = (frontmatter.match(/^name:\s*(\S+)/m) || [])[1];
  if (name !== "longtask") errors.push(`SKILL.md name 应为 longtask，实际为 ${name}`);
  const version = (frontmatter.match(/version:\s*"([^"]+)"/) || [])[1];
  if (version !== EXPECTED_VERSION) {
    errors.push(`SKILL.md 版本应为 ${EXPECTED_VERSION}，实际为 ${version}`);
  }
}

function checkFences() {
  for (const file of FILES) {
    if (!exists(file)) continue;
    const count = (read(file).match(/^```/gm) || []).length;
    if (count % 2 !== 0) {
      errors.push(`${file} 代码围栏未配对（${count} 个）`);
    }
  }
}

function checkLinks() {
  const linkPattern = /\[[^\]]*\]\(([^)#]+\.md)(?:#[^)]*)?\)/g;
  for (const file of FILES) {
    if (!exists(file)) continue;
    const text = read(file);
    let match;
    while ((match = linkPattern.exec(text))) {
      const target = path.resolve(path.dirname(path.join(root, file)), match[1]);
      if (!fs.existsSync(target)) {
        errors.push(`${file} 链接无法解析：${match[1]}`);
      }
    }
  }
}

function checkVersions() {
  const versionPatterns = [
    ["references/protocol.md", /协议版本：([\d.]+)/],
    ["references/templates.md", /协议版本：([\d.]+)/],
    ["references/validation.md", /协议版本：([\d.]+)/],
  ];
  for (const [file, pattern] of versionPatterns) {
    if (!exists(file)) continue;
    const version = (read(file).match(pattern) || [])[1];
    if (version !== EXPECTED_VERSION) {
      errors.push(`${file} 协议版本应为 ${EXPECTED_VERSION}，实际为 ${version}`);
    }
  }
}

function checkStates() {
  const protocol = read("references/protocol.md");
  for (const state of STATES) {
    if (!protocol.includes(`\`${state}\``)) {
      errors.push(`protocol.md 缺少状态：${state}`);
    }
  }
}

function checkStaleTerms() {
  const forbidden = [
    ["旧占位符 S0N", /S0N/],
    ["旧归档路径", /archive\/task-<slug>-<YYYYMMDD>\//],
    ["旧的轮次表述", /三轮评审的合并版/],
    ["旧的示例计数", /九类场景/],
    ["旧的场景计数", /共 35 个场景/],
  ];
  for (const file of FILES) {
    if (!exists(file) || file === "scripts/validate.mjs") continue;
    const text = read(file);
    for (const [label, pattern] of forbidden) {
      if (pattern.test(text)) errors.push(`${file} 含${label}`);
    }
  }
}

function checkTemplateFields() {
  const templates = read("references/templates.md");
  const required = [
    "上一会话验收命令",
    "后续动作",
    "任务级最终验收结果",
    "副作用",
    "幂等",
    "执行预算",
    "任务短 ID",
    "Schema 版本",
    "short-id",
  ];
  for (const field of required) {
    if (!templates.includes(field)) {
      errors.push(`templates.md 缺少字段：${field}`);
    }
  }
}

function checkValidationCounts() {
  const validation = read("references/validation.md");
  const baseSection = validation.split("## 2. 基础场景矩阵")[1]?.split("## 3.")[0] || "";
  const baseCount = (baseSection.match(/^\| \d+ \|/gm) || []).length;
  if (baseCount !== 35) {
    errors.push(`validation.md 基础场景应为 35，实际为 ${baseCount}`);
  }
  const tCount = (validation.match(/^\| T-\d+ \|/gm) || []).length;
  if (tCount !== 25) {
    errors.push(`validation.md T 场景应为 25，实际为 ${tCount}`);
  }
}

function main() {
  for (const check of [
    checkRequiredFiles,
    checkFrontmatter,
    checkFences,
    checkLinks,
    checkVersions,
    checkStates,
    checkStaleTerms,
    checkTemplateFields,
    checkValidationCounts,
  ]) {
    check();
  }

  if (warnings.length > 0) {
    console.log("警告：");
    for (const warning of warnings) console.log(`  - ${warning}`);
  }

  if (errors.length > 0) {
    console.error("静态检查失败：");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log("静态检查通过。");
  console.log(`  文件：${FILES.length}`);
  console.log(`  版本：${EXPECTED_VERSION}`);
  console.log(`  状态：${STATES.length}`);
}

main();
