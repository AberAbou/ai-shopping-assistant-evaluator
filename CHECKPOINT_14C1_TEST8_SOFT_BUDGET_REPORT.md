# Checkpoint 14C.1 — Manual acceptance Test 8 correction

Baseline: `1186867df98b8c9b050bd83a0eccba8e903d6a46`.
Branch: `feature/checkpoint-14c1-shopping-cart`.
Review: https://github.com/AberAbou/ai-shopping-assistant-evaluator/pull/1#pullrequestreview-5464707765

## Reproduction and correction

The supplied Test 8 prompt reproduced HARD/FAIL classification of an optional budget.
The monetary extractor starts its local context after the last comma, discarding
`Ideally,`. The initial 38 deterministic tests produced 32 failures and 6 passes.

A bounded preference-context helper now recognizes `Ideally`, `Preferably`,
`if possible`, and `nice to have`, including a standalone leading marker separated
from its budget by a comma or semicolon. Inline indicators and terminal
punctuation-separated postfix markers are supported. Only a standalone preference
marker can be recovered from the immediately preceding segment; a complete
neighboring optional requirement cannot soften the next budget. Postfix markers
must be terminal in their sentence, avoiding reassignment of a leading marker in
`under $90, ideally, under $70`. Explicit mandatory wording in the local requirement
remains hard. Numeric operators, currency handling, product/cart scope, arithmetic,
and the hard-gate implementation are unchanged.

Parsed soft-budget evidence retains its exact preference wording and punctuation
as a source substring for reports and requirement traceability. Shared prompt
reconciliation applies the correction to fallback and API-derived analyses alike.
Unparsed budget classification also uses the same preference helper.

For the supplied cart, quantities and running-suitability requirements PASS, the
calculated/stated total remains $80, the under-$70 budget is SOFT/FAIL, and the cart
hard gate and final verdict PASS. Overall severity is NONE. Reports still disclose
the failed optional preference. A failed mandatory quantity, suitability requirement,
or hard budget continues to cause FAIL.

## Changed files

- `src/services/evaluation/shoppingCartSemantics.ts`
- `scripts/run_all_tests.ts`
- `scripts/test_checkpoint14c1_soft_budget.ts` (new)
- `tests/e2e/soft-budget.spec.ts` (new)
- This report (new)

No dependencies, lockfile, UI source, server source, or verdict engine changes.

## Verification

Exact commands:

```text
node node_modules/tsx/dist/cli.mjs --test scripts/test_checkpoint14c1_soft_budget.ts
npm run lint
npm run test:all
npm run build
npm run test:e2e
git -c safe.directory=C:/Users/AberA/Tutorials/ai-shopping-assistant-evaluator diff --check
```

| Suite | Final result |
| --- | --- |
| TypeScript (`npm run lint`) | PASS; zero errors |
| All regression commands | 14/14 PASS; 0 failed |
| Canonical regression | 6/6 scenarios; 101/101 assertions |
| Checkpoint 9 diagnostic | 6 scenarios; exit 0, no assertion count reported |
| Checkpoint 10 | 6/6 scenarios |
| Hardening | 23/23 |
| Professional reports | 57/57 |
| Dual reports | 102/102 |
| Checkpoint 14B.3 exclusions/suitability | 31/31 |
| Price boundaries | 14/14 |
| Behavioral price verification | 20/20 |
| Original cart cases | 52/52 |
| First review cases | 30/30 |
| Third review cases | 32/32 |
| Collective suitability cases | 57/57 |
| New soft-budget cases | 50/50 |
| Playwright Chromium | 69 passed; 0 failed |
| Production build | PASS; 1690 modules |
| Whitespace validation | PASS |

The 50 new deterministic cases cover preference indicators across comma/semicolon
boundaries, colon and terminal postfix wording, mixed soft/hard budgets in both
orders, unrelated feature preferences, optional per-item caps, strict hard boundaries,
mandatory quantities and suitability, API reclassification, cart totals, source
traceability, severity, and optional-preference reporting.

Twenty-two new browser cases cover eleven scenarios through both offline fallback
and mocked API prompt payloads deliberately setting monetary constraints to HARD.
They verify the final verdict, classifications, arithmetic, suitability, Test 8
SOFT/FAIL versus HARD_GATE_PASS/PASS/NONE, exported source evidence, and detailed
report rendering. All previous 47 browser cases also passed.

Existing Vite warnings remain for future native-config-loader support of `__dirname`
and a JavaScript bundle above 500 kB (590.78 kB; 145.31 kB gzip).

## Safety and manual retesting

The previous development server was stopped before changes. Playwright managed its
own server with `DISABLE_MODEL_API=1`; API requests were mocked or made unavailable.
No paid models were invoked. Generated files, credentials, dependencies, and test
artifacts remain excluded. Only the existing feature branch is committed/pushed;
main and the separate Gemini review repository remain untouched. PR remains draft.

After successful verification, the app is restarted with `NODE_ENV=development`,
`PORT=3101`, and `DISABLE_MODEL_API=1` at http://localhost:3101/ for manual retesting.
Parsing remains limited to supported English phrasing; ambiguous compound wording
outside the tested grammar and non-Chromium browsers are not certified. Final manual
acceptance remains pending.
