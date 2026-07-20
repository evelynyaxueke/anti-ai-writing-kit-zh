import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const operations = fs.readFileSync(path.join(SKILL_DIR, 'operations', 'kit-operations.md'), 'utf8');
const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const readme = fs.readFileSync(path.join(SKILL_DIR, 'README.md'), 'utf8');
const agents = fs.readFileSync(path.join(SKILL_DIR, 'AGENTS.md'), 'utf8');

test('normal load replies distinguish default and customized rules', () => {
  assert.match(operations, /已加载。本次会使用 SKILL\.md 控制器和你的定制规则。请发送文章、主题或写作需求。/u);
  assert.match(operations, /已加载。没有找到定制文件，所以会使用 SKILL\.md 控制器和默认规则。请发送文章、主题或写作需求。/u);
});

test('AI-smell questions and complaints require confirmation without editing', () => {
  assert.match(skill, /抱怨、讨厌、指出某种 AI 味习惯时，读完 `operations\/kit-operations\.md`/u);
  assert.match(operations, /要我把这个加成一条规则吗？/u);
  assert.match(operations, /Do not save the complaint or edit any file without confirmation/u);
});

test('normal rule additions use the customized file only', () => {
  assert.match(operations, /Every rule added during normal use goes to `skill-customized\.md`/u);
  assert.match(operations, /Do not offer `SKILL\.md` as a second target/u);
  assert.match(operations, /If the customized file is missing, create the compact customized file first/u);
  assert.doesNotMatch(operations, /要加到你的个人定制文件，还是默认 SKILL\.md？/u);
  assert.match(readme, /正常使用时添加的每一条规则都写入 `skill-customized\.md`/u);
  assert.match(readme, /使用“中文去 AI 味写作套件”。把这条加到我的规则/u);
  assert.match(readme, /没有得到确认时，抱怨不会写入规则/u);
  assert.doesNotMatch(readme, /加到默认 SKILL\.md/u);
});

test('reset replies and deletion scope are fixed', () => {
  assert.match(operations, /Delete only `skill-customized\.md`/u);
  assert.match(operations, /重置完成。我删除了 skill-customized\.md。除非你再次定制，否则会使用 SKILL\.md 控制器和默认规则。/u);
  assert.match(operations, /没有找到定制文件。现在已经在使用 SKILL\.md 控制器和默认规则。/u);
});

test('operational messages are exempt from prose cleanup', () => {
  assert.match(operations, /control messages, not prose deliverables/u);
  assert.match(skill, /固定回复和确认问题不是中文成稿或修改稿/u);
});

test('guided customization contains all fixed interaction points', () => {
  assert.match(operations, /现在开始吗？/u);
  assert.match(operations, /这里有什么要添加、删除或修改的吗？/u);
  assert.match(operations, /你有没有想让这个规则记住的偏好、风格描述、例子、参考或特别讨厌的表达？/u);
  assert.match(operations, /完成。我已经按你的选择更新了 skill-customized\.md。/u);
  assert.match(operations, /Include every explanation, phrase list, edge case, bad example, and good example/u);
  assert.match(operations, /第 \[number\] 节：\[section title\][\s\S]*这一节包括：[\s\S]*现在开始这一节吗？/u);
  assert.match(operations, /full subsection number and title/u);
});

test('public rules and examples have one source of truth', () => {
  assert.match(skill, /本文件是默认规则、解释、句式族和例子的唯一来源/u);
  assert.match(operations, /single source of truth for default Chinese rules, explanations, phrase lists, and examples/u);
  assert.doesNotMatch(`${skill}\n${operations}\n${readme}\n${agents}`, /references\/patterns-and-examples\.md/u);
});

test('chunked loading forbids combined chunk calls', () => {
  assert.match(skill, /不要用循环、管道、批处理、复合命令、并行调用或一次工具调用执行多个分块/u);
  assert.match(operations, /never combine chunks in a loop, pipeline, batch, compound command, parallel call, or one tool invocation/u);
});
