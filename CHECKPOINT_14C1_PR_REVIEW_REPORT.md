# Checkpoint 14C.1 — PR #1 review response verification

Date: 2026-10-09. Branch: `feature/checkpoint-14c1-shopping-cart`.
Review investigated: AberAbou's 2026-10-08 23:32:50 UTC review of PR #1
([review link](https://github.com/AberAbou/ai-shopping-assistant-evaluator/pull/1#pullrequestreview-5464083750)).
Baseline commit: `a97c6fffc145f1670b02b22de7028254ad642693`.

## Findings and fixes

1. **Cart classification:** Confirmed unrelated possessions, separate clauses,
   negated requests, and conditional substitutions could trigger a cart because
   categories and conjunctions were scanned across the entire prompt. Conjunction
   inference now requires categories within a request clause, excludes tested
   background clauses, and treats conditional substitutions as choices. Explicit
   item lists and single-category multiple-unit carts remain supported.
2. **Price/budget scope:** Confirmed `at $20 each` and `for $40 each` became
   unintended upper bounds. Bare `at`/`for` price descriptions are no longer budget
   operators. Confirmed a single category-specific cap could become a cart cap;
   category-local budgets now retain product scope regardless of the number of
   monetary matches. Clause-bounded context prevents adjacent item/cart budgets
   from affecting each other's scope or `each` qualifier. Foreign budget currencies
   remain unsupported/UNKNOWN rather than being treated as USD.
3. **Product evidence isolation:** Reversed ordering and a conjunction example
   already passed the initial tests, but absent API names borrowed another item's
   quantity, and repeated references contaminated categories/prices. Evidence is
   now bounded using sorted textual occurrences, independent of model product
   order. Duplicate API names use distinguishing local price/quantity evidence;
   indistinguishable duplicates remain UNKNOWN. Conflicting repeated prices cannot
   prove cart compliance. A category identified in the product name takes precedence
   over an unrelated category mentioned later in its fallback section. Missing or
   blank API names cannot borrow evidence; blank names are excluded from scanning.
4. **Stated totals:** Confirmed bare, foreign, approximate, and ranged totals
   disappeared or were accepted as USD, allowing false PASS outcomes. Unparseable
   declarations are retained as unresolved claims. The cart engine validates amount
   and USD currency, exposes `ambiguousStatedTotal`, and withholds the effective
   total when any stated total is unresolved. Reports and UI identify ambiguous
   evidence rather than saying no total was stated. Explicit USD totals, common
   total phrases, no stated total, and line-total ambiguity are regression protected.
5. **Quantity/report truthfulness:** The combined verdict already failed incorrect
   quantities, but `cart_items` separately returned PASS with misleading wording.
   Membership verification now also compares explicitly requested category counts
   against summed item quantities. Count mismatches return FAIL in that record;
   missing/invalid evidence remains UNKNOWN. When counts were not requested, the
   reason explicitly limits the check to category and quantity presence.

The initial 27 adversarial tests reproduced 18 failures. Coverage was expanded to
30 focused tests during investigation. Intermediate failures (including a line-total
regression during parser changes) were corrected before the final successful runs.
Blocked diagnostic test processes were stopped; temporary tracing was removed.

## Final verification

Commands executed from the repository using the existing installed dependencies:

| Command / suite | Passed | Failed |
| --- | ---: | ---: |
| `npm run lint` (`tsc --noEmit`) | PASS | 0 errors |
| `npm run test:all` | 11 commands | 0 commands |
| Canonical regressions | 6 scenarios / 101 assertions | 0 |
| Checkpoint 9 diagnostic | 6 scenarios executed; exit 0 | 0 execution errors |
| Checkpoint 10 | 6 scenarios | 0 |
| Checkpoint 14 hardening | 23 checks | 0 |
| Checkpoint 14B professional reports | 57 checks | 0 |
| Checkpoint 14B.1 dual reports | 102 checks | 0 |
| Checkpoint 14B.2A price boundaries | 14 checks | 0 |
| Checkpoint 14B.2B behavioral prices | 20 checks | 0 |
| Checkpoint 14B.3 exclusions/suitability | 31 checks | 0 |
| Existing Checkpoint 14C.1 cart regressions | 52 cases | 0 |
| New PR review regressions | 30 cases | 0 |
| `npm run test:e2e` — Chromium | 20 tests | 0 |
| `npm run build` | PASS (1690 modules) | 0 errors |

Focused diagnostic commands also used:

```text
node node_modules/tsx/dist/cli.mjs --test scripts/test_checkpoint14c1_review.ts
node node_modules/tsx/dist/cli.mjs --test --test-reporter=dot scripts/test_checkpoint14c1_review.ts scripts/test_checkpoint14c1_shopping_cart.ts
node node_modules/tsx/dist/cli.mjs --test --test-name-pattern='conflicting repeated' scripts/test_checkpoint14c1_review.ts
node node_modules/tsx/dist/cli.mjs --test --test-reporter=spec scripts/test_checkpoint14c1_shopping_cart.ts
node node_modules/tsx/dist/cli.mjs --test --test-name-pattern='ambiguous line totals' --test-reporter=spec scripts/test_checkpoint14c1_shopping_cart.ts
```

Five new UI scenarios cover bare/foreign/ranged totals, unit-price request wording,
and adjacent scoped budgets. Existing UI quantity-mismatch coverage now verifies
the exported `cart_items` record is FAIL. API calls are mocked; the managed local
server has `DISABLE_MODEL_API=1`. No paid model calls were made. Playwright starts
and stops its local server automatically. Logs and browser artifacts remain ignored.

Production build output: JS 586.39 kB / 144.03 kB gzip. Existing warnings remain:
bundle over 500 kB, and `__dirname` in the Vite configuration under a future native
config loader. No dependency or lockfile changes were required.

## Changed files

- `src/services/evaluation/shoppingCartSemantics.ts`
- `src/services/evaluation/shoppingCartEngine.ts`
- `src/services/evaluation/reportExportHelper.ts`
- `src/types/evaluation.ts`
- `src/components/FinalEvaluationView.tsx`
- `scripts/test_checkpoint14c1_review.ts` (new)
- `scripts/run_all_tests.ts`
- `tests/e2e/shopping-cart.spec.ts`
- `CHECKPOINT_14C1_PR_REVIEW_REPORT.md` (new)

## Limits and review status

The supported deterministic grammar remains rule-based English with recognized
product categories and USD unit prices. General natural-language interpretation,
exchange-rate conversion, catalog verification, and live Gemini integration are
not established by these tests. Indistinguishable repeated product references are
conservatively UNKNOWN. Browser verification covers Chromium only.

Ready for continued independent review. PR #1 remains draft; no merge, branch
change, force push, main modification, dependency upgrade, or recovery-source
modification is part of this response. Only the listed source, tests, and report
are intended for the follow-up commit.
