# Checkpoint 14C.3 — Conversation shopping-cart evaluation

Issue: https://github.com/AberAbou/ai-shopping-assistant-evaluator/issues/4

Branch: `feature/checkpoint-14c3-multiquery-cart`.
Baseline: `1e438af9ba81e4e035316195255067a308ac56bd`.
Status: implemented and verified for independent review; manual acceptance is pending.

## 14C.2 release housekeeping

Stopped the existing local development server and confirmed a clean working tree.
Fetched GitHub and fast-forwarded local main to the accepted PR #3 merge above.
Before starting the new branch, TypeScript passed, all 15 regression commands
passed, all 83 Chromium tests passed, and the production build passed.

Created and pushed annotated `checkpoint-14c2-accepted` on that verified main
commit. Both the tag's peeled remote ref and remote main were checked. The
14C.1 acceptance tag still resolves to
`abcbf6a32a13318da9f3d39266eeb3e1757355e3`. Existing feature branches and Git
history were preserved; no reset, rebase, force push, or merge was performed.

## Product decision and workflow

The evaluator retains its default two-input single-prompt workflow. An opt-in
Conversation mode accepts ordered user/assistant pairs with stable turn IDs,
supports adding/removing turns, and shows each turn's evaluation independently.
Input edits clear earlier results and exports. Each evaluation is rebuilt from
the ordered transcript rather than mutating an earlier evaluation result.

The user explicitly selected **complete cart snapshots**. Every assistant turn
is evaluated independently against the active user requirements. Earlier
assistant prices, quantities, suitability assertions, or exclusions never fill
gaps in a later response. Empty or incomplete snapshots remain UNKNOWN where
required evidence is absent. Conversation evaluation is deterministic and offline;
it never calls the model-analysis API endpoints. The existing single-prompt API
and deterministic fallback paths remain available with their established behavior.

## Implementation

User requirements carry forward until explicitly changed. Named category counts
can be revised, categories added or removed, and entire categories replaced.
Replacement quantities are not inherited from removed products. Ambiguous,
partial, variant-specific, or unsupported update-only requests require
clarification; they cannot silently pass. Explicit clarification restores the
unaffected earlier requirements. An empty cart cannot produce a false PASS.

Mandatory budgets and optional preferences remain separate. An optional cap
does not withdraw an earlier hard cap. Explicit changes replace the corresponding
prior bound; lower and upper bounds remain independent, and competing limits
in the same turn are not discarded. Cart budgets and product-level caps are
attributed from their local clauses. Active intent reflects the current cart
budget, not a separate per-product cap or superseded budget.

Product-specific requirements remain isolated. Explicit supported requirement
withdrawals can target one category while preserving the other categories'
exclusions. Earlier hard requirements remain enforceable when another revision
is unresolved; confirmed hard failures retain precedence over UNKNOWN.

Multiple labeled candidate carts require an explicit matching option selection.
Only the selected, uniquely labeled snapshot is parsed. Unselected, mismatched,
or duplicate labels cannot combine alternatives into one cart or silently select
the first candidate. Choices apply only to their paired assistant response;
historical option labels are not carried forward. Calculated/stated total disagreement continues to affect
monetary verification independently of membership and quantity verification.

Constraints, requested items, and extracted claims retain their source turn IDs.
JSON preserves the raw transcript, evaluated turn, snapshot policy, revision
history, unresolved issues, active requirements, and latest-turn claim evidence.
Markdown, concise, and detailed text exports include the conversation audit.
Default single-prompt export formatting remains unchanged.

## Files modified or created

- `src/types/evaluation.ts`
- `src/App.tsx`
- `src/components/ConversationWorkspace.tsx` (new)
- `src/services/evaluation/conversationEvaluation.ts` (new)
- `src/services/evaluation/fallbackVerificationEngine.ts`
- `src/services/evaluation/reportExportHelper.ts`
- `scripts/run_all_tests.ts`
- `scripts/test_checkpoint14c3_conversation.ts` (new)
- `tests/e2e/conversation.spec.ts` (new)
- This report (new)

No dependency or lockfile changes were needed. No providers were installed.

## Verification

Commands executed for implementation verification:

```text
npx tsx --test scripts/test_checkpoint14c3_conversation.ts
npx playwright test tests/e2e/conversation.spec.ts
npm run lint
npm run test:all
npm run test:e2e
npm run build
```

Focused tests were rerun while correcting ordinary implementation failures.
The final complete deterministic run passed all **16/16 commands**, zero failures.

| Suite | Final result |
| --- | --- |
| Canonical A–F | 6/6 scenarios; 101/101 assertions |
| Checkpoint 9 diagnostic | Exit 0 |
| Checkpoint 10 | 6/6 scenarios |
| 14 hardening | 23 passed, 0 failed |
| 14B professional reports | 57 passed, 0 failed |
| 14B.1 dual reports | 102 passed, 0 failed |
| 14B.3 exclusions | 31 passed, 0 failed |
| Price boundaries | 14 passed, 0 failed |
| Behavioral price verification | 20 passed, 0 failed |
| 14C.1 shopping carts | 52 passed, 0 failed |
| 14C.1 first review | 30 passed, 0 failed |
| 14C.1 third review | 32 passed, 0 failed |
| Collective suitability | 57 passed, 0 failed |
| Soft budgets | 50 passed, 0 failed |
| 14C.2 reporting | 20 passed, 0 failed |
| 14C.3 conversations | 55 passed, 0 failed |

The complete Chromium suite passed **100/100**, zero failures (83 established
tests plus 17 conversation tests), including all four independent-review
regressions. These runs used Playwright's
managed server with `PORT=3101` and `DISABLE_MODEL_API=1`; existing API scenarios
used mocked responses, and conversation scenarios reject model endpoint calls.

TypeScript: `tsc --noEmit` passed with zero errors.
Production build: passed, 1,692 modules; JavaScript 606.28 kB / gzip 150.07 kB.
Existing Vite warnings about the future native configuration loader and a
bundle larger than 500 kB remain. Neither is a compilation failure.

The new regressions cover A–F single-turn parity, retained requirements,
budget/quantity revisions and boundaries, additions, removals, replacements,
clarifications, invalid/equivalent/conflicting counts, missing current evidence,
currencies, hard/soft precedence, product evidence isolation, contradictory
claims, candidate selection, exports, and input validation.

## Limitations and independent review

Conversation mode supports up to 20 turns, with 20,000 user characters and
50,000 assistant characters per turn. Parsing uses the existing supported
category and requirement vocabulary; it is not a general natural-language
conversation interpreter. Cart state uses category-level slots. Partial or
variant-specific removal/replacement references require category clarification;
arbitrary variant tracking and incremental assistant snapshots are not supported.
Unsupported currency and unresolved evidence retain UNKNOWN semantics. External
catalog truth verification and model enrichment were not performed.

The draft PR needs independent review and manual acceptance. No 14C.3 acceptance
tag was created. Main and previously accepted tags were not changed during
implementation, and the separate Gemini review repository was untouched.
Dependencies, credentials, build outputs, and test artifacts remain excluded.
Test servers shut down automatically; port 3101 has no listener at completion.

## Independent PR #5 review correction

Review: https://github.com/AberAbou/ai-shopping-assistant-evaluator/pull/5#pullrequestreview-5465946371

Confirmed the blocking stale-choice defect. T2's explicit Option A selection was
stored in durable conversation state, so a T3 `Yes.` could silently select a new
Option A from newly presented candidates and return PASS. The added deterministic
regression reproduced that false PASS before the fix.

Removed selection from persistent cart state. The evaluator now derives a choice
solely from the user turn paired with the evaluated assistant response. A fresh
explicit choice can select that response's candidate; historical selection actions
remain in the audit trail but do not influence later snapshots. This matches the
complete-snapshot policy without changing durable budgets, quantities, exclusions,
or other requirements.

Explicit references to earlier responses, such as `Choose option A from T2`,
remain UNKNOWN and require clarification of the current response choice. This
patch does not resolve historical candidate identities or remap their labels to
new responses. Competing current choices also require clarification.

Four deterministic regressions cover stale T2/T3 selection, fresh T3 selections
with distinct totals and current-turn claim provenance, historical references,
and competing choices. Four Chromium cases check T3 `Yes.` (INDETERMINATE), fresh
Option A (PASS), fresh Option B (FAIL), and a T2 reference (INDETERMINATE), while
confirming T2's earlier evaluation remains PASS. Main, accepted tags, and the
separate Gemini review repository remain unchanged; the PR remains draft pending
independent re-review and manual acceptance.

Review verification commands:

```text
npx tsx --test --test-name-pattern="prior option|fresh choice|reference to an earlier|competing current" scripts/test_checkpoint14c3_conversation.ts
npx tsx --test scripts/test_checkpoint14c3_conversation.ts
npm run lint
npm run test:all
npm run build
npm run test:e2e
```

Before the fix, the targeted reproduction had three failures, one pass, and
51 intentionally skipped existing tests. After the fix, all 55 conversation
tests and all 16 complete-suite commands passed. TypeScript and the build passed.
The first full Chromium run had 99 passes and one failure: the trace showed
an unexpected page navigation clearing the already evaluated single-prompt UI,
coinciding with a report edit during the watched development-server run. No
incorrect verification values were observed. The complete suite was rerun with
the checkout unchanged and passed 100/100. No application assertions were weakened
or unrelated source fixes introduced. Test servers stopped after verification;
no paid models were used.
