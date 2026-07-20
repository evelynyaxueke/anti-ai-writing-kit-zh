#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCANNER_VERSION = '0.1.0';
export const SCHEMA_VERSION = '1.0';
export const RULESET_VERSION = '2026-07-20.1';

const SEMANTIC_CHECKS = [
  '事实和原意', '命题主要落点', '来源沉默', '群体边界', '逐项覆盖状态', '未来因果证明能力',
  '能力升级', '关系范围', '段落贡献', '重复推理', '建议重复', '读者适配', '自然节奏'
];

const VOCABULARY = [
  '赋能', '抓手', '闭环', '全链路', '底层逻辑', '方法论', '生态', '矩阵', '赛道', '破局', '解法',
  '重塑', '颠覆', '引领', '助力', '加持', '沉淀', '洞察', '深耕', '构建', '打造', '布局', '焕新',
  '革新', '迭代', '升级', '高效', '智能', '精准', '一站式', '全方位', '多维度', '系统性',
  '前所未有', '尤为重要', '至关重要'
];

const HELP = `Usage:
  node scripts/scan-writing.mjs --input <file> [options]
  node scripts/scan-writing.mjs --stdin [options]

Options:
  --input <file>              Read the candidate from a file. Use - for stdin.
  --stdin                     Read the candidate from stdin.
  --format <text|json>        Output format. Default: text.
  --fail-on <blocking|review|never>
  --include-code              Scan fenced and inline code.
  --version
  --help
`;

class CliUsageError extends Error {}

function maskIgnoredRegions(text, includeCode) {
  if (includeCode) return text;
  const chars = text.split('');
  let fence = null;
  let offset = 0;
  for (const line of text.split(/(?<=\n)/u)) {
    const content = line.replace(/[\r\n]+$/u, '');
    const opener = fence ? null : content.match(/^ {0,3}(`{3,}|~{3,})/u);
    const closer = fence ? content.match(/^ {0,3}(`+|~+)[ \t]*$/u) : null;
    if (opener) fence = { char: opener[1][0], length: opener[1].length };
    const closes = Boolean(closer && closer[1][0] === fence?.char && closer[1].length >= fence.length);
    if (fence || opener || closes) {
      for (let index = 0; index < line.length; index += 1) {
        if (!['\n', '\r'].includes(line[index])) chars[offset + index] = ' ';
      }
    }
    if (closes) fence = null;
    offset += line.length;
  }

  const fenced = chars.join('');
  for (let index = 0; index < fenced.length; index += 1) {
    if (fenced[index] !== '`') continue;
    let length = 1;
    while (fenced[index + length] === '`') length += 1;
    const close = fenced.indexOf('`'.repeat(length), index + length);
    if (close < 0) continue;
    for (let cursor = index; cursor < close + length; cursor += 1) {
      if (!['\n', '\r'].includes(chars[cursor])) chars[cursor] = ' ';
    }
    index = close + length - 1;
  }
  return chars.join('');
}

function lineBounds(text, offset) {
  const start = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const newline = text.indexOf('\n', offset);
  const end = newline < 0 ? text.length : newline;
  return { text: text.slice(start, end) };
}

function location(text, offset, length) {
  const before = text.slice(0, offset);
  const line = (before.match(/\n/gu) || []).length + 1;
  const lineStart = before.lastIndexOf('\n') + 1;
  const column = [...text.slice(lineStart, offset)].length + 1;
  const endBefore = text.slice(0, offset + length);
  const endLine = (endBefore.match(/\n/gu) || []).length + 1;
  const endLineStart = endBefore.lastIndexOf('\n') + 1;
  return {
    start: { line, column, offset },
    end: { line: endLine, column: [...text.slice(endLineStart, offset + length)].length + 1, offset: offset + length }
  };
}

function isQuoted(text, offset) {
  const line = lineBounds(text, offset).text;
  if (/^\s*>/u.test(line)) return true;
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  return before.lastIndexOf('“') > before.lastIndexOf('”') && /”/u.test(after);
}

function finding(text, spec, offset, match, masked) {
  const quoted = isQuoted(masked, offset);
  const level = quoted && spec.level === 'blocking' ? 'review' : spec.level;
  return {
    occurrence_id: `${spec.id}@${offset}`,
    rule_id: spec.id,
    rule: spec.name,
    level,
    confidence: spec.confidence || 'exact',
    message: spec.message,
    location: location(text, offset, match.length),
    context: quoted ? 'quoted' : 'prose',
    match,
    excerpt: lineBounds(text, offset).text.trim(),
    suggestion: spec.suggestion
  };
}

function addRegexFindings(target, text, masked, spec) {
  const flags = spec.pattern.flags.includes('g') ? spec.pattern.flags : `${spec.pattern.flags}g`;
  for (const match of masked.matchAll(new RegExp(spec.pattern.source, flags))) {
    const value = spec.capture ? match[spec.capture] : match[0];
    if (!value?.trim()) continue;
    const relative = spec.capture ? match[0].indexOf(value) : 0;
    const offset = match.index + relative;
    target.push(finding(text, spec, offset, text.slice(offset, offset + value.length), masked));
  }
}

export function countWords(text) {
  const visible = text
    .replace(/^\s*(?:#{1,6}|[-*+]|\d+[.)]|>)[ \t]*/gmu, '')
    .replace(/`[^`]*`/gu, '');
  const han = visible.match(/\p{Script=Han}/gu)?.length || 0;
  const latin = visible.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) || [];
  return han + latin.filter((token) => !/\p{Script=Han}/u.test(token)).length;
}

function sentenceRecords(text, masked) {
  const records = [];
  for (const match of masked.matchAll(/[^。！？!?\n]+[。！？!?]+|[^。！？!?\n]+$/gu)) {
    const visible = match[0].trim();
    if (!visible || /^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/u.test(visible)) continue;
    const leading = match[0].length - match[0].trimStart().length;
    const offset = match.index + leading;
    const body = visible.replace(/[。！？!?]+$/u, '').replace(/\s/gu, '');
    records.push({ offset, endOffset: offset + visible.length, text: text.slice(offset, offset + visible.length), chars: [...body].length });
  }
  return records;
}

export function scanText(text, options = {}) {
  const includeCode = Boolean(options.includeCode);
  const sourceKind = options.sourceKind || 'text';
  const sourceLabel = options.sourceLabel || sourceKind;
  const masked = maskIgnoredRegions(text, includeCode);
  const findings = [];

  if (!text.trim()) {
    findings.push(finding(text, { id: 'AAWZH000', name: 'input.empty', level: 'blocking', message: '候选稿为空。', suggestion: '提供完整候选稿。' }, 0, '', masked));
  }

  const specs = [
    { id: 'AAWZH001', name: 'punctuation.em_dash', level: 'blocking', pattern: /——|—/gu, message: '发现破折号式节奏。', suggestion: '按句意改用句号、逗号、冒号或括号。' },
    { id: 'AAWZH002', name: 'punctuation.stacked_exclamation', level: 'blocking', pattern: /[!！]{2,}/gu, message: '发现连续感叹号。', suggestion: '保留一个或改写句子。' },
    { id: 'AAWZH003', name: 'chatbot.residue', level: 'blocking', pattern: /(?:^|\n)[ \t]*((?:当然可以|没问题|这是一个很好的问题|你说得很对|你的观察很敏锐|希望对你有帮助|如有需要，我还可以)[。！!]*)[ \t]*(?=\n|$)/gmu, capture: 1, message: '发现助手腔残留。', suggestion: '从成稿中删除。' },
    { id: 'AAWZH010', name: 'authority.unnamed', level: 'review', pattern: /(?:研究|调研|数据显示|专家|业内人士|相关报告)(?:普遍)?(?:显示|表明|认为|指出|发现|建议)/gu, message: '发现可能没有来源的权威表达。', suggestion: '写出来源，或直接陈述有依据的判断。' },
    { id: 'AAWZH011', name: 'transition.filler', level: 'review', pattern: /(?:^|[。！？!?]\s*|\n)[ \t]*((?:此外|与此同时|进一步|更重要的是|值得一提的是|值得注意的是|需要注意的是|总体来看|基于此|因此可以看出|话虽如此))/gmu, capture: 1, message: '发现空转过渡候选。', suggestion: '直接进入下一件事，或写出真实逻辑关系。' },
    { id: 'AAWZH012', name: 'contrast.false_candidate', level: 'review', confidence: 'candidate', pattern: /(?:不是|并非|不在于|不只是|不仅是|不止是|不单是)[^。！？!?\n]{1,80}(?:而是|是在于|更是|还要|还在于|而在于)|(?:你以为|表面上是)[^。！？!?\n]{1,80}(?:其实|实际上)|(?:没有|少一点|别再)[^。！？!?\n]{1,60}(?:只有|多一点|开始)/gu, message: '发现先否定再揭示或公式化加法候选。', suggestion: '保留真实信息，改成直接陈述；事实纠正可放行。' },
    { id: 'AAWZH013', name: 'phrase.importance_or_insight', level: 'review', confidence: 'candidate', pattern: /值得注意的是|真正重要的是|这里有个关键点|归根结底|说到底|本质上|核心在于|重点来了|真正的教训是/gu, message: '发现宣布重要性或洞察的句式。', suggestion: '直接写事实、后果或判断。' },
    { id: 'AAWZH014', name: 'opening.majority_hook', level: 'review', confidence: 'candidate', pattern: /(?:大多数人|所有人|没人|没有人|很少有人|大家)(?:都)?(?:没|没有|会|以为|意识到|知道|讨论|关注|告诉你)/gu, message: '发现虚构多数人钩子候选。', suggestion: '写出具体群体和依据，或删除人群包装。' },
    { id: 'AAWZH015', name: 'phrase.generic_ai_change', level: 'review', confidence: 'candidate', pattern: /(?:随着)?(?:人工智能|AI|技术)(?:的)?(?:不断|快速|迅速|持续)?(?:发展|演进|进步|迭代|变化)|技术日新月异/gu, message: '发现通用技术变化句。', suggestion: '写具体变化；没有具体变化就删除。' },
    { id: 'AAWZH016', name: 'claim.generic_outcome', level: 'review', confidence: 'candidate', pattern: /(?:带来|实现|取得|创造|产生|推动)(?:了)?(?:显著|明显|巨大|积极|可观|实质性|全面)?(?:成果|成效|影响|价值|提升|收益|改善|进步)/gu, message: '发现没有具体指标或效果的结果判断。', suggestion: '写出来源中的可观察结果，或删掉空修饰。' },
    { id: 'AAWZH017', name: 'signpost.reader_coaching', level: 'review', confidence: 'candidate', pattern: /(?:这个|这一)(?:区别|范围|限制|问题|结论)(?:非常)?(?:重要|值得注意)|这也说明了|由此可以看出|这意味着什么/gu, message: '发现指导读者如何理解的标签句。', suggestion: '直接写具体限制、后果或新推论。' },
    { id: 'AAWZH018', name: 'formula.packaged_verdict', level: 'review', confidence: 'candidate', pattern: /(?:更|最)?(?:谨慎|合理|清晰|真实|稳妥|准确)的(?:答案|结论|判断)(?:是|应该是)|答案取决于条件|影响是有条件的/gu, message: '发现包装式结论。', suggestion: '直接写条件和结论。' },
    { id: 'AAWZH019', name: 'heading.placeholder', level: 'review', confidence: 'candidate', pattern: /(?:^|\n)[ \t]*(?:#{1,6}[ \t]+)?((?:引言|结论|核心要点|背景介绍|挑战与机遇|未来展望|总结与反思))[ \t]*(?=\n|$)/gmu, capture: 1, message: '发现占位标题。', suggestion: '需要导航时使用直接对象标题，否则删除。' },
    { id: 'AAWZH021', name: 'format.emoji_bullet', level: 'review', confidence: 'candidate', pattern: /(?:^|\n)[ \t]*(\p{Extended_Pictographic}(?:\uFE0F)?)(?=[ \t]+)/gmu, capture: 1, message: '发现 emoji 项目符号候选。', suggestion: '专业文本使用自然段或标准列表。' },
    { id: 'AAWZH022', name: 'rhythm.triple_light_clause', level: 'review', confidence: 'candidate', pattern: /(?:^|[。！？!?]\s*|\n)[ \t]*([^，。！？!?\n]{2,12})，([^，。！？!?\n]{2,12})，([^，。！？!?\n]{2,12})[。！？!?]/gmu, capture: 0, message: '发现三联轻句候选。', suggestion: '检查并列是否替代了真实推进；必要时合并并补动作或因果。' }
  ];

  for (const spec of specs) addRegexFindings(findings, text, masked, spec);

  const vocabPattern = new RegExp(VOCABULARY.sort((a, b) => b.length - a.length).join('|'), 'gu');
  addRegexFindings(findings, text, masked, {
    id: 'AAWZH020', name: 'vocabulary.prohibited_candidate', level: 'review', confidence: 'candidate', pattern: vocabPattern,
    message: '发现第一优先级 AI 词候选。', suggestion: '除非字面或专业语境准确，改写成具体动作、对象或结果。'
  });

  const firstProse = masked.search(/\S/u);
  if (firstProse >= 0) {
    const opening = masked.slice(firstProse).match(/^(?:随着[^。！？!?\n]{1,60}(?:发展|变化)|在当今社会|在信息爆炸的时代|你有没有发现|不知道大家有没有|最近我发现一个很有意思的现象|今天想和大家聊聊|大家好，今天我们来聊一聊|先说结论|问题来了|事情是这样的)/u);
    if (opening) findings.push(finding(text, { id: 'AAWZH004', name: 'opening.dead', level: 'blocking', message: '发现库存开头。', suggestion: '从具体事实、场景、判断或动作开始。' }, firstProse, text.slice(firstProse, firstProse + opening[0].length), masked));
  }

  const trimmedEnd = masked.trimEnd();
  const closing = trimmedEnd.match(/(?:总的来说|综上所述|让我们一起期待|未来可期|这只是开始|未来有无限可能|希望这篇文章能给你启发)[^。！？!?\n]*[。！？!?]?$/u);
  if (closing) {
    const offset = trimmedEnd.length - closing[0].length;
    findings.push(finding(text, { id: 'AAWZH005', name: 'closing.generic', level: 'blocking', message: '发现库存结尾。', suggestion: '用最后一个新事实、动作或限制结束。' }, offset, text.slice(offset, offset + closing[0].length), masked));
  }
  const engagement = trimmedEnd.match(/(?:你怎么看|你有同感吗|评论区告诉我|你是不是也这样|你还想看什么)[？?。！!]*$/u);
  if (engagement) {
    const offset = trimmedEnd.length - engagement[0].length;
    findings.push(finding(text, { id: 'AAWZH006', name: 'ending.engagement_bait', level: 'review', confidence: 'candidate', message: '发现互动诱导结尾。', suggestion: '只有用户明确需要评论、投票或回复时保留。' }, offset, text.slice(offset, offset + engagement[0].length), masked));
  }

  const sentences = sentenceRecords(text, masked);
  for (let index = 0; index <= sentences.length - 3; index += 1) {
    const group = sentences.slice(index, index + 3);
    if (group.every((sentence) => sentence.chars >= 2 && sentence.chars <= 8)) {
      findings.push(finding(text, { id: 'AAWZH023', name: 'rhythm.stacked_short_sentences', level: 'advisory', confidence: 'heuristic', message: '连续三个短句可能形成口号节奏。', suggestion: '检查短句是否有信息；必要时合并或补充动作与因果。' }, group[0].offset, text.slice(group[0].offset, group[2].endOffset), masked));
      break;
    }
  }

  const rawLines = masked.split('\n');
  const listPattern = /^([ \t]*)([-*+]|\d+[.)])[ \t]+/u;
  for (let index = 0; index < rawLines.length; index += 1) {
    const item = rawLines[index].match(listPattern);
    if (!item) continue;
    const indent = item[1].length;
    const neighbors = [index - 1, index + 1].some((neighbor) => {
      const match = rawLines[neighbor]?.match(listPattern);
      return match && match[1].length === indent;
    });
    if (neighbors) continue;
    const offset = rawLines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0) + item[1].length;
    findings.push(finding(text, { id: 'AAWZH007', name: 'structure.one_item_list', level: 'blocking', message: '发现单项列表。', suggestion: '改成自然句。' }, offset, rawLines[index].slice(item[1].length), masked));
  }

  const seen = new Set();
  const deduped = findings.filter((item) => {
    const key = `${item.rule_id}:${item.location.start.offset}:${item.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.location.start.offset - b.location.start.offset || a.rule_id.localeCompare(b.rule_id));

  const summary = {
    blocking: deduped.filter((item) => item.level === 'blocking').length,
    review: deduped.filter((item) => item.level === 'review').length,
    advisory: deduped.filter((item) => item.level === 'advisory').length
  };
  summary.mechanical_pass = summary.blocking === 0;
  summary.semantic_review_required = true;

  return {
    schema_version: SCHEMA_VERSION,
    scanner: { name: 'anti-ai-writing-scan-zh', version: SCANNER_VERSION, ruleset_version: RULESET_VERSION, unicode_version: process.versions.unicode },
    location_units: { offset: 'utf16_code_unit_zero_based', line: 'one_based', column: 'unicode_code_point_one_based' },
    source: { kind: sourceKind, label: sourceLabel, sha256: crypto.createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text), words: countWords(text) },
    policy: { ignored_regions: includeCode ? [] : ['fenced_code', 'inline_code'] },
    summary,
    findings: deduped,
    semantic_checks_not_performed: SEMANTIC_CHECKS
  };
}

function requiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new CliUsageError(`${flag} requires a value.`);
  return value;
}

function parseArgs(argv) {
  const options = { format: 'text', failOn: 'blocking', includeCode: false, input: null, stdin: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') options.help = true;
    else if (arg === '--version') options.version = true;
    else if (arg === '--stdin') options.stdin = true;
    else if (arg === '--include-code') options.includeCode = true;
    else if (['--input', '--format', '--fail-on'].includes(arg)) {
      const value = requiredValue(argv, index, arg);
      if (arg === '--input') options.input = value;
      else if (arg === '--format') options.format = value;
      else options.failOn = value;
      index += 1;
    } else throw new CliUsageError(`Unknown argument: ${arg}`);
  }
  if (!['text', 'json'].includes(options.format)) throw new CliUsageError('Format must be text or json.');
  if (!['blocking', 'review', 'never'].includes(options.failOn)) throw new CliUsageError('Fail level must be blocking, review, or never.');
  if (options.input && options.stdin) throw new CliUsageError('Choose --input or --stdin, not both.');
  if (options.input === '-') { options.input = null; options.stdin = true; }
  if (!options.help && !options.version && !options.input && !options.stdin) throw new CliUsageError('Missing --input or --stdin.');
  return options;
}

function textOutput(result) {
  const state = result.summary.blocking ? 'BLOCK' : result.summary.review || result.summary.advisory ? 'REVIEW' : 'PASS';
  const lines = [`中文去 AI 味扫描：${state}`, `blocking=${result.summary.blocking} review=${result.summary.review} advisory=${result.summary.advisory}`];
  for (const item of result.findings) lines.push(`[${item.level.toUpperCase()}] ${item.occurrence_id} ${item.rule} ${item.location.start.line}:${item.location.start.column} ${JSON.stringify(item.match)} ${item.message}`);
  lines.push(`仍需人工语义检查：${result.semantic_checks_not_performed.join('、')}。`);
  return `${lines.join('\n')}\n`;
}

export function runCli(argv, io = {}) {
  const stdout = io.stdout || { write(chunk) { fs.writeSync(1, String(chunk)); } };
  const stderr = io.stderr || { write(chunk) { fs.writeSync(2, String(chunk)); } };
  try {
    const options = parseArgs(argv);
    if (options.help) { stdout.write(HELP); return 0; }
    if (options.version) { stdout.write(`${SCANNER_VERSION}\n`); return 0; }
    const sourceKind = options.stdin ? 'stdin' : 'file';
    const sourceLabel = options.stdin ? 'stdin' : path.basename(options.input);
    const input = options.stdin ? (io.stdinText ?? fs.readFileSync(0, 'utf8')) : fs.readFileSync(options.input, 'utf8');
    const result = scanText(input, { includeCode: options.includeCode, sourceKind, sourceLabel });
    result.policy.fail_on = options.failOn;
    stdout.write(options.format === 'json' ? `${JSON.stringify(result, null, 2)}\n` : textOutput(result));
    if (options.failOn === 'review' && (result.summary.blocking || result.summary.review)) return 1;
    if (options.failOn === 'blocking' && result.summary.blocking) return 1;
    return 0;
  } catch (error) {
    stderr.write(`scan-writing: ${error.message}\n`);
    return error instanceof CliUsageError || ['ENOENT', 'EACCES', 'EISDIR', 'ENOTDIR'].includes(error.code) ? 2 : 3;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : '';
if (import.meta.url === invokedPath) process.exitCode = runCli(process.argv.slice(2));
