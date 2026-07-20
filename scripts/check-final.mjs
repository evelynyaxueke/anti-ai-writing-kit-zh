#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ACTIVE_RULES_MARKER,
  activeRulesSha256,
  buildActiveRules,
  splitActiveRules
} from './print-active-rules.mjs';
import { scanText } from './scan-writing.mjs';

export const FINAL_CHECK_MARKER = '__ANTI_AI_FINAL_CHECK_EOF__';
export const CANDIDATE_INPUT_EOF_MARKER = '__ANTI_AI_CANDIDATE_INPUT_EOF__';
export const CANDIDATE_RECEIPT_BEGIN_MARKER = '__ANTI_AI_CANDIDATE_RECEIPT_BEGIN__';
export const CANDIDATE_RECEIPT_END_MARKER = '__ANTI_AI_CANDIDATE_RECEIPT_EOF__';
const VERIFIED_RULES_MARKER = '__ANTI_AI_ACTIVE_RULES_VERIFIED__';
const SCAN_BEGIN_MARKER = '__ANTI_AI_FINAL_SCAN_BEGIN__';
const BLOCKED_MARKER = '__ANTI_AI_FINAL_CHECK_BLOCKED__';
const CANDIDATE_INPUT_EOF_BYTES = Buffer.from(`\n${CANDIDATE_INPUT_EOF_MARKER}\n`, 'utf8');
const CANDIDATE_INPUT_MARKER_BYTES = Buffer.from(CANDIDATE_INPUT_EOF_MARKER, 'utf8');
const UTF8_BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(SCRIPT_DIR);

class GateUsageError extends Error {}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value), 'utf8');
}

export function frameStdinCandidate(candidate) {
  return Buffer.concat([asBuffer(candidate), CANDIDATE_INPUT_EOF_BYTES]);
}

function countBufferOccurrences(buffer, needle) {
  let count = 0;
  let offset = 0;
  while (offset <= buffer.length - needle.length) {
    const index = buffer.indexOf(needle, offset);
    if (index < 0) break;
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

function decodeUtf8(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new GateUsageError('Candidate input is not valid UTF-8.');
  }
}

function readCandidate(options, io) {
  const raw = options.stdin
    ? asBuffer(io.stdinBuffer ?? io.stdinText ?? fs.readFileSync(0))
    : fs.readFileSync(options.input);

  if (raw.indexOf(UTF8_BOM_BYTES) >= 0) {
    throw new GateUsageError('Candidate transport must not contain a UTF-8 BOM.');
  }
  // Decode the complete transport first so invalid bytes cannot hide in a
  // framing marker or in bytes that follow it.
  decodeUtf8(raw);

  let candidateBytes = raw;
  if (options.stdin) {
    const markerCount = countBufferOccurrences(raw, CANDIDATE_INPUT_MARKER_BYTES);
    if (markerCount === 0) {
      throw new GateUsageError(`Stdin candidate must end with ${JSON.stringify(`\n${CANDIDATE_INPUT_EOF_MARKER}\n`)}.`);
    }
    if (markerCount !== 1) {
      throw new GateUsageError('Stdin candidate contains an embedded or duplicate candidate EOF marker.');
    }
    if (raw.length < CANDIDATE_INPUT_EOF_BYTES.length || !raw.subarray(-CANDIDATE_INPUT_EOF_BYTES.length).equals(CANDIDATE_INPUT_EOF_BYTES)) {
      throw new GateUsageError('Stdin candidate has a malformed EOF marker or trailing bytes after it.');
    }
    candidateBytes = raw.subarray(0, raw.length - CANDIDATE_INPUT_EOF_BYTES.length);
  }

  if (candidateBytes.includes(0x0d)) {
    throw new GateUsageError('Candidate transport must use LF line breaks and contain no carriage returns.');
  }
  const candidate = decodeUtf8(candidateBytes);
  if (!candidate.trim()) throw new GateUsageError('Candidate input is empty.');
  if (/^[ \t]*\n/u.test(candidate)) {
    throw new GateUsageError('Candidate transport must not begin with a leading blank line.');
  }
  if (/[ \t]$/u.test(candidate)) {
    throw new GateUsageError('Candidate transport must not end with horizontal whitespace.');
  }
  if (candidate.endsWith('\n') || candidate.endsWith('\r')) {
    throw new GateUsageError('Candidate input must not end with a carriage return or line feed. Remove the terminal line break before the final gate.');
  }
  return { candidate, candidateBytes };
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new GateUsageError(`${flag} requires a value.`);
  return value;
}

function parseArgs(argv) {
  const options = {
    input: null,
    stdin: false,
    includeCode: false,
    format: 'text',
    failOn: 'review',
    rulesSha256: null,
    minWords: null,
    maxWords: null,
    allowReview: new Set()
  };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (seen.has(arg)) throw new GateUsageError(`Duplicate argument: ${arg}`);
    if (arg === '--stdin') {
      options.stdin = true;
      seen.add(arg);
    } else if (arg === '--include-code') {
      options.includeCode = true;
      seen.add(arg);
    } else if (['--input', '--format', '--fail-on', '--rules-sha256', '--min-words', '--max-words', '--allow-review'].includes(arg)) {
      const value = requiredValue(argv, index, arg);
      seen.add(arg);
      if (arg === '--input') options.input = value;
      else if (arg === '--format') options.format = value;
      else if (arg === '--fail-on') options.failOn = value;
      else if (arg === '--rules-sha256') options.rulesSha256 = value.toLowerCase();
      else if (arg === '--min-words') options.minWords = Number(value);
      else if (arg === '--max-words') options.maxWords = Number(value);
      else {
        if (!/^AAW(?:ZH)?\d{3}@\d+(?:,AAW(?:ZH)?\d{3}@\d+)*$/u.test(value)) {
          throw new GateUsageError('--allow-review requires comma-separated occurrence IDs such as AAWZH012@35.');
        }
        options.allowReview = new Set(value.split(','));
      }
      index += 1;
    } else {
      throw new GateUsageError(`Unsupported check-final argument: ${arg}`);
    }
  }
  if (options.format !== 'text') throw new GateUsageError('check-final supports only --format text.');
  if (options.failOn !== 'review') throw new GateUsageError('check-final requires --fail-on review.');
  if (options.rulesSha256 !== null && !/^[a-f0-9]{64}$/u.test(options.rulesSha256)) {
    throw new GateUsageError('--rules-sha256 requires a 64-character hexadecimal digest.');
  }
  for (const [flag, value] of [['--min-words', options.minWords], ['--max-words', options.maxWords]]) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new GateUsageError(`${flag} requires a nonnegative integer.`);
    }
  }
  if (options.minWords !== null && options.maxWords !== null && options.minWords > options.maxWords) {
    throw new GateUsageError('--min-words cannot exceed --max-words.');
  }
  if (options.input && options.stdin) throw new GateUsageError('Choose --input or --stdin, not both.');
  if (options.input === '-') {
    options.input = null;
    options.stdin = true;
  }
  if (!options.input && !options.stdin) throw new GateUsageError('Missing --input or --stdin.');
  return options;
}

function wordLimitFailure(result, options) {
  const words = result.source.words;
  if (options.minWords !== null && words < options.minWords) {
    return `Word count ${words} is below the required minimum ${options.minWords}.`;
  }
  if (options.maxWords !== null && words > options.maxWords) {
    return `Word count ${words} exceeds the required maximum ${options.maxWords}.`;
  }
  return null;
}

function privateTextOutput(result, limitFailure, allowedReview) {
  const blocking = result.summary.blocking + (limitFailure ? 1 : 0);
  const unresolvedReview = result.findings.filter(
    (item) => item.level === 'review' && !allowedReview.has(item.occurrence_id)
  );
  const state = blocking || unresolvedReview.length ? 'BLOCK' : result.summary.advisory ? 'REVIEW' : 'PASS';
  const lines = [
    `中文去 AI 味扫描：${state}`,
    `blocking=${blocking} review=${result.summary.review} unresolved_review=${unresolvedReview.length} advisory=${result.summary.advisory}`
  ];
  for (const item of result.findings) {
    const label = item.level === 'review' && allowedReview.has(item.occurrence_id)
      ? 'ALLOWED_REVIEW'
      : item.level.toUpperCase();
    lines.push(`[${label}] ${item.occurrence_id} ${item.rule} ${item.location.start.line}:${item.location.start.column} ${item.message}`);
  }
  if (limitFailure) lines.push(`[BLOCKING] format.word_count ${limitFailure}`);
  lines.push('机械扫描通过不等于可以交付。仍需静默执行段落账本、一个回答、跨章节主要落点、读者提示删除、来源沉默、关系范围、全称量词、逐项覆盖、未来因果证明、能力升级、复述标签、建议只说一次和首尾段检查。任何修改后都要重跑。');
  lines.push(`仍需人工语义检查：${result.semantic_checks_not_performed.join('、')}。`);
  return `${lines.join('\n')}\n`;
}

function verifiedRulesOutput(digest) {
  return `${VERIFIED_RULES_MARKER}\nsha256=${digest}\n${ACTIVE_RULES_MARKER}\n`;
}

function candidateReceiptOutput(candidate, candidateBytes, result, rulesDigest) {
  const lines = candidate.split(/\r\n|\r|\n/u).length;
  const digest = createHash('sha256').update(candidateBytes).digest('hex');
  return [
    CANDIDATE_RECEIPT_BEGIN_MARKER,
    `candidate_sha256=${digest}`,
    `candidate_bytes=${candidateBytes.length}`,
    `candidate_words=${result.source.words}`,
    `candidate_lines=${lines}`,
    `rules_sha256=${rulesDigest}`,
    CANDIDATE_RECEIPT_END_MARKER,
    ''
  ].join('\n');
}

export function runCli(argv = [], io = {}) {
  const stdout = io.stdout || { write(chunk) { fs.writeSync(1, String(chunk)); } };
  const stderr = io.stderr || { write(chunk) { fs.writeSync(2, String(chunk)); } };
  try {
    const options = parseArgs(argv);
    const activeRules = buildActiveRules(io.skillDir || SKILL_DIR);
    const chunks = splitActiveRules(activeRules);
    const digest = activeRulesSha256(activeRules);
    if (options.rulesSha256 !== null && options.rulesSha256 !== digest) {
      throw new GateUsageError('Active rules do not match --rules-sha256. Reload the chunk manifest and all chunks.');
    }
    if (chunks.length > 1 && options.rulesSha256 === null) {
      throw new GateUsageError('Active rules require numbered chunks. Read the manifest and every digest-bound chunk, then rerun check-final with --rules-sha256 <manifest digest>.');
    }
    const sourceKind = options.stdin ? 'stdin' : 'file';
    const sourceLabel = options.stdin ? 'stdin' : path.basename(options.input);
    const { candidate, candidateBytes } = readCandidate(options, io);
    const result = scanText(candidate, {
      includeCode: options.includeCode,
      sourceKind,
      sourceLabel
    });
    const reviewIds = new Set(
      result.findings.filter((item) => item.level === 'review').map((item) => item.occurrence_id)
    );
    for (const allowed of options.allowReview) {
      if (!reviewIds.has(allowed)) {
        throw new GateUsageError(`--allow-review occurrence was not found: ${allowed}`);
      }
    }
    const limitFailure = wordLimitFailure(result, options);
    const unresolvedReview = result.findings.some(
      (item) => item.level === 'review' && !options.allowReview.has(item.occurrence_id)
    );
    stdout.write(chunks.length > 1 ? verifiedRulesOutput(digest) : activeRules);
    stdout.write(`${SCAN_BEGIN_MARKER}\n`);
    stdout.write(privateTextOutput(result, limitFailure, options.allowReview));
    if (result.summary.blocking > 0 || limitFailure || unresolvedReview) {
      stdout.write(`${BLOCKED_MARKER}\n`);
      return 1;
    }
    stdout.write(candidateReceiptOutput(candidate, candidateBytes, result, digest));
    stdout.write(`${FINAL_CHECK_MARKER}\n`);
    return 0;
  } catch (error) {
    stderr.write(`check-final: ${error.message}\n`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : '';
if (import.meta.url === invokedPath) process.exitCode = runCli(process.argv.slice(2));
