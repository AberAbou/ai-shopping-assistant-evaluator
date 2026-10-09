# Checkpoint 14C.2 — Cart conflict reporting refinement

Issue: https://github.com/AberAbou/ai-shopping-assistant-evaluator/issues/2
Implementation contract: https://github.com/AberAbou/ai-shopping-assistant-evaluator/issues/2#issuecomment-6074086586
Branch: `feature/checkpoint-14c2-reporting-refinement`.
Baseline: accepted main `abcbf6a32a13318da9f3d39266eeb3e1757355e3`.

## Reproduction and change

Exact Test 6 reproduced two independent causes in `shoppingCartEngine.ts`:

1. Every cart verification record received `conflictDetected: totalDisagreement`.
   The Constraint Matrix prioritizes this flag over its status, displaying CONFLICT
   even when a quantity record's underlying status was PASS.
2. Membership/count verification required consistent and unambiguous monetary totals,
   making `cart_items` UNKNOWN despite independently verified categories and counts.

Membership/count checks now depend only on their requested categories and quantity
evidence. Total disagreement flags apply only to monetary rows. Quantity evidence is
restricted to its target category; membership evidence includes category/count data.
Neither includes unrelated prices or stated totals. Budget evidence retains item
arithmetic and every stated total, including multiple conflicting declarations.
Constraint and verification IDs remain linked across the matrix, reports, and JSON.
No UI rendering, parser, verdict-engine, or dependency changes were necessary.

Test 6 now shows membership and both quantity rows PASS, both running-suitability
rows PASS, and the budget row CONFLICT (underlying UNKNOWN). Computed total remains
$80 versus stated $60; effective total is null. The hard budget keeps the cart gate
and overall verdict INDETERMINATE. Quantity PASS cannot establish monetary compliance.

Existing genuinely contradictory repeated quantities remain UNKNOWN: reconciliation
withholds ambiguous quantity evidence rather than choosing a count. Missing counts
remain UNKNOWN; explicit mismatched counts remain FAIL. A failed hard quantity
still dominates an unresolved monetary constraint. Optional monetary uncertainty does
not downgrade independently verified mandatory items. Alternative requests remain
product-level; unquantified alternative responses cannot satisfy mandatory cart counts.

## Files

- `src/services/evaluation/shoppingCartEngine.ts`
- `scripts/run_all_tests.ts`
- `scripts/test_checkpoint14c2_reporting.ts` (new)
- `tests/e2e/reporting-refinement.spec.ts` (new)
- This report (new)

## Final verification

```text
node node_modules/tsx/dist/cli.mjs --test scripts/test_checkpoint14c2_reporting.ts
npm run lint
npm run test:all
npm run build
npm run test:e2e
git -c safe.directory=C:/Users/AberA/Tutorials/ai-shopping-assistant-evaluator diff --check
```

| Check | Result |
| --- | --- |
| TypeScript | PASS, zero errors |
| Complete regression runner | 15/15 commands passed, 0 failed |
| Canonical | 6/6 scenarios, 101/101 assertions |
| Checkpoint 9 diagnostic | Six scenarios, exit 0; no assertion count reported |
| Checkpoint 10 | 6/6 scenarios |
| Hardening | 23/23 |
| Professional / dual reports | 57/57 and 102/102 |
| 14B.3 exclusions/suitability | 31/31 |
| Price boundaries / price behavior | 14/14 and 20/20 |
| Original cart / first review / third review | 52/52, 30/30, 32/32 |
| Collective suitability / soft budgets | 57/57 and 50/50 |
| New 14C.2 deterministic cases | 20/20 |
| Playwright Chromium | 83 passed, 0 failed |
| Production build | PASS, 1690 modules |
| Whitespace checks | PASS |

The 20 deterministic cases cover exact Test 6 through API-normalized and fallback
paths, matching/ambiguous/multiple totals, mismatched/conflicting/missing quantities,
missing prices with valid quantities, soft monetary conflicts, alternative requests
and outputs, running suitability, ID traceability, JSON and professional report text.

Fourteen new browser cases exercise seven scenarios through mock API and offline
fallback. They assert actual Constraint Matrix cell labels, independent evidence,
constraint ID linkage, exported verdicts/totals/gates, and detailed report wording.
All 69 existing browser cases pass unchanged.

During focused testing, two alternative fixtures were adjusted to avoid requesting
an explicit cart through `All items` wording, and a wrong-quantity fixture's stated
total was changed to $10 so it actually contradicted its $60 arithmetic. Assertions
continued to require unresolved or failed mandatory evidence as appropriate.

Existing Vite warnings remain for future native config-loader compatibility with
`__dirname` and a JavaScript bundle over 500 kB (590.86 kB, 145.31 kB gzip).

## Safety and remaining limits

Tests use deterministic analysis, mock API responses, or offline fallback. Playwright
automatically starts/stops its server with `DISABLE_MODEL_API=1`. No paid models,
live catalog verification, dependency changes, generated artifacts, or credentials
are included. Main and the immutable `checkpoint-14c1-accepted` tag remain at the
accepted merge; the Gemini review repository is untouched. Only the 14C.2 branch
is committed/pushed, with a draft PR for independent review.

This change refines evidence/verdict scope; it does not broaden the supported English
extraction grammar or change how actual quantity ambiguity is represented. Browser
coverage is Chromium. Independent review and manual acceptance remain pending.
