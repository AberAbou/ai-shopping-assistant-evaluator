# Checkpoint 14C.1 — Collective running-suitability acceptance correction

Baseline: `73d011c4f8236fbb3ae5e9f12fdfd37261514c00`.
Branch: `feature/checkpoint-14c1-shopping-cart`.
Review: https://github.com/AberAbou/ai-shopping-assistant-evaluator/pull/1#pullrequestreview-5464558796

## Findings and correction

The exact manual acceptance input/output reproduced the collective evidence defect.
The previous product-section extraction assigned the final collective assertion only
to the shorts. Deterministic prompt reconciliation also scoped the first occurrence
of `running` to shirts, despite the later explicit requirement for all items.
The initial 16 focused deterministic cases all failed before correction.

Shared API/fallback reconciliation now recognizes the explicit collective requirement
as a hard product-level requirement applying to every product, with the full source
phrase retained. Separate product-specific requirements for other activities remain
intact. Supported activity assertions are reconstructed from raw output rather than
trusting model-assigned product links. Explicit collective subjects distribute only
the activity assertion to each product; named/category-specific and local assertions
remain isolated. Ambiguous category references to multiple products remain UNKNOWN.
Each attributed claim has a distinct claim ID and retains its exact raw source clause.
Summaries, per-product suitability metadata, JSON, and reports use those claims.

Activity verification distinguishes positive and negative predicates. Explicit denial
without positive evidence yields FAIL. Positive and negative claims for the same
product/activity yield UNKNOWN with `conflictDetected` and both evidence sources.
A denial concerning hiking does not contradict suitability for running; unrelated
negative attributes do not negate activity evidence. Conditional statements do not
establish unconditional suitability.

For the manual case, both products now PASS running suitability. Calculated/stated
cart total remains $90, the hard under-$85 budget remains FAIL, and overall verdict
and severity remain FAIL/HIGH. With an under-$100 budget and unopposed collective
running evidence, the otherwise valid cart passes.

## Files changed

- `src/services/evaluation/shoppingCartSemantics.ts`
- `src/services/evaluation/fallbackVerificationEngine.ts`
- `scripts/run_all_tests.ts`
- `scripts/test_checkpoint14c1_collective.ts` (new)
- `tests/e2e/collective-suitability.spec.ts` (new)
- This report (new)

No dependency, lockfile, server, or UI source changes were required.

## Final verification

| Command / suite | Result |
| --- | --- |
| `npm run lint` | PASS; zero TypeScript errors |
| `npm run test:all` | 13/13 regression commands PASS; 0 failed |
| Canonical | 6/6 scenarios; 101/101 assertions |
| Checkpoint 9 diagnostic | 6 scenarios executed; exit 0, no assertion count reported |
| Checkpoint 10 | 6/6 scenarios |
| Hardening | 23/23 |
| Professional reports | 57/57 |
| Dual reports | 102/102 |
| Checkpoint 14B.3 exclusions/suitability | 31/31 |
| Price boundaries | 14/14 |
| Behavioral price verification | 20/20 |
| Original cart regressions | 52/52 |
| First PR review regressions | 30/30 |
| Third review regressions | 32/32 |
| New collective regressions | 57/57 |
| `npm run build` | PASS; 1690 modules |
| `npm run test:e2e` | 47 passed, 0 failed; Chromium |
| `git diff --check` | PASS |

Additional focused commands used while reproducing and hardening:

```text
node node_modules/tsx/dist/cli.mjs --test scripts/test_checkpoint14c1_collective.ts
node node_modules/tsx/dist/cli.mjs --test --test-reporter=dot scripts/test_checkpoint14c1_collective.ts
```

The new deterministic coverage includes API normalization with deliberately incorrect
product links, fallback analysis, over/under-budget carts, positive/negative collective
claims, each product's isolated evidence, conflicting claims in either order and within
one clause, different activities, unrelated negative attributes, conditional statements,
inline evidence, ambiguous same-category references, retained scoped requirements,
and report provenance.

Eighteen new browser cases exercise nine scenarios through both unavailable-API
fallback and mocked API responses deliberately assigning all activity claims to P2.
They verify exported verdict, total, product-level statuses, full source provenance,
conflict evidence, detailed report rendering, and manual-case FAIL/HIGH.

An intermediate browser run had two test-harness failures: severity was read from
`json.overallSeverity` instead of the established `json.summary.overallSeverity`.
The assertion was corrected without changing expected HIGH severity; the complete
final suite passed after all source changes.

Existing build warnings remain for a bundle above 500 kB (590.14 kB JavaScript,
145.08 kB gzip) and future Vite native-config-loader compatibility with `__dirname`.

## Safety and limitations

The previous manual server was stopped before implementation. Playwright manages its
own server with `DISABLE_MODEL_API=1`; API scenarios use mocks or offline fallback.
No paid models, live Gemini calls, new providers, or dependency installations occurred.
Generated outputs, logs, dependencies, credentials, and test artifacts remain excluded.
Only the existing feature branch is eligible for this commit/push; main, the separate
Gemini review repository, and recovery source remain untouched. PR stays draft.

Activity extraction remains a deterministic supported-English grammar. Unsupported
or ambiguous activity wording can remain UNKNOWN; this change does not certify real
product suitability or external model truth. Browser coverage is Chromium only.
Final user acceptance is still required. After verification the development server
is restarted with `NODE_ENV=development`, `PORT=3101`, and `DISABLE_MODEL_API=1` for
manual retesting at http://localhost:3101/.
