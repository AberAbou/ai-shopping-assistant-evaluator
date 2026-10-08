# Checkpoint 14C.1 — Development and Verification Report

Date: 2026-10-09 (Africa/Cairo)

The shopping-cart implementation is implemented and verified for the covered scenarios. It is ready for independent Gemini review. No commit, push, merge, branch change, or modification of the recovery source was performed.

## Dependencies

The smallest dependency correction was changing the direct esbuild declaration from `^0.25.0` to `^0.28.2`, which satisfies Vite's `^0.27.0 || ^0.28.0` peer requirement. Vite's declaration remains `^8.3.0`. Playwright was added only as a development dependency for the requested browser tests.

Locked versions: Vite 8.3.4, esbuild 0.28.2, @vitejs/plugin-react 6.1.2, @tailwindcss/vite 4.3.3, TypeScript 7.0.2, tsx 4.23.15, @playwright/test 1.64.0. Runtime: Node 20.20.2, npm 10.8.2.

Dependency commands:

```powershell
npm view vite@8.3.4 engines peerDependencies --json
npm view esbuild@0.28.2 engines --json
npm view @vitejs/plugin-react@6.1.1 engines --json
npm install --no-audit --no-fund
npm install --save-dev @playwright/test --no-audit --no-fund
npx playwright install chromium
npm ci --no-audit --no-fund
```

Installation succeeded: initial project install added 180 packages, Playwright added 3, and the lockfile-only reinstall added 183. No `--force` or `--legacy-peer-deps` was used. No additional LLM provider was installed. npm reported the dependency's node-domexception deprecation warning.

## Defects fixed

- Shared reconciliation enforces cart quantity, budget, and category-scoping rules for fallback results, normalized API results, and successful client API responses. Server schemas now describe cart scope and explicit quantities.
- Product verification and rubrics use the same applicable constraints. Cart requirements never enter product rubrics. Cart-only causes and recommendations no longer leak into a single product's diagnostics.
- Positive integer quantities are extracted from prose, lists, word quantities, and price-free item lists. Invalid, missing, or ambiguous quantities remain UNKNOWN. Requested quantities are aggregated by category across split product rows.
- Combined requests are distinguished from mutually exclusive alternatives. Multiple recommendations alone no longer trigger cart summation; “or less” does not imply alternatives.
- Item-specific prices and attributes remain category-scoped; combined budgets and requested basket quantities are checked at cart scope. Missing requested categories remain UNKNOWN.
- Only hard cart failures affect the hard gate. Optional failed or unknown budgets cannot override satisfied mandatory requirements.
- Unsupported or unresolved budget operators remain UNKNOWN; they are not silently treated as inclusive ceilings. Unsupported currency evidence is not summed as USD.
- Line totals use cent arithmetic. Missing line-item evidence cannot be concealed by a stated total. Disagreement between calculated and stated totals remains unresolved rather than selecting whichever total passes.
- Cart results flow through final verdicts, response severity, root causes, recommendations, JSON, technical Markdown, concise reports, detailed reports, and the final evaluation UI. Verification IDs remain consistent across artifacts.
- Professional reports distinguish cart failures from product failures and identify failed optional budgets as optional preferences.
- The obsolete 14B.2B source-expression assertions were replaced with behavioral extraction and verification checks, preserving strict boundaries, operator aliases, missing-price UNKNOWN, and unsupported-operator UNKNOWN.

## Automated results

Final commands:

```powershell
npm run lint
npm run test:all
npm run build
npm run test:e2e
```

`npm run lint` executes `tsc --noEmit`; it passed with zero errors.

`npm run test:all` executes every existing regression script plus the new deterministic cart suite. All 10 commands passed, with zero failed commands. Counts are reported in each suite's own units; scenarios, assertions, and test cases are not conflated.

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Canonical A–F regression scenarios | 6 scenarios / 101 assertions | 0 / 0 |
| Checkpoint 9 diagnostic script | 6 diagnostic scenarios executed successfully; no assertion count reported | No execution errors |
| Checkpoint 10 | 6 scenarios | 0 |
| Checkpoint 14 hardening | 23 checks | 0 |
| Checkpoint 14B professional report | 57 checks | 0 |
| Checkpoint 14B.1 dual reports | 102 checks | 0 |
| Checkpoint 14B.2A price boundaries | 14 checks | 0 |
| Checkpoint 14B.2B behavioral price verification | 20 checks | 0 |
| Checkpoint 14B.3 exclusions and suitability | 31 checks | 0 |
| Checkpoint 14C.1 deterministic cart tests | 52 test cases | 0 |
| Playwright Chromium end-to-end | 15 test cases | 0 |

The aggregate runner executes:

```text
tsx scripts/run_regression_tests.ts
tsx test_checkpoint9_fix.ts
tsx scripts/test_checkpoint10.ts
tsx scripts/test_checkpoint14_hardening.ts
tsx scripts/test_checkpoint14b_professional_report.ts
tsx scripts/test_checkpoint14b1_dual_reports.ts
tsx scripts/test_checkpoint14b3_exclusion_extraction.ts
node scripts/test_checkpoint14b2a_price_boundaries.mjs
node scripts/test_checkpoint14b2b_price_verification.mjs
tsx --test scripts/test_checkpoint14c1_shopping_cart.ts
```

Browser coverage includes valid carts, the quantity-arithmetic and strict-boundary false-PASS reproductions, incorrect and missing quantities, conflicting totals, inclusive budgets, soft budgets, lists, scoped exclusions, running suitability, alternatives, optional missing prices, JSON exports, detailed reports, the cart panel, and unavailable-API fallback. API responses are mocked. The server receives `DISABLE_MODEL_API=1`, starts automatically on port 3101, and shuts down automatically. The final browser run passed all 15 cases in 55.0 seconds. No paid model calls were made.

Transient failures during development were corrected: report variable initialization, price-free extraction, a shared test-output directory being removed by Playwright, and an ambiguous browser locator. Final counts above are from successful reruns after these corrections.

## Production build

`vite build` passed: 1,690 modules transformed, producing `dist/`. Final JavaScript bundle: 583.27 kB (143.02 kB gzip). Vite retains non-blocking warnings about a chunk exceeding 500 kB and the existing `__dirname` configuration's compatibility with a future native configuration loader. Neither warning was suppressed or addressed by unrelated refactoring.

## File manifest

Modified tracked files (18):

```text
package.json
scripts/test_checkpoint14b2b_price_verification.mjs
server.ts
src/components/FinalEvaluationView.tsx
src/services/evaluation/claimAnalysisNormalizer.ts
src/services/evaluation/claimAnalysisService.ts
src/services/evaluation/fallbackClaimAnalyzer.ts
src/services/evaluation/fallbackPromptAnalyzer.ts
src/services/evaluation/fallbackVerificationEngine.ts
src/services/evaluation/finalVerdictEngine.ts
src/services/evaluation/promptAnalysisNormalizer.ts
src/services/evaluation/promptAnalysisService.ts
src/services/evaluation/recommendationEngine.ts
src/services/evaluation/reportExportHelper.ts
src/services/evaluation/rootCauseAnalyzer.ts
src/services/evaluation/rubricGenerator.ts
src/services/evaluation/severityScoringService.ts
src/types/evaluation.ts
```

New files (11, including this report):

```text
.gitignore
CHECKPOINT_14C1_REPORT.md
package-lock.json
playwright.config.ts
scripts/helpers/evaluate.ts
scripts/run_all_tests.ts
scripts/test_checkpoint14b2b_behavior.ts
scripts/test_checkpoint14c1_shopping_cart.ts
src/services/evaluation/shoppingCartEngine.ts
src/services/evaluation/shoppingCartSemantics.ts
tests/e2e/shopping-cart.spec.ts
```

Dependencies, build outputs, regression logs, browser artifacts, and environment credentials are ignored. Regression logs are retained locally in `regression-results/`; Playwright outputs use `test-results/`.

## Limitations and review readiness

Extraction remains rule-based for recognized English product categories and phrasing. Cart arithmetic currently verifies explicit USD unit prices and positive integer quantities; currency conversion, shipping, tax, and discount calculations are not inferred. Ambiguous evidence remains UNKNOWN. Tests verify API boundaries with mocks and normalizers; live Gemini behavior and external product truth were deliberately not tested. Browser coverage is Chromium only.

No remaining failing tests or known blockers were identified for the covered Checkpoint 14C.1 functionality. Independent Gemini review should examine scoping, extraction boundaries, and the new regression coverage before any commit or publication.

Final branch: `feature/checkpoint-14c1-shopping-cart`. HEAD remains `b809fac569e77b9f9c2f312da049f93842af231d` (Checkpoint 14B.3). Working tree: 18 modified tracked files and 11 untracked new files; nothing staged. Recovery-source hashes match the original recovery snapshot. Main was not changed. No commit, push, merge, or force-push occurred.
