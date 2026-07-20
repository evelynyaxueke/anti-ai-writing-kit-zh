import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ACTIVE_RULES_MARKER, buildActiveRules, buildCustomTemplate } from '../scripts/print-active-rules.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aaw-zh-rules-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sections = Array.from({ length: 7 }, (_, index) => `## ${index + 1}. 第${index + 1}节\n\n默认规则 ${index + 1}。`).join('\n\n');
  fs.writeFileSync(path.join(directory, 'SKILL.md'), `${sections}\n\n## 参考与维护\n\n读取参考。\n\n## 8. 用户额外偏好\n\n个人偏好。\n\n<!-- ANTI_AI_WRITING_SKILL_EOF -->\n`);
  return directory;
}

test('default active rules validate the controller', (t) => {
  const output = buildActiveRules(fixture(t));
  assert.match(output, /Customized rules: none/u);
  assert.ok(output.endsWith(`${ACTIVE_RULES_MARKER}\n`));
});

test('custom template contains numbered rules but no controller blocks', (t) => {
  const output = buildCustomTemplate(fixture(t));
  for (let section = 1; section <= 8; section += 1) assert.match(output, new RegExp(`^## ${section}\\.`, 'mu'));
  assert.doesNotMatch(output, /参考与维护/u);
  assert.doesNotMatch(output, /ANTI_AI_WRITING_SKILL_EOF/u);
  assert.match(output, /ANTI_AI_WRITING_CUSTOM_EOF/u);
});

test('compact customized rules replace defaults', (t) => {
  const directory = fixture(t);
  const custom = buildCustomTemplate(directory).replace('默认规则 1。', '个人规则 1。');
  fs.writeFileSync(path.join(directory, 'skill-customized.md'), custom);
  const output = buildActiveRules(directory);
  assert.match(output, /个人规则 1。/u);
  assert.doesNotMatch(output, /默认规则 1。/u);
});

test('malformed compact file fails closed', (t) => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'skill-customized.md'), '<!-- ANTI_AI_WRITING_CUSTOM_RULES_V1 -->\n## 1. 规则\n');
  assert.throws(() => buildActiveRules(directory), /incomplete|missing/u);
});
