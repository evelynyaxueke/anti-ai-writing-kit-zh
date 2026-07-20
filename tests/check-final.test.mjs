import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../scripts/check-final.mjs';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function sink() {
  let value = '';
  return { stream: { write(chunk) { value += String(chunk); } }, read() { return value; } };
}

function candidate(t, text) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aaw-zh-final-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'candidate.txt');
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o600);
  return file;
}

test('clean candidate receives a PASS receipt', (t) => {
  const stdout = sink();
  const stderr = sink();
  const status = runCli(['--input', candidate(t, '模板统一后，运营每周少做一次手工归类。'), '--format', 'text', '--fail-on', 'review'], { skillDir: SKILL_DIR, stdout: stdout.stream, stderr: stderr.stream });
  assert.equal(status, 0, stderr.read());
  assert.match(stdout.read(), /__ANTI_AI_CANDIDATE_RECEIPT_BEGIN__/u);
  assert.match(stdout.read(), /__ANTI_AI_FINAL_CHECK_EOF__/u);
});

test('review candidate blocks final delivery', (t) => {
  const stdout = sink();
  const status = runCli(['--input', candidate(t, '这不是效率问题，而是认知问题。'), '--format', 'text', '--fail-on', 'review'], { skillDir: SKILL_DIR, stdout: stdout.stream, stderr: sink().stream });
  assert.equal(status, 1);
  assert.match(stdout.read(), /__ANTI_AI_FINAL_CHECK_BLOCKED__/u);
});

test('Chinese character bounds are enforced', (t) => {
  const stdout = sink();
  const status = runCli(['--input', candidate(t, '中文测试'), '--format', 'text', '--fail-on', 'review', '--min-words', '5'], { skillDir: SKILL_DIR, stdout: stdout.stream, stderr: sink().stream });
  assert.equal(status, 1);
  assert.match(stdout.read(), /below the required minimum/u);
});

test('terminal newline fails closed', (t) => {
  const stderr = sink();
  const status = runCli(['--input', candidate(t, '完整候选稿。\n'), '--format', 'text', '--fail-on', 'review'], { skillDir: SKILL_DIR, stdout: sink().stream, stderr: stderr.stream });
  assert.equal(status, 2);
  assert.match(stderr.read(), /must not end/u);
});
