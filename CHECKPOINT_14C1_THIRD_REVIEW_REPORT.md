# Checkpoint 14C.1 — Third source-review verification

Date: 2026-10-09. Branch: `feature/checkpoint-14c1-shopping-cart`.
Baseline: `c0ac0a1b16d274abf6bcbc93a7e09ab514a58d2b`.
Review: [PR #1 third-pass audit](https://github.com/AberAbou/ai-shopping-assistant-evaluator/pull/1#pullrequestreview-5464414024).

## Findings and changes

1. **Global alternatives veto — confirmed defect.** Color choices such as
   `either red or blue` discarded the combined cart gate and requested quantities.
   Choice markers now require item evidence in their relevant arms/clauses. A color
   choice before the next item also retains the cart. True item alternatives and
   conditional substitutions remain alternatives. The supplied `if possible` example
   already retained the cart; a regression now protects it explicitly.
2. **Qualified total punctuation — no defect under the conservative policy.**
   `$80, including all items`, `$80 (before tax)`, and unsupported terminal punctuation
   already produced an unresolved total and UNKNOWN compliance. This behavior is
   intentionally retained rather than stripping qualifiers or assuming tax scope.
   Four adversarial cases check INDETERMINATE, zero confirmed failures, a null
   effective total, and explicit ambiguity wording in all report formats. Existing
   exact-USD total and ordinary punctuation coverage remains unchanged.
3. **Product-only currency checks — confirmed false-PASS defect.** The price branch
   compared foreign or missing currency amounts against USD bounds. It now requires
   USD and respects reconciliation's rejected/ambiguous unit-price evidence. EUR,
   GBP, CAD, missing currency, a falsely USD-labeled API price with EUR source text,
   and `$90 EUR` fallback wording remain UNKNOWN. USD single-product strict-boundary
   behavior is preserved. No exchange-rate conversion is inferred.
4. **Canonical money extraction — confirmed defects.** Currency-free `max 85` and
   `under 100` were silently interpreted as USD. Such monetary limits now retain
   an unresolved requirement with UNKNOWN currency and compliance. Explicit physical
   limits such as `max 85 dB` are excluded from price extraction. Budgets before
   multi-category item groups retain cart scope; adjacent per-item caps retain their
   product target. Unsupported currency symbols/codes are retained as UNKNOWN.
   An unresolved cart-budget clause can no longer vanish merely because an earlier
   item cap was parsed, including across sentence boundaries.

The initial 27 tests produced **10 passes and 17 failures**. After investigation,
coverage expanded to **32 adversarial cases**, all passing. Existing expected
behavior was retained for qualified totals and the optional-feature example; no
tests were weakened.

## Complete final verification

Commands executed from the source repository with installed dependencies:

```text
node node_modules/tsx/dist/cli.mjs --test --test-reporter=spec scripts/test_checkpoint14c1_third_review.ts
node node_modules/tsx/dist/cli.mjs --test --test-reporter=dot scripts/test_checkpoint14c1_third_review.ts scripts/test_checkpoint14c1_review.ts scripts/test_checkpoint14c1_shopping_cart.ts
npm run lint
npm run test:all
npm run build
npm run test:e2e
```

| Suite/check | Passed | Failed |
| --- | ---: | ---: |
| TypeScript (`tsc --noEmit`) | PASS | 0 errors |
| All-suite runner | 12 commands | 0 commands |
| Canonical regressions | 6 scenarios / 101 assertions | 0 |
| Checkpoint 9 diagnostic | 6 scenarios executed, exit 0 | 0 execution errors |
| Checkpoint 10 | 6 scenarios | 0 |
| Checkpoint 14 hardening | 23 checks | 0 |
| Checkpoint 14B professional reports | 57 checks | 0 |
| Checkpoint 14B.1 dual reports | 102 checks | 0 |
| Checkpoint 14B.2A price boundaries | 14 checks | 0 |
| Checkpoint 14B.2B behavioral prices | 20 checks | 0 |
| Checkpoint 14B.3 exclusions/suitability | 31 checks | 0 |
| Original cart regressions | 52 cases | 0 |
| Earlier PR review regressions | 30 cases | 0 |
| Third-review adversarial regressions | 32 cases | 0 |
| Playwright Chromium | 29 tests | 0 |
| Production build | PASS, 1690 modules | 0 errors |

Nine new UI cases cover color-choice placement, optional features, qualified totals,
currency-free budgets, budgets before items, EUR API prices, and mismatched API
currency labels/source evidence. All API scenarios use mocks. The managed local
server runs with `DISABLE_MODEL_API=1` and stopped after testing; port 3101 has no
remaining listener. No paid model calls or dependency/lockfile changes were made.

Final build JS: 587.51 kB, 144.41 kB gzip. Existing Vite warnings remain for the
bundle above 500 kB and `__dirname` under a future native config loader.
`git diff --check` passed. Generated outputs, browser artifacts, dependency folders,
and credentials remain excluded from the commit.

## Files and limitations

- Modified `src/services/evaluation/shoppingCartSemantics.ts`.
- Modified `src/services/evaluation/fallbackVerificationEngine.ts`.
- Added `scripts/test_checkpoint14c1_third_review.ts`.
- Modified `scripts/run_all_tests.ts` to include the new suite.
- Modified `tests/e2e/shopping-cart.spec.ts`.
- Added this verification report.

Parsing remains rule-based English with supported categories and explicit USD
prices. Qualified totals intentionally remain UNKNOWN; supported physical-unit
filtering is not a general measurement parser. Foreign currencies are not converted.
Live-model/catalog integration and non-Chromium browsers are not verified.

Ready for continued independent review. PR remains draft. No merge or modification
of main, no branch change or force push, and no changes to the separate Gemini
review repository were performed.
