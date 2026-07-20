import test from 'node:test';
import assert from 'node:assert/strict';

import { countWords, scanText } from '../scripts/scan-writing.mjs';

function byRule(result, id) {
  return result.findings.filter((item) => item.rule_id === id);
}

test('clean Chinese prose passes mechanical review', () => {
  const result = scanText('模板统一后，运营每周少做一次手工归类。编辑仍要核对来源和数字。');
  assert.equal(result.summary.blocking, 0);
  assert.equal(result.summary.review, 0);
});

test('visible Chinese AI patterns are found', () => {
  const result = scanText('随着 AI 不断发展，赋能团队至关重要。这不是效率问题，而是认知问题。大多数人都没意识到。你怎么看？');
  for (const id of ['AAWZH004', 'AAWZH020', 'AAWZH012', 'AAWZH014', 'AAWZH006']) {
    assert.ok(byRule(result, id).length > 0, id);
  }
});

test('code is ignored unless requested', () => {
  const text = '正文正常。`赋能——闭环`\n```text\n随着 AI 不断发展\n```';
  assert.equal(scanText(text).findings.length, 0);
  assert.ok(scanText(text, { includeCode: true }).findings.length > 0);
});

test('quoted hard-ban text is downgraded to review', () => {
  const match = byRule(scanText('原文写道：“这件事——值得讨论。”'), 'AAWZH001')[0];
  assert.equal(match.level, 'review');
  assert.equal(match.context, 'quoted');
});

test('Chinese length counts Han characters and Latin tokens', () => {
  assert.equal(countWords('中文 AI 2.0'), 5);
});

test('three nearby short sentences trigger rhythm review', () => {
  assert.equal(byRule(scanText('快一点。再快点。马上做。'), 'AAWZH023').length, 1);
});

test('generic outcome and reader coaching are candidates', () => {
  const result = scanText('这个方案带来了显著成效。这一结论非常重要。');
  assert.equal(byRule(result, 'AAWZH016').length, 1);
  assert.equal(byRule(result, 'AAWZH017').length, 1);
});
