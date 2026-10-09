# PR #9 — Jacket replacement verification

Verified on 2026-10-09 on `feature/human-style-assessment-report`.

## Defect and correction

In a replacement request, the old waterproof jacket description was extracted as a positive requirement alongside the new non-waterproof prohibition. Conversation supersession keyed constraints by polarity, so an earlier unscoped positive waterproof requirement could survive the negative replacement and fail the later response. Same-category replacement also discarded unrelated category-scoped requirements.

The shopper feature reconciliation shared by deterministic and API-normalized prompt analysis now excludes the old target description from requested features. `non-waterproof` remains a negative waterproof prohibition, with evidence from the new item. Conversation extraction analyzes the new description and the remaining request clauses. Explicit replacement requirements supersede the same property across polarity while preserving unrelated requirements. Same-category replacement retains other jacket requirements. A revised product property does not withdraw a collective requirement from other products; their original requirement and provenance remain.

## Regression coverage

Seven deterministic tests were added to `scripts/test_issue11_conversation.ts`, giving 22 tests in that suite. Coverage includes:

- Three-turn waterproof-to-breathable/non-waterproof replacement followed by confirmation, for both a single jacket and a cart with retained shorts.
- Retained budget, quantities, running suitability, jacket weight, and source-turn provenance.
- Negative-only waterproof extraction through fallback and deliberately incorrect API-shaped prompt normalization.
- Collective waterproofing retained on the other product and independently failing when that product becomes non-waterproof.
- Reverse replacement back to waterproof, removing the stale negative constraint.
- Final waterproof evidence failing; absent or conflicting waterproof evidence remaining INDETERMINATE. Other verifications stay PASS.

Four Chromium tests were added to `tests/e2e/issue11-conversation.spec.ts`. They verify all three displayed turn verdicts, exported active constraints/provenance, prices, copied plain-English assessment and the adverse final-snapshot outcomes.

`tests/fixtures/jacketReplacementConversation.ts` reproduces the reported three-turn semantics with an additional retained product. The literal manual transcript was not present in the PR discussion or supplied in this request; this fixture is a targeted reproduction, not a claimed verbatim transcript. A separate single-product test covers the unscoped requirement defect directly.

## Final verification

All tests used `$env:DISABLE_MODEL_API='1'`; API browser cases use mocks. No paid model calls occurred.

| Command | Result |
| --- | --- |
| `npx tsx --test scripts/test_issue11_conversation.ts` | 22 passed, 0 failed |
| `npx playwright test tests/e2e/issue11-conversation.spec.ts` | 8 passed, 0 failed |
| `npm run test:all` | 19/19 regression commands passed, 0 failed |
| `npm run test:e2e` | 159 Chromium tests passed, 0 failed, 6.2 minutes |
| `npm run lint` | Passed (`tsc --noEmit`) |
| `npm run build` | Passed, 1696 modules transformed |
| `git -c safe.directory=C:/Users/AberA/Tutorials/ai-shopping-assistant-evaluator diff --check` | Passed |

The complete run includes all 55 existing conversation tests, 19 negated-property tests, 27 assessment tests and the original four-turn acceptance scenario. Build warnings remain limited to the existing Vite native-loader `__dirname` warning and large-bundle warning. The final JavaScript bundle is 634.02 kB (158.34 kB gzip).

Application changes are confined to `conversationEvaluation.ts` and `featurePolarity.ts`; there are no dependency changes. Generated artifacts remain ignored. Main, accepted tags and the separate Gemini review repository remain unchanged. No merge or deployment occurred. The offline demo server is restored on port 3101 with `DISABLE_MODEL_API=1` after verification.
