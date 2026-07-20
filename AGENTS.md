# AGENTS.md

Guidance for agents maintaining this skill folder.

## Repository contract

This is a portable Simplified Chinese writing skill for drafting, editing, rewriting, polishing, and reviewing prose without common Chinese AI-writing tells.

`SKILL.md` is the permanent runtime controller and compact default rule set. Keep its load and delivery gates near the top, keep every operative fail condition self-contained, and keep the EOF marker within a 240-line read.

There is no package installation or build step. Scripts use Node.js standard-library modules only.

## Key files

- `SKILL.md`: metadata, permanent controller, and compact operative rules.
- `references/patterns-and-examples.md`: expanded Chinese phrase families, rationale, examples, and edge cases. Never leave an operative failure condition only here.
- `scripts/print-active-rules.mjs`: controller validation, checksum receipt, chunking, and preference resolution.
- `scripts/check-final.mjs`: active-rule verification, candidate transport checks, word bounds, and final receipt.
- `scripts/scan-writing.mjs`: deterministic Chinese mechanical and candidate checks. It cannot judge meaning or truth.
- `tests/*.test.mjs`: loader, scanner, and final-gate regression tests.
- `operations/kit-operations.md`: loading, customization, reset, additions, maintenance, and fixed replies.
- `README.md`: public manual.
- `agents/openai.yaml`: optional interface metadata.
- `skill-customized.md`: local preferences. Never commit, overwrite, or silently migrate it.

## Ownership

Change the smallest applicable layer, then synchronize affected layers:

- Compact runtime behavior belongs in `SKILL.md`.
- Rationale, long pattern families, and examples belong in the reference.
- Add a scanner rule only when an exact or clearly labeled candidate check is safe.
- Add a regression test for every scanner or loader behavior change.
- Customization, reset, and fixed replies belong in operations.
- Public behavior belongs in README.

The controller remains active when a custom file exists. A compact custom file replaces Sections 1 through 7 and supplements them with Section 8. Legacy custom files remain supported as preference layers.

## Rule editing

Before adding a rule, search the default rules, reference, scanner, and tests for the exact phrase, close variants, and root problem. Prefer revising one rule to adding a near-duplicate.

Keep rules short and actionable. State what to do instead. Check that cleanup does not make Chinese prose stiff, over-oral, vague, or artificially rough.

Keep personal preferences in `skill-customized.md` unless the user explicitly requests a public default change.

## Verification

Before finishing a change:

1. Confirm EOF markers in SKILL, operations, reference, and compact custom fixtures.
2. Confirm `SKILL.md` stays within 240 lines.
3. Run `node --check scripts/*.mjs`.
4. Run `node --test tests/*.test.mjs`.
5. Test default, whitespace-only, compact, malformed, legacy, and chunked custom files.
6. Verify the custom template contains all eight numbered sections and no controller text.
7. Test Chinese punctuation, stock openings and closings, false contrast, majority hooks, vocabulary, rhythm, code masking, Chinese length bounds, and the final receipt.
8. Keep README and operations aligned with actual behavior.
9. Never claim a local PASS receipt proves equality with a later assistant message.

## Publishing

Remove generated local files and keep `LICENSE` in the repository root. Do not publish unless the user asks.
