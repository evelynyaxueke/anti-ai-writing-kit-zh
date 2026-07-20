# Kit operations

Use this file for loading without a writing task, customization, reset, rule additions, and maintenance. Read through `<!-- ANTI_AI_WRITING_OPERATIONS_EOF -->` before acting.

## File roles

1. `SKILL.md` is the permanent controller and compact default Chinese writing rules.
2. `skill-customized.md` is an optional local preference layer. It can replace default Sections 1 through 7 and supplement them with Section 8. It never replaces the controller.
3. `references/patterns-and-examples.md` holds expanded explanations, examples, and edge cases.
4. `scripts/print-active-rules.mjs` validates the controller and resolves customized preferences.
5. `scripts/check-final.mjs` reloads active rules, runs the scanner, enforces supplied length bounds, and emits candidate and rule hashes.
6. `scripts/scan-writing.mjs` performs deterministic Chinese mechanical checks. It does not judge meaning or truth.
7. `README.md` is the public manual. `AGENTS.md` is maintainer guidance.

## Invariants

- Follow the user's facts, constraints, and direct instructions first.
- Customization is opt-in. Do not create a customized file during normal writing, editing, loading, review, or explanation.
- The `SKILL.md` controller, fact-preservation rule, delivery gate, semantic check, and final-only requirement always remain active.
- A nonempty compact custom file replaces default Sections 1 through 7 and supplements them with Section 8. A whitespace-only file is absent.
- Never overwrite, regenerate, or silently migrate an existing customized file.
- A file whose first nonblank line is `<!-- ANTI_AI_WRITING_CUSTOM_RULES_V1 -->` is compact. Every other nonempty custom file is legacy, even if it quotes the marker later.
- Apply writing preferences from a legacy file, but ignore old loading or process text that conflicts with the controller. Edit a legacy file in place.
- Prefer a fresh mode-`0600` temporary file for the final gate. The candidate must contain every final Markdown character and use UTF-8 without a BOM, LF-only internal line breaks, no leading blank line, no terminal horizontal whitespace, and no terminal line break.
- Treat the latest complete PASS receipt and checked candidate as a locked pair. Any later character change requires the semantic check and gate again.
- A local PASS applies only to the supplied candidate. Without runtime comparison, never claim it proves the final assistant message is byte-for-byte identical.

## Resolve active rules

With Node.js, run `node scripts/print-active-rules.mjs` from the skill directory. If it prints a chunk manifest, record the SHA-256 and run every listed digest-bound `--chunk` command in order. Require the same digest in every chunk and the active-rules EOF marker in the last chunk. Pass that digest to `check-final.mjs --rules-sha256`.

Without Node.js:

1. Read `SKILL.md` through `<!-- ANTI_AI_WRITING_SKILL_EOF -->`.
2. Read a compact custom file through `<!-- ANTI_AI_WRITING_CUSTOM_EOF -->`. For a legacy file, obtain the physical line count and read consecutive ranges through physical EOF.
3. Use customized Sections 1 through 7 instead of the defaults and apply customized Section 8 in addition.
4. Keep the `SKILL.md` controller active.

## Normal load behavior

Use this only when the user invokes the skill without a writing task.

- With a nonempty custom file, say exactly: `已加载。本次会使用 SKILL.md 控制器和你的定制规则。请发送文章、主题或写作需求。`
- Without one, say exactly: `已加载。没有找到定制文件，所以会使用 SKILL.md 控制器和默认规则。请发送文章、主题或写作需求。`
- Do not ask whether the user wants customization.
- Do not mention customization unless the user asks about it.

## Create a compact customized file

Create one only when the user asks to customize or explicitly asks to save a personal rule and no custom file exists.

1. With Node.js, run `node scripts/print-active-rules.mjs --custom-template` and use the complete output as the new file.
2. Without Node.js, start with `<!-- ANTI_AI_WRITING_CUSTOM_RULES_V1 -->`, copy Sections 1 through 7 and Section 8 from `SKILL.md`, and skip frontmatter, the controller, delivery gate, operating priorities, `参考与维护`, and skill EOF.
3. End with `<!-- ANTI_AI_WRITING_CUSTOM_EOF -->`.
4. Verify all eight numbered headings and the custom EOF marker before saving.

## Add a rule or preference

Use this when the user asks to add, remember, save, or update a writing rule, or clearly wants a concrete complaint remembered.

If the user only asks whether wording has AI smell, answer first, then ask: `要我把这个加成一条规则吗？`

### Choose the target

- `默认`、`公共版本`、`核心规则`、`SKILL.md`、`给所有人` means the default skill.
- `我的规则`、`个人版本`、`定制版`、`skill-customized.md` means the custom file.
- If unclear, ask: `要加到你的个人定制文件，还是默认 SKILL.md？`
- If the personal target is missing, create the compact customized file first.

### Search and place

Before editing, search the target and supporting files for:

1. The exact phrase or example.
2. Close variants.
3. The root failure.
4. The nearest existing section.

Revise an existing rule when it already covers the issue. Do not add a duplicate.

Place a new rule in the smallest fitting section:

- Hard bans for first-pass fail states
- Positive defaults for what good Chinese writing should do
- Word and phrase cleanup for vocabulary, filler, fake depth, and empty polish
- Claims and evidence for authority, specificity, certainty, scope, and sourcing
- Structure and formatting for visible organization
- Rhythm and repetition for cadence, formulas, and repeated shapes
- Final-check preferences for audit items
- Additional user preferences for personal examples, dislikes, or style notes

Keep the operative rule short. Name the pattern, explain the failure, say what to do instead, and add an example only when needed.

For a default change, update every applicable layer:

- `SKILL.md` for the compact rule
- `references/patterns-and-examples.md` for rationale or examples
- `scripts/scan-writing.mjs` only when a safe exact or candidate check is possible
- tests for changed script behavior

After editing, report what changed and where.

## Reset customization

Use this when the user says `reset`, `重置`, `恢复默认`, `删掉定制版`, or clearly requests removal.

- Delete only `skill-customized.md` without another question when the request is clear.
- Do not change `SKILL.md`, references, scripts, operations, or any other file.
- If deleted, say exactly: `重置完成。我删除了 skill-customized.md。除非你再次定制，否则会使用 SKILL.md 控制器和默认规则。`
- If no file exists, say exactly: `没有找到定制文件。现在已经在使用 SKILL.md 控制器和默认规则。`
- If `重新开始` is ambiguous, confirm before deleting.

## Guided customization workflow

1. Check for a nonempty custom file.
2. If none exists, create the compact custom file. If one exists, edit that same file and do not convert it.
3. Send the fixed opening and wait for confirmation. Treat `yes`, `start`, `go`, `好`, `开始`, `可以`, `继续`, and similar positive replies as confirmation.
4. Work through Sections 1 through 7 in the active custom file, then Section 8.
5. Show the full current content of each editable section between divider lines before asking for changes. Do not summarize it.
6. Accept fragments, examples, dislikes, rough notes, or `no`. Treat `不用`, `没有`, `没了`, `这段可以`, `保持`, and similar replies as no change.
7. If there is no change, move directly to the next section without announcing that it is unchanged.
8. Apply requested changes immediately to the matching section, briefly confirm, then continue.
9. Read `references/patterns-and-examples.md` when the user needs rationale, examples, or an edge case.
10. After Section 7, send the fixed final preference prompt and put the reply in Section 8.
11. Verify the full custom file and EOF marker, then send the fixed closing.

Use the fixed messages exactly.

## Fixed customization opening

```text
我会带你逐节定制这个中文去 AI 味写作规则。

通常需要 15 到 25 分钟。一共有 8 个定制步骤：

1. 硬性禁区
2. 正向写作默认值
3. 词和短语清理
4. 判断、证据和读者
5. 结构、格式和标点
6. 节奏和重复
7. 最终检查偏好
8. 其他你想补充的偏好

每一步都会先展示完整的当前规则，再问你要不要修改。

现在开始吗？
```

## Fixed section prompt

```text
第 [number] 节：[section title]

当前规则：

---

[paste the full content of this section]

---

这里有什么要添加、删除或修改的吗？
```

## Fixed final preference prompt

```text
最后一步：其他你想补充的偏好。

你有没有想让这个规则记住的偏好、风格描述、例子、参考或特别讨厌的表达？
```

## Fixed closing

```text
完成。我已经按你的选择更新了 skill-customized.md。

以后会使用 SKILL.md 控制器和你的定制写作规则。
```

## Maintenance checks

Before finishing a kit change:

1. Confirm EOF markers in `SKILL.md`, operations, and the reference.
2. Confirm `SKILL.md` fits within 240 lines.
3. Run `node --check` on all three scripts.
4. Run `node --test tests/*.test.mjs`.
5. Test no custom, whitespace-only custom, valid and malformed compact custom, legacy custom, and long-file chunking.
6. Confirm `--custom-template` contains all eight numbered sections and no controller text.
7. Test Chinese punctuation, stock openings and closings, false contrast, majority hooks, vocabulary, short-sentence rhythm, code masking, length bounds, and the final receipt.
8. Keep README, operations, AGENTS, and actual behavior aligned. Do not overstate a local PASS receipt.

<!-- ANTI_AI_WRITING_OPERATIONS_EOF -->
