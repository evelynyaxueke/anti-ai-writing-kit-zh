import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ACTIVE_RULES_MARKER,
  CUSTOM_EOF_MARKER,
  CUSTOM_FORMAT_MARKER,
  CUSTOM_FULL_FORMAT_MARKER,
  SKILL_MARKER,
  activeRulesSha256,
  buildActiveRules,
  buildCustomTemplate,
  runCli,
  splitActiveRules
} from '../scripts/print-active-rules.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aaw-zh-rules-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sections = Array.from({ length: 7 }, (_, index) => `## ${index + 1}. 第${index + 1}节\n\n默认规则 ${index + 1}。`).join('\n\n');
  fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: test-zh-skill\ndescription: 测试。\n---\n\n# 控制器\n\n${sections}\n\n## 维护\n\n维护路由。\n\n## 8. 用户额外偏好\n\n个人偏好。\n\n<!-- ANTI_AI_WRITING_SKILL_EOF -->\n`);
  return directory;
}

test('default active rules validate the controller', (t) => {
  const output = buildActiveRules(fixture(t));
  assert.match(output, /<!-- ANTI_AI_SKILL_BEGIN -->/u);
  assert.match(output, /# 控制器/u);
  assert.match(output, /<!-- ANTI_AI_SKILL_END -->/u);
  assert.match(output, /Customized rules: none/u);
  assert.ok(output.endsWith(`${ACTIVE_RULES_MARKER}\n`));
});

test('custom template is a complete standalone skill', (t) => {
  const output = buildCustomTemplate(fixture(t));
  assert.ok(output.startsWith('---\n'));
  assert.match(output, new RegExp(`^---\\n[\\s\\S]*?\\n---\\n${CUSTOM_FULL_FORMAT_MARKER}$`, 'mu'));
  for (let section = 1; section <= 8; section += 1) assert.match(output, new RegExp(`^## ${section}\\.`, 'mu'));
  assert.match(output, /维护路由/u);
  assert.ok(output.endsWith(`${SKILL_MARKER}\n`));
});

test('standalone customized skill is the only active source', (t) => {
  const directory = fixture(t);
  const custom = buildCustomTemplate(directory).replace('默认规则 1。', '个人规则 1。');
  fs.writeFileSync(path.join(directory, 'skill-customized.md'), custom);
  const output = buildActiveRules(directory);
  assert.match(output, /active_source=skill-customized\.md/u);
  assert.match(output, /个人规则 1。/u);
  assert.doesNotMatch(output, /默认规则 1。/u);
  assert.doesNotMatch(output, /<!-- ANTI_AI_SKILL_BEGIN -->/u);
  assert.match(output, /Do not load default SKILL\.md rules in addition/u);
});

test('create, customize, and reset lifecycle switches the active source cleanly', (t) => {
  const directory = fixture(t);
  const customPath = path.join(directory, 'skill-customized.md');

  assert.match(buildActiveRules(directory), /active_source=SKILL\.md/u);

  const custom = buildCustomTemplate(directory)
    .replace('个人偏好。', '不要把“万能钥匙”当作收尾金句。');
  fs.writeFileSync(customPath, custom);
  const customized = buildActiveRules(directory);
  assert.match(customized, /active_source=skill-customized\.md/u);
  assert.match(customized, /不要把“万能钥匙”当作收尾金句。/u);
  assert.doesNotMatch(customized, /<!-- ANTI_AI_SKILL_BEGIN -->/u);

  fs.rmSync(customPath);
  const reset = buildActiveRules(directory);
  assert.match(reset, /active_source=SKILL\.md/u);
  assert.match(reset, /个人偏好。/u);
  assert.doesNotMatch(reset, /不要把“万能钥匙”当作收尾金句。/u);
});

test('incomplete standalone custom fails closed instead of falling back', (t) => {
  const directory = fixture(t);
  const customPath = path.join(directory, 'skill-customized.md');
  fs.writeFileSync(customPath, buildCustomTemplate(directory).replace(SKILL_MARKER, ''));
  assert.throws(() => buildActiveRules(directory), /standalone skill-customized\.md is incomplete/u);
});

test('older compact customized rules remain supported', (t) => {
  const directory = fixture(t);
  const custom = `${CUSTOM_FORMAT_MARKER}\n\n${Array.from({ length: 8 }, (_, index) => `## ${index + 1}. 规则\n\n个人规则 ${index + 1}。`).join('\n\n')}\n\n${CUSTOM_EOF_MARKER}\n`;
  fs.writeFileSync(path.join(directory, 'skill-customized.md'), custom);
  const output = buildActiveRules(directory);
  assert.match(output, /active_source=SKILL\.md/u);
  assert.match(output, /Compact customized Sections 1 through 7 replace the defaults/u);
  assert.match(output, /个人规则 8。/u);
});

test('whitespace-only customized file is treated as absent', (t) => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'skill-customized.md'), '  \n\t\n');
  const output = buildActiveRules(directory);
  assert.match(output, /Customized rules: none/u);
});

test('legacy customized file remains an additive preference layer', (t) => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'skill-customized.md'), '# 我的旧规则\n\n不要使用“认知飞跃”。\n');
  const output = buildActiveRules(directory);
  assert.match(output, /Legacy customized writing preferences follow/u);
  assert.match(output, /不要使用“认知飞跃”/u);
  assert.match(output, /<!-- ANTI_AI_SKILL_BEGIN -->/u);
  assert.match(output, /# 控制器/u);
});

test('long customized rules require digest-bound chunks through EOF', (t) => {
  const directory = fixture(t);
  const additions = Array.from({ length: 120 }, (_, index) => `补充规则 ${index + 1}。`).join('\n');
  const custom = buildCustomTemplate(directory).replace('个人偏好。', additions);
  fs.writeFileSync(path.join(directory, 'skill-customized.md'), custom);
  const output = buildActiveRules(directory);
  const chunks = splitActiveRules(output);
  const digest = activeRulesSha256(output);
  assert.ok(chunks.length > 1);

  const rendered = [];
  for (let index = 0; index < chunks.length; index += 1) {
    let stdout = '';
    let stderr = '';
    const code = runCli(['--chunk', String(index + 1), '--sha256', digest], {
      skillDir: directory,
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } }
    });
    assert.equal(code, 0, stderr);
    assert.match(stdout, new RegExp(`sha256=${digest}`, 'u'));
    rendered.push(stdout);
  }
  assert.ok(rendered.at(-1).trimEnd().endsWith(ACTIVE_RULES_MARKER));
});

test('chunk loading fails when active rules changed after manifest', (t) => {
  const directory = fixture(t);
  const output = buildActiveRules(directory);
  const staleDigest = activeRulesSha256(output);
  fs.writeFileSync(path.join(directory, 'skill-customized.md'), '# 新的旧格式规则\n');
  let stderr = '';
  const code = runCli(['--chunk', '1', '--sha256', staleDigest], {
    skillDir: directory,
    stdout: { write() {} },
    stderr: { write(value) { stderr += value; } }
  });
  assert.equal(code, 2);
  assert.match(stderr, /changed after the chunk manifest/u);
});

test('malformed compact file fails closed', (t) => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'skill-customized.md'), '<!-- ANTI_AI_WRITING_CUSTOM_RULES_V1 -->\n## 1. 规则\n');
  assert.throws(() => buildActiveRules(directory), /incomplete|missing/u);
});
