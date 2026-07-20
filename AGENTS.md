# AGENTS.md

Guidance for agents maintaining this skill folder.

## Repository contract

This is a portable Simplified Chinese writing skill for drafting, editing, rewriting, polishing, and reviewing prose without common Chinese AI-writing tells.

`SKILL.md` is the permanent runtime controller and the single source of truth for default rules, explanations, phrase lists, and examples. Keep its load and delivery gates near the top and its EOF marker at the end.

There is no package installation or build step. Scripts use Node.js standard-library modules only.

## Key files

- `SKILL.md`: metadata, permanent controller, complete default rules, explanations, phrase lists, and examples.
- `scripts/print-active-rules.mjs`: deterministic full-skill loading, chunking, checksum validation, and preference resolution.
- `scripts/check-final.mjs`: active-rule verification, candidate transport checks, word bounds, and final receipt.
- `scripts/scan-writing.mjs`: deterministic Chinese mechanical and candidate checks. It cannot judge meaning or truth.
- `tests/*.test.mjs`: loader, scanner, and final-gate regression tests.
- `operations/kit-operations.md`: loading, customization, reset, additions, maintenance, and fixed replies.
- `README.md`: public manual.
- `agents/openai.yaml`: optional interface metadata.
- `skill-customized.md`: local preferences. Never commit, overwrite, or silently migrate it.

## Ownership

Change the smallest applicable layer, then synchronize affected layers:

- Every public writing rule, explanation, phrase list, and example belongs in `SKILL.md`.
- Add a scanner rule only when an exact or clearly labeled candidate check is safe.
- Add a regression test for every scanner or loader behavior change.
- Customization, reset, and fixed replies belong in operations.
- Public behavior belongs in README.

The controller remains active when a custom file exists. A compact custom file replaces Sections 1 through 7 and supplements them with Section 8. Legacy custom files remain supported as preference layers.

## Rule editing

Before adding a rule, search `SKILL.md`, the scanner, and tests for the exact phrase, close variants, and root problem. Prefer revising one rule to adding a near-duplicate.

Keep rules short and actionable. State what to do instead. Check that cleanup does not make Chinese prose stiff, over-oral, vague, or artificially rough.

Send every normal add-rule, remember-rule, or save-rule request to `skill-customized.md`. Do not offer users a choice between the customized file and `SKILL.md`. Treat a deliberate change to the repository's shipped defaults as maintainer work with its own validation and release.

## Verification

Before finishing a change:

1. Confirm EOF markers in SKILL, operations, and compact custom fixtures.
2. Confirm `SKILL.md` remains the complete source for public rules, explanations, phrase lists, and examples.
3. Run `node --check scripts/*.mjs`.
4. Run `node --test tests/*.test.mjs`.
5. Test default, whitespace-only, compact, malformed, legacy, and chunked custom files.
6. Verify the custom template contains all eight numbered sections and no controller text.
7. Test Chinese punctuation, stock openings and closings, false contrast, majority hooks, vocabulary, rhythm, code masking, Chinese length bounds, and the final receipt.
8. Keep README and operations aligned with actual behavior.
9. Never claim a local PASS receipt proves equality with a later assistant message.

## Publishing

Remove generated local files and keep `LICENSE` in the repository root. Do not publish unless the user asks.
