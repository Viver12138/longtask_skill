#!/usr/bin/env node
/**
 * longtask 静态一致性检查。
 *
 * 无依赖，直接运行：
 *   node scripts/validate.mjs
 *
 * 覆盖：
 *  1. 必需文件存在
 *  2. SKILL.md frontmatter 与版本
 *  3. Markdown 代码围栏配对
 *  4. Markdown 相对链接可解析
 *  5. 协议 / 模板 / 验证矩阵 / 设计文档版本一致
 *  6. 会话状态枚举与状态转换合法性
 *  7. PLAN / STATE / S<nn>.md / LOCK 模板字段
 *  8. Subagent 权限矩阵一致性
 *  9. 持久化原则一致性
 * 10. 归档路径、会话编号规则
 * 11. 场景矩阵数量
 * 12. 验证成熟度披露
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

const EXPECTED_VERSION = "1.5";
const BASE_SCENARIOS = 35;
const T_SCENARIOS = 30;

const SESSION_STATES = [
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "VERIFYING",
  "READY_FOR_HANDOFF",
  "HANDED_OFF",
  "FAILED",
  "CANCELLED",
];

const PLAN_EXEC_STATES = [
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "HANDED_OFF",
  "FAILED",
  "CANCELLED",
];

const REQUIRED_TRANSITIONS = [
  "PLANNED->IN_PROGRESS",
  "PLANNED->BLOCKED",
  "PLANNED->CANCELLED",
  "IN_PROGRESS->BLOCKED",
  "IN_PROGRESS->VERIFYING",
  "VERIFYING->READY_FOR_HANDOFF",
  "READY_FOR_HANDOFF->HANDED_OFF",
  "IN_PROGRESS->FAILED",
  "FAILED->IN_PROGRESS",
  "HANDED_OFF->[*]",
  "CANCELLED->[*]",
];

const read = (file) => {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch {
    return null;
  }
};
const exists = (file) => fs.existsSync(path.join(root, file));
const report = (message) => errors.push(message);

function checkRequiredFiles() {
  for (const file of FILES) {
    if (!exists(file)) report(`缺少文件：${file}`);
  }
}

function checkFrontmatter() {
  const skill = read("SKILL.md");
  if (skill === null) return;
  const match = skill.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    report("SKILL.md 缺少 frontmatter");
    return;
  }
  const frontmatter = match[1];
  for (const key of ["name", "description", "metadata"]) {
    if (!new RegExp(`^${key}:`, "m").test(frontmatter)) {
      report(`SKILL.md frontmatter 缺少 ${key}`);
    }
  }
  const name = (frontmatter.match(/^name:\s*(\S+)/m) || [])[1];
  if (name !== "longtask") report(`SKILL.md name 应为 longtask，实际为 ${name}`);
  const version = (frontmatter.match(/version:\s*"([^"]+)"/) || [])[1];
  if (version !== EXPECTED_VERSION) {
    report(`SKILL.md 版本应为 ${EXPECTED_VERSION}，实际为 ${version}`);
  }
}

function checkFences() {
  for (const file of FILES) {
    const text = read(file);
    if (text === null) continue;
    const count = (text.match(/^```/gm) || []).length;
    if (count % 2 !== 0) report(`${file} 代码围栏未配对（${count} 个）`);
  }
}

function checkLinks() {
  const linkPattern = /\[[^\]]*\]\(([^)#]+\.md)(?:#[^)]*)?\)/g;
  for (const file of FILES) {
    const text = read(file);
    if (text === null) continue;
    let match;
    while ((match = linkPattern.exec(text))) {
      const target = path.resolve(path.dirname(path.join(root, file)), match[1]);
      if (!fs.existsSync(target)) report(`${file} 链接无法解析：${match[1]}`);
    }
  }
}

function checkVersions() {
  const patterns = [
    ["references/protocol.md", /协议版本：([\d.]+)/],
    ["references/templates.md", /协议版本：([\d.]+)/],
    ["references/validation.md", /协议版本：([\d.]+)/],
    ["docs/longtask-design.md", /协议版本 \*\*([\d.]+)\*\*/],
  ];
  for (const [file, pattern] of patterns) {
    const text = read(file);
    if (text === null) continue;
    const version = (text.match(pattern) || [])[1];
    if (version !== EXPECTED_VERSION) {
      report(`${file} 版本应为 ${EXPECTED_VERSION}，实际为 ${version}`);
    }
  }
}

function checkStateMachine() {
  const protocol = read("references/protocol.md");
  if (protocol === null) return;

  for (const state of SESSION_STATES) {
    if (!protocol.includes(`\`${state}\``)) report(`protocol.md 缺少会话状态：${state}`);
  }

  const mermaid = protocol.match(/```mermaid\n([\s\S]*?)```/);
  if (!mermaid) {
    report("protocol.md 缺少状态转换图");
    return;
  }

  const transitions = new Set();
  for (const line of mermaid[1].split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*-->\s*(\[[^\]]+\]|[A-Z_]+)/);
    if (match) transitions.add(`${match[1]}->${match[2]}`);
  }

  for (const required of REQUIRED_TRANSITIONS) {
    if (!transitions.has(required)) report(`状态转换缺失：${required}`);
  }

  for (const transition of transitions) {
    for (const state of transition.split("->")) {
      if (state !== "[*]" && !SESSION_STATES.includes(state)) {
        report(`状态转换含未定义状态：${transition}`);
      }
    }
  }

  for (const phrase of ["会话状态机以单个会话为作用域", "PLAN 会话执行状态", "计划级事实"]) {
    if (!protocol.includes(phrase)) report(`protocol.md 缺少状态机约束：${phrase}`);
  }

  const templates = read("references/templates.md");
  if (templates !== null) {
    for (const state of PLAN_EXEC_STATES) {
      if (!templates.includes(`\`${state}\``)) {
        report(`templates.md PLAN 会话表缺少执行状态：${state}`);
      }
    }
    if (!templates.includes("执行状态")) report("templates.md PLAN 会话表缺少执行状态列");
  }
}

function checkTemplates() {
  const templates = read("references/templates.md");
  if (templates === null) return;

  const required = [
    "## 1. 任务目标",
    "## 2. 完成定义（任务级最终验收）",
    "## 4. 能力与降级",
    "## 5. 验收环境",
    "## 6. 会话划分",
    "执行状态",
    "当前有效性",
    "上一会话验收命令",
    "后续动作",
    "任务级最终验收结果",
    "副作用",
    "幂等",
    "执行预算",
    "任务短 ID",
    "Schema 版本",
    "short-id",
    "ownerId",
    "临时归档目录",
  ];
  for (const field of required) {
    if (!templates.includes(field)) report(`templates.md 缺少字段：${field}`);
  }

  const handoffSections = ["1. 结论", "2. 关键决策与理由", "3. 被否决的方案及原因", "4. 踩过的坑", "5. 遗留线索", "6. 上一会话验收命令", "7. 后续动作", "8. Git 状态"];
  for (const section of handoffSections) {
    if (!templates.includes(`## ${section}`)) report(`templates.md 交接模板缺少：${section}`);
  }
}

function checkPermissions() {
  const checks = [
    ["references/protocol.md", "文件权限矩阵"],
    ["adapters/generic.md", "Subagent 权限矩阵"],
    ["docs/longtask-design.md", "文件权限矩阵"],
  ];
  for (const [file, marker] of checks) {
    const text = read(file);
    if (text === null) continue;
    if (!text.includes(marker)) report(`${file} 缺少权限矩阵：${marker}`);
    for (const target of ["`PLAN.md`", "`STATE.md`", "`S<nn>.md`"]) {
      if (!text.includes(target)) report(`${file} 权限矩阵缺少 ${target}`);
    }
    if (!text.includes("禁止")) report(`${file} 权限矩阵缺少「禁止」规则`);
  }
}

function checkPersistence() {
  const skill = read("SKILL.md");
  if (skill !== null) {
    for (const phrase of ["避免重复持久化", "验收命令", "Git 基线"]) {
      if (!skill.includes(phrase)) report(`SKILL.md 持久化原则缺少：${phrase}`);
    }
    if (skill.includes("一律不写")) report("SKILL.md 仍含「一律不写」的过度表述");
  }

  const protocol = read("references/protocol.md");
  if (protocol !== null) {
    for (const phrase of ["必须持久化", "验收命令", "Git 基线", "恢复任务所需的信息"]) {
      if (!protocol.includes(phrase)) report(`protocol.md 持久化边界缺少：${phrase}`);
    }
  }

  const design = read("docs/longtask-design.md");
  if (design !== null) {
    for (const phrase of ["避免重复持久化", "验收命令", "Git 基线"]) {
      if (!design.includes(phrase)) report(`设计文档持久化边界缺少：${phrase}`);
    }
  }
}

function checkSessionAndArchiveRules() {
  const protocol = read("references/protocol.md");
  if (protocol === null) return;

  for (const phrase of ["选择已规划的会话", "创建新会话", "不重新分配编号", "最大编号只用于新增会话"]) {
    if (!protocol.includes(phrase)) report(`protocol.md 缺少会话编号规则：${phrase}`);
  }

  const templates = read("references/templates.md");
  if (templates !== null && !templates.includes("不要重新分配编号")) {
    report("templates.md 缺少「不要重新分配编号」提示");
  }

  for (const file of ["references/protocol.md", "references/templates.md", "references/validation.md", "SKILL.md", "README.md", "README.zh-CN.md"]) {
    const text = read(file);
    if (text === null) continue;
    const archiveMatches = text.match(/archive\/task-[^\s)`]*/g) || [];
    for (const archivePath of archiveMatches) {
      if (!archivePath.includes("short-id")) report(`${file} 归档路径缺少 short-id：${archivePath}`);
    }
  }

  if (!protocol.includes("临时归档目录")) report("protocol.md 缺少归档中断恢复流程");
}

function checkValidationCounts() {
  const validation = read("references/validation.md");
  if (validation === null) return;

  const baseSection = validation.split("## 2. 基础场景矩阵")[1]?.split("## 3.")[0] || "";
  const baseCount = (baseSection.match(/^\| \d+ \|/gm) || []).length;
  if (baseCount !== BASE_SCENARIOS) {
    report(`validation.md 基础场景应为 ${BASE_SCENARIOS}，实际为 ${baseCount}`);
  }

  const tCount = (validation.match(/^\| T-\d+ \|/gm) || []).length;
  if (tCount !== T_SCENARIOS) {
    report(`validation.md T 场景应为 ${T_SCENARIOS}，实际为 ${tCount}`);
  }

  if (!validation.includes("三层验证体系")) report("validation.md 缺少三层验证体系");
  if (!validation.includes("NOT_TESTED")) report("validation.md 缺少结果状态枚举");
}

function checkMaturity() {
  const readme = read("README.md");
  if (readme !== null && !readme.includes("not been executed")) {
    report("README.md 缺少验证成熟度披露");
  }
  const readmeZh = read("README.zh-CN.md");
  if (readmeZh !== null && !readmeZh.includes("尚未执行")) {
    report("README.zh-CN.md 缺少验证成熟度披露");
  }
  const design = read("docs/longtask-design.md");
  if (design !== null && !design.includes("成熟度说明")) {
    report("设计文档缺少成熟度说明");
  }
}

function checkStaleTerms() {
  const forbidden = [
    ["旧占位符 S0N", /S0N/],
    ["旧归档路径", /archive\/task-<slug>-<YYYYMMDD>\//],
    ["旧的轮次表述", /三轮评审的合并版/],
    ["旧的示例计数", /九类场景/],
    ["旧的场景计数", /共 35 个场景|共 60 个场景/],
  ];
  for (const file of FILES) {
    if (file === "scripts/validate.mjs") continue;
    const text = read(file);
    if (text === null) continue;
    for (const [label, pattern] of forbidden) {
      if (pattern.test(text)) report(`${file} 含${label}`);
    }
  }
}

function main() {
  for (const check of [
    checkRequiredFiles,
    checkFrontmatter,
    checkFences,
    checkLinks,
    checkVersions,
    checkStateMachine,
    checkTemplates,
    checkPermissions,
    checkPersistence,
    checkSessionAndArchiveRules,
    checkValidationCounts,
    checkMaturity,
    checkStaleTerms,
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
  console.log(`  会话状态：${SESSION_STATES.length}`);
  console.log(`  场景：${BASE_SCENARIOS} + ${T_SCENARIOS}`);
}

main();
