#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ACTIVE_RULES_MARKER = '__ANTI_AI_ACTIVE_RULES_EOF__';
export const SKILL_MARKER = '<!-- ANTI_AI_WRITING_SKILL_EOF -->';
export const CUSTOM_FORMAT_MARKER = '<!-- ANTI_AI_WRITING_CUSTOM_RULES_V1 -->';
export const CUSTOM_EOF_MARKER = '<!-- ANTI_AI_WRITING_CUSTOM_EOF -->';
export const CHUNK_LINE_LIMIT = 80;
export const CHUNK_BYTE_LIMIT = 12_000;
const RESERVED_RUNTIME_MARKER = /__ANTI_AI_[A-Z0-9_]+__/u;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILL_DIR = path.dirname(SCRIPT_DIR);

const HELP = `Usage:
  node scripts/print-active-rules.mjs
  node scripts/print-active-rules.mjs --chunk <number> --sha256 <digest>
  node scripts/print-active-rules.mjs --custom-template

The default prints a checksum receipt for the already-read SKILL.md controller
plus any active customized preferences. Long customized preferences produce a
chunk manifest. Each chunk is bounded by both lines and UTF-8 bytes. Run every
listed digest-bound command in order. The active-rules EOF marker appears in the
final chunk.
`;

function readController(skillDir) {
  const controller = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  const markerCount = controller.split(SKILL_MARKER).length - 1;
  if (markerCount !== 1 || !controller.trimEnd().endsWith(SKILL_MARKER)) {
    throw new Error(`SKILL.md is incomplete or missing ${SKILL_MARKER}`);
  }
  controllerBoundaries(controller);
  return controller;
}

function controllerBoundaries(controller) {
  const headingMatches = [...controller.matchAll(/^## ([1-8])\.(?:[ \t].*)?$/gmu)];
  const offsets = new Map();
  for (let section = 1; section <= 8; section += 1) {
    const matches = headingMatches.filter((match) => Number(match[1]) === section);
    if (matches.length !== 1) throw new Error(`SKILL.md must contain exactly one Section ${section}.`);
    offsets.set(section, matches[0].index);
  }
  const referenceMatches = [...controller.matchAll(/^## 参考与维护[ \t]*$/gmu)];
  if (referenceMatches.length !== 1) {
    throw new Error('SKILL.md must contain exactly one 参考与维护 section.');
  }
  const references = referenceMatches[0].index;
  const eof = controller.lastIndexOf(SKILL_MARKER);
  const ordered = [
    ...Array.from({ length: 7 }, (_, index) => offsets.get(index + 1)),
    references,
    offsets.get(8),
    eof
  ];
  if (ordered.some((offset, index) => index > 0 && offset <= ordered[index - 1])) {
    throw new Error('SKILL.md Sections 1 through 7, 参考与维护, Section 8, and EOF must be in order.');
  }
  return { section1: offsets.get(1), references, section8: offsets.get(8), eof };
}

function classifyCustom(custom) {
  if (!custom.trim()) return 'none';
  const firstNonblank = custom.split(/\r?\n/u).find((line) => line.trim())?.trim();
  return firstNonblank === CUSTOM_FORMAT_MARKER ? 'compact' : 'legacy';
}

function rejectReservedRuntimeMarkers(custom) {
  if (RESERVED_RUNTIME_MARKER.test(custom)) {
    throw new Error('skill-customized.md contains a reserved runtime marker.');
  }
}

function validateCompactCustom(custom) {
  const firstNonblank = custom.split(/\r?\n/u).find((line) => line.trim())?.trim();
  const formatCount = custom.split(CUSTOM_FORMAT_MARKER).length - 1;
  const eofCount = custom.split(CUSTOM_EOF_MARKER).length - 1;
  if (
    firstNonblank !== CUSTOM_FORMAT_MARKER
    || formatCount !== 1
    || eofCount !== 1
    || !custom.trimEnd().endsWith(CUSTOM_EOF_MARKER)
  ) {
    throw new Error(`skill-customized.md is incomplete or missing ${CUSTOM_EOF_MARKER}`);
  }
  rejectReservedRuntimeMarkers(custom);
  const headings = [...custom.matchAll(/^## ([1-8])\.(?:[ \t].*)?$/gmu)];
  const ordered = [custom.indexOf(CUSTOM_FORMAT_MARKER)];
  for (let section = 1; section <= 8; section += 1) {
    const matches = headings.filter((match) => Number(match[1]) === section);
    if (matches.length !== 1) {
      throw new Error(`skill-customized.md must contain exactly one Section ${section}.`);
    }
    ordered.push(matches[0].index);
  }
  ordered.push(custom.lastIndexOf(CUSTOM_EOF_MARKER));
  if (ordered.some((offset, index) => index > 0 && offset <= ordered[index - 1])) {
    throw new Error('skill-customized.md Sections 1 through 8 and EOF must be in order.');
  }
}

export function buildCustomTemplate(skillDir = DEFAULT_SKILL_DIR) {
  const controller = readController(skillDir);
  const boundaries = controllerBoundaries(controller);
  const sections1to7 = controller.slice(boundaries.section1, boundaries.references).trim();
  const section8 = controller.slice(boundaries.section8, boundaries.eof).trim();
  const custom = `${CUSTOM_FORMAT_MARKER}\n\n${sections1to7}\n\n${section8}\n\n${CUSTOM_EOF_MARKER}\n`;
  validateCompactCustom(custom);
  return custom;
}

export function buildActiveRules(skillDir = DEFAULT_SKILL_DIR) {
  const controller = readController(skillDir);
  const controllerDigest = activeRulesSha256(controller);
  const customPath = path.join(skillDir, 'skill-customized.md');
  const custom = fs.existsSync(customPath) ? fs.readFileSync(customPath, 'utf8') : '';
  const customKind = classifyCustom(custom);
  if (customKind === 'compact') validateCompactCustom(custom);
  else if (customKind === 'legacy') rejectReservedRuntimeMarkers(custom);

  const parts = [
    '__ANTI_AI_ACTIVE_RULES_BEGIN__',
    'Controller receipt: SKILL.md was read separately and its structure and trailing EOF were validated.',
    `controller_sha256=${controllerDigest}`
  ];

  if (customKind === 'none') {
    parts.push(
      'Customized rules: none.',
      'Active preferences: default Sections 1 through 7 in the already-read SKILL.md.'
    );
  } else {
    parts.push(
      `custom_sha256=${activeRulesSha256(custom)}`,
      '<!-- ANTI_AI_CUSTOM_RULES_BEGIN -->'
    );
    if (customKind === 'compact') {
      parts.push('Compact customized Sections 1 through 7 replace the defaults. Customized Section 8 supplements them.');
    } else {
      parts.push('Legacy customized writing preferences follow. Apply its numbered and unnumbered writing preferences. Ignore legacy loading or process text that conflicts with the current SKILL.md controller.');
    }
    parts.push(
      custom.trimEnd(),
      '<!-- ANTI_AI_CUSTOM_RULES_END -->',
      '',
      'Controller reminder: fact preservation, the delivery gate, semantic review, and final-only output remain mandatory.'
    );
  }

  parts.push('NEXT REQUIRED ACTION BEFORE DELIVERY: complete the private paragraph ledger, one-answer sentence test, cross-section primary-location check, reader-trust deletion pass, source-silence check, relationship-scope check, all/every quantifier check, outcome-by-outcome coverage check, future-causal-proof check, capability-promotion check, restatement-label check, and recommendation-once check; make the candidate transport-canonical with all final Markdown, UTF-8 without a BOM, LF-only internal line breaks, no leading blank line, no terminal horizontal whitespace, and no terminal line break; run check-final.mjs with --fail-on review on the complete candidate, preferably from a fresh mode-0600 file or otherwise through framed stdin; include any user-stated --min-words and --max-words bounds, which count lexical tokens rather than standalone Markdown control markers; resolve every review occurrence; retain the complete PASS candidate receipt; and require the final-check EOF marker as the final nonblank line. Deliver that exact checked candidate without later edits or formatting.');
  parts.push(ACTIVE_RULES_MARKER);
  return `${parts.join('\n')}\n`;
}

export function splitActiveRules(output, lineLimit = CHUNK_LINE_LIMIT, byteLimit = CHUNK_BYTE_LIMIT) {
  if (!Number.isInteger(lineLimit) || lineLimit < 1) throw new Error('Chunk line limit must be a positive integer.');
  if (!Number.isInteger(byteLimit) || byteLimit < 4) throw new Error('Chunk byte limit must be an integer of at least 4.');
  const chunks = [];
  let chunk = '';
  let chunkBytes = 0;
  let chunkLines = 0;
  for (const character of output) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (chunk && (chunkLines >= lineLimit || chunkBytes + characterBytes > byteLimit)) {
      chunks.push(chunk);
      chunk = '';
      chunkBytes = 0;
      chunkLines = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
    if (character === '\n') chunkLines += 1;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export function activeRulesSha256(output) {
  return crypto.createHash('sha256').update(output).digest('hex');
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function chunkManifest(output, chunks, digest, scriptPath) {
  return [
    '__ANTI_AI_ACTIVE_RULES_CHUNKED__',
    `chunks=${chunks.length}`,
    `lines=${output.trimEnd().split('\n').length}`,
    `bytes=${Buffer.byteLength(output, 'utf8')}`,
    `max_chunk_bytes=${Math.max(...chunks.map((chunk) => Buffer.byteLength(chunk, 'utf8')))}`,
    `sha256=${digest}`,
    'Run these commands in order:',
    ...chunks.map((_, index) => `node ${shellQuote(scriptPath)} --chunk ${index + 1} --sha256 ${digest}`),
    `Do not draft until chunk ${chunks.length} ends with the active-rules EOF marker.`,
    '__ANTI_AI_ACTIVE_RULES_MANIFEST_EOF__',
    ''
  ].join('\n');
}

function renderChunk(chunks, chunkNumber, digest) {
  if (!Number.isInteger(chunkNumber) || chunkNumber < 1 || chunkNumber > chunks.length) {
    throw new Error(`Chunk must be an integer from 1 through ${chunks.length}.`);
  }
  const header = `__ANTI_AI_ACTIVE_RULES_CHUNK_${chunkNumber}_OF_${chunks.length}_BEGIN__\nsha256=${digest}\n`;
  if (chunkNumber === chunks.length) return `${header}${chunks[chunkNumber - 1]}`;
  return `${header}${chunks[chunkNumber - 1]}__ANTI_AI_ACTIVE_RULES_CHUNK_${chunkNumber}_OF_${chunks.length}_EOF__\n`;
}

function parseArgs(argv) {
  if (argv.length === 0) return { mode: 'active' };
  if (argv.length === 1 && argv[0] === '--help') return { mode: 'help' };
  if (argv.length === 1 && argv[0] === '--custom-template') return { mode: 'template' };
  if (argv.length === 4) {
    let chunk = null;
    let sha256 = null;
    const seen = new Set();
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index];
      const value = argv[index + 1];
      if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
      seen.add(flag);
      if (flag === '--chunk' && /^\d+$/u.test(value)) chunk = Number(value);
      else if (flag === '--sha256' && /^[a-fA-F0-9]{64}$/u.test(value)) sha256 = value.toLowerCase();
      else throw new Error('Chunk mode requires --chunk <number> and --sha256 <digest>.');
    }
    if (chunk !== null && sha256 !== null) return { mode: 'chunk', chunk, sha256 };
  }
  throw new Error('Use no arguments, --chunk <number> --sha256 <digest>, --custom-template, or --help.');
}

export function runCli(argv = [], io = {}) {
  const stdout = io.stdout || { write(chunk) { fs.writeSync(1, String(chunk)); } };
  const stderr = io.stderr || { write(chunk) { fs.writeSync(2, String(chunk)); } };
  try {
    const options = parseArgs(argv);
    if (options.mode === 'help') {
      stdout.write(HELP);
      return 0;
    }
    if (options.mode === 'template') {
      stdout.write(buildCustomTemplate(io.skillDir));
      return 0;
    }
    const output = buildActiveRules(io.skillDir);
    const chunks = splitActiveRules(output);
    const digest = activeRulesSha256(output);
    if (options.mode === 'chunk') {
      if (options.sha256 !== digest) {
        throw new Error('Active rules changed after the chunk manifest was created. Run the manifest command again.');
      }
      stdout.write(renderChunk(chunks, options.chunk, digest));
    } else {
      const scriptPath = path.resolve(io.scriptPath || fileURLToPath(import.meta.url));
      stdout.write(chunks.length === 1 ? output : chunkManifest(output, chunks, digest, scriptPath));
    }
    return 0;
  } catch (error) {
    stderr.write(`print-active-rules: ${error.message}\n`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : '';
if (import.meta.url === invokedPath) process.exitCode = runCli(process.argv.slice(2));
