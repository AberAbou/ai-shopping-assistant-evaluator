# Issue 6: coordinated feature exclusions

Base: accepted main `2267ec380a1045bd30455f8653d1d18e4466000c`.
Branch: `codex/issue-6-negated-properties`.
Issue: https://github.com/AberAbou/ai-shopping-assistant-evaluator/issues/6

## Reproduction and findings

The original manual prompt asks for a lightweight, breathable summer trail-running
jacket under $100 that must not be waterproof or insulated. The assistant recommends
a $180 waterproof, heavily insulated winter parka. A deterministic regression failed
on accepted main because the canonical feature constraints were positive, while
generic exclusion extraction produced a malformed `be waterproof` constraint.
Generic feature verification also ignored negative polarity when accepting a match.
The correct overall price failure masked these constraint-level errors.

## Correction

- Reconcile waterproof and insulated requirements from original shopper evidence
  for both fallback and successful API analysis. Canonical attributes are
  `water_resistance` and `insulation`, with negative polarity and `prohibited`
  operators for exclusions. Remove contradictory duplicates and synchronize intent,
  summary counts, and raw report artifacts.
- Apply negation through bounded coordinated lists: `must not be A or B`,
  `neither A nor B`, `no A or B`, `without A or B`, comma-separated lists, and
  explicit negative prefixes. Stop negation at a new clause or affirmative predicate.
- Rebuild feature claims from product-bounded raw evidence in both analysis paths.
  Opposing assertions produce UNKNOWN with conflict evidence; silence remains UNKNOWN.
  Explicit forbidden properties independently FAIL, while explicit absence can PASS.
- Preserve governing requirement clauses so identical feature words on different
  products retain their category-specific scope. Keep claim-support contradictions,
  hard gates, counts, rubric descriptions, and report exports consistent.

The original reproduction now has exactly two canonical negative HARD feature
constraints, both FAIL with traceable assistant evidence. Its negative-failure count
is 2, and the final result remains FAIL/HIGH. Positive requirements, price boundaries,
cart behavior, single-product behavior, and existing reporting invariants are covered
by the unchanged established suites.

## Verification

All commands ran with `DISABLE_MODEL_API=1`. API-backed tests use local mocked
responses; fallback browser tests return HTTP 503 from analysis routes.

```powershell
$env:DISABLE_MODEL_API='1'
npx tsx --test scripts/test_issue6_negated_properties.ts
npx playwright test tests/e2e/negated-properties.spec.ts
npm run test:all
npm run lint
npm run build
npm run test:e2e
```

Final results on the final source tree:

| Check | Result |
| --- | --- |
| Full regression runner | 17/17 commands passed, 0 failures |
| Issue 6 deterministic suite | 19 passed, 0 failed |
| Full Chromium suite | 120 passed, 0 failed (4.5 minutes) |
| Issue 6 browser cases included above | 20 passed, 0 failed |
| TypeScript (`tsc --noEmit`) | Passed, no errors |
| Production build | Passed, 1693 modules transformed |
| Git whitespace check | Passed |

The new tests cover the original blocker, malformed/truncated API constraints,
canonical aliases, coordinated negation, punctuation, explicit absence, missing
evidence, conflicting waterproof/insulation assertions, benign positive requirements,
clause boundaries, product-specific evidence and requirements, hard-gate outcomes,
failure counts, displayed constraint matrix rows, and detailed/JSON/Markdown reporting.
The focused browser suite passed 20/20 before the final full run; the final full run
also checked the actual manual-blocker matrix rows. No existing assertions were weakened.

Existing non-blocking Vite warnings remain: future native config loading with
`__dirname`, and the JavaScript bundle exceeding 500 kB. Feature verification relies
on statements in the supplied assistant response and does not establish external
product truth. Missing or conflicting evidence remains UNKNOWN.

## Release safety

Local and remote main remain at `2267ec380a1045bd30455f8653d1d18e4466000c`.
Accepted tag objects and targets are preserved:

| Tag | Annotated object | Target |
| --- | --- | --- |
| checkpoint-14c1-accepted | a0c17010a3fbba698fb5f13ce2e38bb76870b2dc | abcbf6a32a13318da9f3d39266eeb3e1757355e3 |
| checkpoint-14c2-accepted | f9f6b62c58f9afad86d617d3a082927449d05772 | 1e438af9ba81e4e035316195255067a308ac56bd |
| checkpoint-14c3-accepted | 694c09797f8206b6b10d6c9cf554ab490f406f38 | 2267ec380a1045bd30455f8653d1d18e4466000c |

No paid models, deployment, merge, dependency changes, or Gemini review repository
changes. Build output, node_modules, environment files, and test artifacts remain
excluded by existing ignore rules. The acceptance server was stopped before work;
Playwright managed its own local server lifecycle.
