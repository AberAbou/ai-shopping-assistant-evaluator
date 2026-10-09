# Issue #11 — Conversation revision and cart snapshot verification

Verified on 2026-10-09 on `feature/human-style-assessment-report` for draft PR #9.

## Reproduction and correction

The exact four-turn acceptance transcript is retained in `tests/fixtures/issue11Conversation.ts`. Postfix quantity revisions were not reliably recognized, unchanged-budget references could create a spurious monetary requirement, and final-cart introductions could obstruct item extraction. These combined to misclassify valid later snapshots and lose the intended requirement history.

Quantity revisions now update the named active product while retaining other products, suitability and budget. Invalid, conflicting, ranged, ambiguous or nonactive targets remain unconfirmed. Budget revisions replace the active budget without changing quantities. Confirmation-only and keep-same requests preserve the active requirements. Each response remains a complete independent cart snapshot; earlier prices or claims are never borrowed.

Shared cart-introduction parsing recognizes contains, includes, has and consists of, including final/current shopping-cart wording. Both final products, quantities, unit prices and calculated line totals are extracted. Monetary disagreement remains isolated from quantity and suitability findings.

Requirement origins survive later retention and confirmation turns. Cart membership originates in the last actual cart change, rather than the last user message. Revision audit entries and report prose avoid repeated source excerpts without discarding actions, findings, evidence or historical outcomes.

| Turn | Active shirts / shorts | Budget | Calculated / stated total | Result |
| --- | --- | --- | --- | --- |
| 1 | 2 / 1 | strictly under $100 | $80 / $80 | PASS |
| 2 | 3 / 1 | strictly under $100 | $100 / $100 | FAIL: budget boundary only |
| 3 | 3 / 1 | strictly under $120 | $100 / $100 | PASS |
| 4 | 3 / 1 | strictly under $120 | $100 / $90 | INDETERMINATE: monetary disagreement only |

The shirts retain their turn-2 revision origin, shorts and collective running suitability retain turn 1, and the final budget retains turn 3. Turn 4 introduces no new requirement. Earlier failures remain in conversation reports.

## Changed files

- `src/services/evaluation/conversationEvaluation.ts`: requirement revision, retention and provenance handling.
- `src/services/evaluation/shoppingCartSemantics.ts`: shared cart snapshot introduction recognition.
- `src/services/evaluation/fallbackClaimAnalyzer.ts`: cart item extraction with preserved response evidence.
- `src/services/evaluation/qaAssessmentReport.ts`: deduplicated revision audit sources.
- `src/services/evaluation/plainEnglishAssessment.ts`: chronological, deduplicated revision and requirement-origin prose.
- `scripts/test_issue11_conversation.ts`: 15 deterministic regression tests.
- `tests/fixtures/issue11Conversation.ts`: exact four-turn acceptance transcript.
- `tests/e2e/issue11-conversation.spec.ts`: four Chromium acceptance tests.
- `scripts/run_all_tests.ts`: includes the new deterministic suite.
- `ISSUE_11_VERIFICATION_REPORT.md`: this verification record.

## Final verification

Commands ran with `$env:DISABLE_MODEL_API='1'`. Browser API cases use mocks; conversation cases use deterministic offline analysis. No paid model requests were made.

| Exact command | Result |
| --- | --- |
| `npx tsx --test scripts/test_issue11_conversation.ts` | 15 passed, 0 failed |
| `npx tsx --test scripts/test_issue11_conversation.ts scripts/test_checkpoint14c3_conversation.ts scripts/test_issue8_assessment_report.ts` | 97 passed, 0 failed (15 issue-11, 55 conversation, 27 assessment) |
| `npm run test:all` | 19/19 regression commands passed, 0 failed |
| `npm run test:e2e` | 155 Chromium tests passed, 0 failed, 5.7 minutes |
| `npm run lint` | Passed: `tsc --noEmit` |
| `npm run build` | Passed: 1696 modules transformed |
| `git -c safe.directory=C:/Users/AberA/Tutorials/ai-shopping-assistant-evaluator diff --check` | Passed |

New coverage includes all four exact turns, wording variants, number-word quantities, strict/inclusive budget boundaries, conflicting and invalid revisions, missing final prices, API-shaped claim quantity reconciliation, report history, evidence isolation, provenance, clipboard contents and exports. Existing cart, single-product, exclusions, suitability, soft-budget, conversation and assessment suites also pass.

Build emits the existing Vite configuration-loader `__dirname` warning and bundle-size warning; neither fails the build. Final JavaScript bundle is 633.24 kB (158.14 kB gzip).

## Limits and release safety

Ambiguous revisions and incomplete cart evidence remain INDETERMINATE rather than guessed. The evaluator checks supplied recommendation evidence, not an independent product catalog or physical product suitability. Manual acceptance and independent PR review remain pending.

No dependency changes, source recovery copies, merge, deployment, main changes, accepted-tag changes or separate Gemini review repository changes were performed. Generated build and test artifacts remain ignored. The offline demo is restored on port 3101 after verification with `DISABLE_MODEL_API=1`.
