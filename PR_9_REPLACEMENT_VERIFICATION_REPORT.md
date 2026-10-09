# PR #9 — Jacket replacement verification

Verified on 2026-10-09 on `feature/human-style-assessment-report`.

The first sections record the initial correction at `e5cfc36`. The exact-review follow-up and final verification are recorded below.

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

## Initial verification

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

## Exact review transcript follow-up

The latest [PR #9 review](https://github.com/AberAbou/ai-shopping-assistant-evaluator/pull/9#pullrequestreview-5473237472) supplies the literal jacket-and-shoes transcript. All six request/response strings are retained verbatim in `tests/fixtures/pr9ExactReplacementConversation.ts`, shared by deterministic and Chromium tests.

| Turn | Jacket requirement | Jacket / shoes prices | Per-product limit | Outcome |
| --- | --- | --- | --- | --- |
| T1 | Waterproof running jacket | $80 / $70 | Each strictly under $100, from T1 | PASS |
| T2 | Breathable, non-waterproof running jacket | $80 / $70, unchanged waterproof recommendation | Same limit for both products | FAIL: waterproof exclusion; breathability UNKNOWN |
| T3 | Same revised jacket requirements | $85 / $70, breathable and explicitly not waterproof | Same limit for both products | PASS |

The combined purchases cost $150, $150 and $155. These totals do not violate the per-product budget. Each product has its own PASS price verification under the retained T1 constraint. Boundary guards independently reject either jacket or shoes at exactly $100. The jacket quantity is 1 from T2; the shoe quantity remains 1 from T1. Waterproofing is positive only in T1, then a jacket-scoped negative prohibition from T2. Breathability is jacket-scoped from T2. T3 has exactly the same active constraints as T2, with no invented requirement or unresolved update. Historical T2 failure and all supplied evidence remain in the copied narrative.

The exact fixture exposed two additional defects despite initially correct aggregate verdicts: comma-separated descriptive words dropped the requested jacket quantity, and a retention reference created a new running constraint in T3. Quantity extraction now supports that bounded descriptive prefix without crossing item conjunctions. Category retention clauses preserve existing requirements rather than creating activity constraints.

An additional adversarial test exposed jacket feature evidence leaking to shoes when a later sentence used a shortened product reference. Feature reconciliation now uses the explicitly named category in that sentence, with textual product boundaries as fallback. Adding a waterproof shoe requirement therefore produces UNKNOWN for shoes rather than falsely using the jacket's negative evidence. This correction is shared by API-normalized and fallback claim analysis. An initial full regression run found this defect; its browser run was stopped for correction, then the complete verification was rerun successfully.

This follow-up modifies `conversationEvaluation.ts`, `shoppingCartSemantics.ts`, both Issue #11 test files, the exact fixture and this report. It adds three deterministic tests and two Chromium tests, retaining the earlier representative scenarios.

## Final verification after exact-review corrections

Every command used `$env:DISABLE_MODEL_API='1'`; browser API responses are mocked and conversation evaluation is offline.

| Command | Result |
| --- | --- |
| `npx tsx --test scripts/test_issue11_conversation.ts scripts/test_issue6_negated_properties.ts scripts/test_checkpoint14c3_conversation.ts` | 99 passed, 0 failed: 25 acceptance/replacement, 19 negated-property, 55 conversation |
| `npm run test:all` | 19/19 regression commands passed, 0 failed |
| `npm run test:e2e` | 161 Chromium tests passed, 0 failed, 6.7 minutes; all 10 tests in the Issue #11 browser file passed |
| `npm run lint` | Passed (`tsc --noEmit`) |
| `npm run build` | Passed, 1696 modules transformed |
| `git -c safe.directory=C:/Users/AberA/Tutorials/ai-shopping-assistant-evaluator diff --check` | Passed |

Existing Vite native-loader and bundle-size warnings remain nonblocking. Final JavaScript is 634.59 kB (158.54 kB gzip). No dependencies, main, accepted tags or separate review repository were changed. No paid models, merge or deployment were used. Generated files remain ignored. The offline server is restored on port 3101 after verification.
