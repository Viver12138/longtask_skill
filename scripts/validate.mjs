#!/usr/bin/env node
/** Source-package checks only; not a longtask executor or a general Markdown/YAML parser. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_VERSION = '1.7';
export const FILES = [
  'SKILL.md', 'README.md', 'README.zh-CN.md', 'LICENSE',
  'references/protocol.md', 'references/templates.md', 'references/examples.md',
  'references/validation.md', 'adapters/generic.md', 'docs/longtask-design.md',
  'scripts/validate.mjs', 'scripts/validate.test.mjs', '.github/workflows/validate.yml',
];
export const STATES = ['PLANNED', 'IN_PROGRESS', 'BLOCKED', 'VERIFYING',
  'READY_FOR_HANDOFF', 'HANDED_OFF', 'FAILED', 'CANCELLED'];
export const PROJECTION = Object.fromEntries(STATES.map(s => [s,
  ['VERIFYING', 'READY_FOR_HANDOFF'].includes(s) ? 'IN_PROGRESS' : s]));
export const EDGES = [
  '[*]->PLANNED',
  'PLANNED->IN_PROGRESS', 'PLANNED->BLOCKED', 'PLANNED->CANCELLED',
  'IN_PROGRESS->VERIFYING', 'IN_PROGRESS->BLOCKED', 'IN_PROGRESS->FAILED', 'IN_PROGRESS->CANCELLED',
  'VERIFYING->READY_FOR_HANDOFF', 'VERIFYING->IN_PROGRESS', 'VERIFYING->BLOCKED',
  'VERIFYING->FAILED', 'VERIFYING->CANCELLED',
  'READY_FOR_HANDOFF->HANDED_OFF', 'READY_FOR_HANDOFF->IN_PROGRESS',
  'READY_FOR_HANDOFF->BLOCKED', 'READY_FOR_HANDOFF->CANCELLED',
  'BLOCKED->IN_PROGRESS', 'BLOCKED->FAILED', 'BLOCKED->CANCELLED',
  'FAILED->IN_PROGRESS', 'FAILED->BLOCKED', 'FAILED->CANCELLED',
  'HANDED_OFF->[*]', 'CANCELLED->[*]',
];

export const normalize = text => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
export function loadFiles(root) {
  const files = {};
  const errors = [];
  for (const file of FILES) {
    try {
      files[file] = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(path.join(root, file)));
    } catch (error) {
      errors.push(`${file}: cannot read valid UTF-8 (${error.code || error.message})`);
    }
  }
  return { files, errors };
}

// Supports backtick/tilde fences and nested shorter fences in template examples.
export function fenced(text) {
  const blocks = [];
  const prose = [];
  let active = null;
  for (const line of normalize(text).split('\n')) {
    const mark = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!active && mark) {
      active = { char: mark[1][0], length: mark[1].length, lang: mark[2].trim(), lines: [] };
    } else if (active && mark && mark[1][0] === active.char && mark[1].length >= active.length && !mark[2].trim()) {
      blocks.push({ lang: active.lang, text: active.lines.join('\n') });
      active = null;
    } else if (active) active.lines.push(line);
    else prose.push(line);
  }
  return { blocks, prose: prose.join('\n'), unclosed: Boolean(active) };
}

function between(text, start, end) {
  const a = text.indexOf(start);
  if (a < 0) return '';
  const b = text.indexOf(end, a + start.length);
  return text.slice(a + start.length, b < 0 ? undefined : b);
}
function tableRows(text) {
  return text.split('\n').filter(line => /^\|/.test(line))
    .map(line => line.slice(1, line.lastIndexOf('|')).split('|').map(cell => cell.trim().replaceAll('`', '')))
    .filter(row => !row.every(cell => /^:?-+:?$/.test(cell)));
}
function exactSet(actual, expected, label, fail) {
  const seen = new Set();
  for (const value of actual) {
    if (seen.has(value)) fail(`${label}: duplicate ${value}`);
    seen.add(value);
    if (!expected.includes(value)) fail(`${label}: unexpected ${value}`);
  }
  for (const value of expected) if (!seen.has(value)) fail(`${label}: missing ${value}`);
}

export function validateFiles(input, { packageOnly = false } = {}) {
  const files = Object.fromEntries(Object.entries(input).map(([name, text]) => [name, normalize(text)]));
  const errors = [];
  const fail = message => errors.push(message);
  const required = packageOnly
    ? FILES.filter(f => f === 'SKILL.md' || f.startsWith('references/') || f.startsWith('adapters/'))
    : FILES;
  for (const file of required) if (!(file in files)) fail(`missing file: ${file}`);
  const get = name => files[name] || '';

  const front = get('SKILL.md').match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!front) fail('SKILL.md: missing frontmatter');
  else {
    // Repository convention: top-level single-line scalars, then flat metadata.
    const fields = new Map();
    let metadata = false;
    const metadataKeys = new Set();
    for (const line of front[1].split('\n')) {
      if (!line.trim()) continue;
      const match = line.match(/^( {2})?([a-z][a-z_-]*):(?: (.*))?$/);
      if (!match) { fail(`frontmatter: unsupported line ${line}`); continue; }
      const [, indent, key, raw = ''] = match;
      if (indent) {
        if (!metadata) fail(`frontmatter: unexpected indentation ${key}`);
        if (metadataKeys.has(key)) fail(`frontmatter: duplicate metadata ${key}`);
        metadataKeys.add(key);
        if (!raw) fail(`frontmatter: empty metadata ${key}`);
        if (key === 'version' && raw !== `"${EXPECTED_VERSION}"`) fail('frontmatter: version mismatch');
      } else {
        metadata = key === 'metadata';
        if (fields.has(key)) fail(`frontmatter: duplicate ${key}`);
        fields.set(key, raw);
        if (!['name', 'description', 'metadata', 'license', 'compatibility'].includes(key)) fail(`frontmatter: unsupported key ${key}`);
        if (metadata && raw) fail('frontmatter: metadata must be a mapping');
      }
    }
    if (fields.get('name') !== 'longtask') fail('frontmatter: name must be longtask');
    const description = fields.get('description') || '';
    if (!description || description.length > 1024 || /[<>]|\[TODO:|:\s|\s#/.test(description)) fail('frontmatter: invalid description');
    if (!metadataKeys.has('version')) fail('frontmatter: missing version');
  }

  for (const [file, text] of Object.entries(files)) {
    if (!file.endsWith('.md')) continue;
    if (text.includes('\0')) fail(`${file}: NUL character`);
    const { prose, unclosed } = fenced(text);
    if (unclosed) fail(`${file}: unclosed code fence`);
    for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let href = match[1].trim().replace(/^<|>$/g, '');
      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('#')) continue;
      try { href = decodeURIComponent(href.split('#')[0]); }
      catch { fail(`${file}: invalid link encoding`); continue; }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), href));
      if (!target || target.startsWith('../') || !(target in files)) fail(`${file}: broken local link ${href}`);
    }
    if (/^\[TODO:[^\n]*\]$/m.test(prose)) fail(`${file}: unfinished scaffold`);
  }

  const protocol = get('references/protocol.md');
  for (const file of ['references/protocol.md', 'references/templates.md', 'references/validation.md']) {
    const versions = [...get(file).matchAll(/协议版本：([\d.]+)/g)].map(m => m[1]);
    if (!versions.length || versions.some(v => v !== EXPECTED_VERSION)) fail(`${file}: protocol version mismatch`);
  }
  const stateRows = tableRows(between(protocol, '## 3. 会话状态机', '允许的转换')).slice(1);
  exactSet(stateRows.map(row => row[0]), STATES, 'state table', fail);
  const diagrams = fenced(protocol).blocks.filter(block => block.lang === 'mermaid');
  if (diagrams.length !== 1) fail('state graph: expected one mermaid block');
  const edges = [];
  for (const line of (diagrams[0]?.text || '').split('\n')) {
    if (!line.trim() || line.trim() === 'stateDiagram-v2') continue;
    const edge = line.match(/^\s*(\[\*\]|[A-Z_]+)\s*-->\s*(\[\*\]|[A-Z_]+)(?::.*)?\s*$/);
    if (!edge) fail(`state graph: unsupported syntax ${line.trim()}`);
    else edges.push(`${edge[1]}->${edge[2]}`);
  }
  exactSet(edges, EDGES, 'state graph', fail);

  const projectionRows = tableRows(between(protocol, '### 3.1 PLAN', '检查点仅')).slice(1);
  exactSet(projectionRows.map(row => row[0]), STATES, 'projection states', fail);
  for (const [state, projection] of projectionRows) {
    if (PROJECTION[state] !== projection) fail(`projection: ${state} must map to ${PROJECTION[state]}`);
  }

  const permissionRows = tableRows(between(protocol, '文件权限矩阵：', '报告至少')).slice(1);
  for (const target of ['PROTOCOL.md', 'PLAN.md', 'STATE.md', 'S<nn>.md', 'LOCK', 'TRANSITION', '未分配的项目文件']) {
    const rows = permissionRows.filter(row => row[0]?.includes(target));
    if (rows.length !== 1 || rows[0][2] !== '禁止写入') fail(`permissions: Subagent must not write ${target}`);
  }

  const templates = get('references/templates.md');
  const blocks = fenced(templates).blocks;
  const plan = blocks.find(b => b.lang === 'markdown' && b.text.startsWith('# 长任务计划'))?.text || '';
  const cursor = blocks.find(b => b.lang === 'markdown' && b.text.startsWith('# 游标'))?.text || '';
  const handoff = blocks.find(b => b.lang === 'markdown' && b.text.startsWith('# S01 交接'))?.text || '';
  const requiredFields = [
    [plan, 'PLAN template', ['## 1. 任务目标', '## 2. 完成定义', '## 4. 能力与降级', '## 5. 验收环境', '## 6. 会话划分', '执行状态', '当前有效性', '交接策略', '授权来源']],
    [cursor, 'STATE template', ['任务：', '会话：S01', '状态：PLANNED', '下一步：', '基线：', '所有者：未认领', '最后更新：']],
    [handoff, 'handoff template', ['确认来源：', '冻结时间：', '## 1. 结论', '## 2. 关键决策与理由', '## 3. 被否决的方案及原因', '## 4. 踩过的坑', '## 5. 遗留线索', '## 6. 上一会话验收命令', '## 7. 后续动作', '## 8. Git 状态', 'verification_mode', '任务级最终验收结果', '实际结果', '证据与适用版本']],
  ];
  for (const [text, label, fields] of requiredFields) for (const field of fields) {
    if (!text.includes(field)) fail(`${label}: missing ${field}`);
  }
  const planRows = tableRows(between(plan, '## 6. 会话划分', '## 7.')).slice(1);
  if (!planRows.length) fail('PLAN template: missing initial sessions');
  for (const row of planRows) if (row[1] !== 'PLANNED' || row[5] !== 'NOT_AVAILABLE') fail('PLAN template: fabricated initial progress');

  const json = [];
  for (const block of blocks.filter(b => b.lang === 'json')) {
    try { json.push(JSON.parse(block.text)); } catch { fail('templates: malformed JSON'); }
  }
  const lock = json.find(value => Object.hasOwn(value, 'owner'));
  const transition = json.find(value => Object.hasOwn(value, 'transitionId'));
  for (const key of ['taskId', 'ownerId', 'createdAt', 'renewedAt', 'state', 'releaseReason']) {
    if (!lock || !Object.hasOwn(lock, key)) fail(`LOCK template: missing ${key}`);
  }
  for (const key of ['agentType', 'agentInstanceId', 'sessionId', 'hostId']) {
    if (!lock?.owner?.[key]) fail(`LOCK template: missing owner.${key}`);
  }
  if (lock?.state !== 'HELD' || !lock?.ownerId?.includes('<task-id>')) fail('LOCK template: invalid state or owner identity');
  for (const key of ['taskId', 'sessionId', 'ownerId', 'transitionId', 'fromState', 'toState', 'phase', 'updatedFiles', 'snapshots', 'evidence', 'timestamp']) {
    if (!transition || !Object.hasOwn(transition, key)) fail(`TRANSITION template: missing ${key}`);
  }
  if (transition?.phase !== 'PREPARED') fail('TRANSITION template: expected PREPARED');
  const snapshot = transition?.snapshots?.[0];
  for (const key of ['path', 'before', 'after', 'beforeHash', 'afterHash']) {
    if (!snapshot || !Object.hasOwn(snapshot, key)) fail(`TRANSITION template: missing snapshot.${key}`);
  }

  if (!packageOnly) {
    if (!get('docs/longtask-design.md').includes(`协议版本 **${EXPECTED_VERSION}**`)) fail('design: version mismatch');
    if (!get('LICENSE').includes('MIT License')) fail('LICENSE: expected MIT');
    for (const command of ['node scripts/validate.mjs', 'node --test scripts/validate.test.mjs']) {
      if (!get('.github/workflows/validate.yml').includes(command)) fail(`CI: missing ${command}`);
    }
  }
  return errors;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const loaded = loadFiles(root);
  const errors = [...loaded.errors, ...validateFiles(loaded.files)];
  if (errors.length) {
    console.error('静态检查失败：\n' + errors.map(e => `  - ${e}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`静态检查通过：版本 ${EXPECTED_VERSION}；${STATES.length} 个状态；${EDGES.length} 条合法转换。`);
    console.log('范围：源码结构与显式不变量；不代表真实 Agent 集成通过。');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
