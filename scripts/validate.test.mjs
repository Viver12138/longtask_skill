import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFiles, validateFiles, fenced, EDGES } from './validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { files, errors } = loadFiles(root);
const copy = () => ({ ...files });
function changed(file, from, to) {
  assert.ok(files[file].includes(from), `fixture target must exist: ${from}`);
  return { ...files, [file]: files[file].replace(from, to) };
}
function rejects(input, fragment) {
  assert.ok(validateFiles(input).some(error => error.includes(fragment)),
    `expected diagnostic ${fragment}, got ${JSON.stringify(validateFiles(input))}`);
}

test('source package passes with valid UTF-8', () => {
  assert.deepEqual(errors, []);
  assert.deepEqual(validateFiles(files), []);
});
test('Windows BOM and CRLF do not change results', () => {
  const windows = Object.fromEntries(Object.entries(files).map(([name, text]) =>
    [name, '\uFEFF' + text.replace(/^\uFEFF/, '').replace(/\r?\n/g, '\r\n')]));
  assert.deepEqual(validateFiles(windows), []);
});
test('minimal installed package resolves all local document links', () => {
  const minimal = Object.fromEntries(Object.entries(files).filter(([name]) =>
    name === 'SKILL.md' || name.startsWith('references/') || name.startsWith('adapters/')));
  assert.deepEqual(validateFiles(minimal, { packageOnly: true }), []);
});
test('missing input reports diagnostics without crashing', () => {
  const input = copy();
  delete input['references/protocol.md'];
  rejects(input, 'missing file: references/protocol.md');
});
test('frontmatter requires a nonempty description and unique keys', () => {
  rejects(changed('SKILL.md', 'description: Plan', 'description: \nextra: Plan'), 'invalid description');
  rejects(changed('SKILL.md', 'name: longtask', 'name: longtask\nname: longtask'), 'duplicate name');
});
test('release version drift is rejected', () => {
  rejects(changed('references/protocol.md', '协议版本：1.7', '协议版本：9.9'), 'version mismatch');
});
test('every missing graph edge is rejected, including initial and terminal edges', () => {
  for (const edge of EDGES) {
    const [from, to] = edge.split('->');
    rejects(changed('references/protocol.md', `    ${from} --> ${to}`, ''), `missing ${edge}`);
  }
});
test('known states cannot be connected by an illegal shortcut', () => {
  rejects(changed('references/protocol.md', 'stateDiagram-v2',
    'stateDiagram-v2\n    IN_PROGRESS --> HANDED_OFF'), 'unexpected IN_PROGRESS->HANDED_OFF');
});
test('terminal states cannot reopen', () => {
  rejects(changed('references/protocol.md', 'stateDiagram-v2',
    'stateDiagram-v2\n    HANDED_OFF --> IN_PROGRESS'), 'unexpected HANDED_OFF->IN_PROGRESS');
});
test('unknown states in the state table are rejected', () => {
  rejects(changed('references/protocol.md', '| `FAILED` | 本次', '| `DONE` | 本次'), 'state table: unexpected DONE');
});
test('unknown and duplicate graph edges are rejected', () => {
  rejects(changed('references/protocol.md', 'stateDiagram-v2',
    'stateDiagram-v2\n    VERIFYING --> DONE'), 'unexpected VERIFYING->DONE');
  rejects(changed('references/protocol.md', 'stateDiagram-v2',
    'stateDiagram-v2\n    PLANNED --> IN_PROGRESS'), 'duplicate PLANNED->IN_PROGRESS');
});
test('coarse PLAN projection is checked, not string equality', () => {
  rejects(changed('references/protocol.md', '| `VERIFYING` | `IN_PROGRESS` |',
    '| `VERIFYING` | `HANDED_OFF` |'), 'projection: VERIFYING');
  rejects(changed('references/protocol.md', '| `READY_FOR_HANDOFF` | `IN_PROGRESS` |',
    '| `READY_FOR_HANDOFF` | `READY_FOR_HANDOFF` |'), 'projection: READY_FOR_HANDOFF');
});
test('changing a permission cell is caught even if prohibitions remain elsewhere', () => {
  rejects(changed('references/protocol.md', '| `STATE.md` | 可写 | 禁止写入 |',
    '| `STATE.md` | 可写 | 可写 |'), 'permissions: Subagent must not write STATE.md');
});
test('initialization must not claim completed work', () => {
  rejects(changed('references/templates.md', '| S01 | PLANNED | <产物>',
    '| S01 | HANDED_OFF | <产物>'), 'fabricated initial progress');
});
test('handoff evidence cannot disappear behind a mention elsewhere', () => {
  rejects(changed('references/templates.md', '- 证据与适用版本：', '- 附加说明：'), 'handoff template: missing 证据与适用版本');
});
test('JSON templates must parse', () => {
  rejects(changed('references/templates.md', '"state": "HELD",', '"state": "HELD",,'), 'malformed JSON');
});
test('lock identity and transition recovery evidence are required', () => {
  rejects(changed('references/templates.md', '"agentInstanceId":', '"instance":'), 'missing owner.agentInstanceId');
  rejects(changed('references/templates.md', '"afterHash":', '"newHash":'), 'missing snapshot.afterHash');
});
test('broken local links fail; remote links are not treated as files', () => {
  rejects(changed('SKILL.md', '(references/templates.md)', '(references/missing.md)'), 'broken local link');
  const input = copy();
  input['README.md'] += '\n[Remote](https://example.invalid/manual.md)\n';
  assert.deepEqual(validateFiles(input), []);
});
test('links in fenced example code are not package dependencies', () => {
  const input = copy();
  input['README.md'] += '\n```markdown\n[generated file](missing.md)\n```\n';
  assert.deepEqual(validateFiles(input), []);
});
test('nested fences are paired by marker and length', () => {
  const valid = '````markdown\n```js\nx\n```\n````';
  assert.equal(fenced(valid).unclosed, false);
  assert.equal(fenced('```js\nx\n~~~').unclosed, true);
  const input = copy();
  input['README.md'] += '\n```js\nunfinished\n';
  rejects(input, 'unclosed code fence');
});
test('CI must run regression tests as well as the validator', () => {
  rejects(changed('.github/workflows/validate.yml', 'node --test scripts/validate.test.mjs',
    'node --version'), 'CI: missing node --test');
});
