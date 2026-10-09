# Issue 8 — QA Assessment Report

Issue: https://github.com/AberAbou/ai-shopping-assistant-evaluator/issues/8

Branch: `feature/human-style-assessment-report`

Base: accepted main `5b42c86bc5c887e3ff794ec552eef10c87a2a82d`.
Main and the annotated `final-acceptance` tag are preserved.

## Delivered behavior

After evaluation, section **10. Report & Export** offers a prominent red
**Generate QA Assessment Report** button below its existing controls. The new
report can be viewed and edited in a labeled text area, copied, downloaded as
Markdown, regenerated from the original findings, or closed. Downloads and copies
include the current reviewer edits. Existing concise, detailed, structured,
Markdown, and print exports keep their established behavior.

The report includes the requested title, scope/objective, request summary,
acceptance criteria, observed response, comparative method, requirement findings,
outcome/severity, deviations, risk/impact, corrective recommendations, limitations,
and blank reviewer name/date/comments with status awaiting review. Findings
distinguish mandatory and optional requirements and retain PASS, FAIL, UNKNOWN,
and CONFLICT (UNKNOWN), including product isolation and disagreement over totals.

Report narrative avoids technical implementation language and internal requirement
identifiers. Supplied requests and response evidence are preserved verbatim in
bounded Markdown blocks, including any technical words the shopper supplied.
No external catalog checks, physical tests, human verification, or reviewer approval
are fabricated. Corrective actions identify the affected product and expected
requirement, with mandatory actions given priority.

Conversation reports receive every assessed turn, rather than only the currently
selected result. They include per-turn outcomes, active requirement origins,
revision history, request/response excerpts, and unresolved clarification. A latest
PASS does not erase earlier failures. If only one turn's assessment is supplied,
earlier transcript turns are explicitly marked not assessed in this report.

Changing a single input invalidates the new report and disables generation until
reevaluation. Conversation edits, turn additions/removals, and clearing already
invalidate the result set and remove the report. Switching the selected assessed
turn clears an edited report; regeneration still uses the full assessed history.

## Initial implementation verification

Commands ran with `DISABLE_MODEL_API=1`:

```powershell
npx tsx --test scripts/test_issue8_assessment_report.ts
npx playwright test tests/e2e/assessment-report.spec.ts
npm run test:all
npm run lint
npm run build
npm run test:e2e
```

| Check | Final result |
| --- | --- |
| Complete regression runner | 18/18 commands passed, 0 failed |
| New report deterministic suite | 12 passed, 0 failed |
| Complete Chromium suite | 135 passed, 0 failed (5.2 minutes) |
| New report Chromium cases included above | 15 passed, 0 failed |
| TypeScript | Passed, no errors |
| Production build | Passed, 1695 modules transformed |
| Git whitespace check | Passed |

Coverage includes headings and stakeholder language; original evidence; mandatory
and optional outcomes; missing/conflicting information; cart totals; isolated
product corrections; blank sign-off; report purity and unchanged existing export
results; full and partial conversation audit; red button styling, location and
keyboard access; exact edited downloads; clipboard copy; regeneration; and stale
input/turn invalidation. API scenarios use local mocks, and conversation/fallback
scenarios operate offline. No paid model calls were made.

The first focused browser run passed 14/15: Windows clipboard reads converted LF
to CRLF. The clipboard assertion now normalizes platform line endings while
checking all content; download assertions continue to compare exact file text.
The focused rerun passed 15/15, followed by the full 135/135 run. No application
assertions were weakened. Existing Vite native-config and bundle-size warnings
remain non-blocking.

## Scope and safety

No new dependencies, deployment, merge, release-tag changes, or separate Gemini
review repository changes. Generated build/test artifacts, dependencies, and
credentials remain ignored. The local demo server was stopped for testing;
Playwright managed its test server lifecycle. A local disabled-model server is
restored on port 3101 after verification for reviewing this feature branch.

The new report exports Markdown; it has no dedicated PDF generator. Reviewer edits
are local to the visible report, and sign-off still requires independent review.
This draft is ready for review and manual acceptance, not a release approval.

## PR #9 review correction — authoritative cart findings

The independent review identified duplicate cart findings: upstream verification
records already contained the cart checks, and the report appended the same checks
from the final cart summary. Four focused deterministic regressions reproduced
the duplicate findings, repeated subjects/actions, and missing conflict semantics
before the correction (4 failed, 12 existing tests intentionally skipped).

The report now selects one upstream record per requirement and subject identity.
Distinct products remain separate even when their display names match. A cart
summary supplies a single fallback finding only when no upstream record exists
for that requirement. Upstream status, evidence, subject, and conflict flags are
retained. Fallback monetary constraints preserve total disagreement regardless of
the monetary attribute alias; cart membership and quantities do not inherit it.

Test 6 now reports six findings: one budget, one membership, two category
quantities, and one suitability finding for each product. Only the budget has
CONFLICT (UNKNOWN), quantity checks remain PASS, and one corrective action addresses
the unresolved budget. Conversation reports retain these counts for every turn.

Final correction verification, all with `DISABLE_MODEL_API=1`:

```powershell
npx tsx --test --test-name-pattern='review:' scripts/test_issue8_assessment_report.ts
npx tsx --test scripts/test_issue8_assessment_report.ts
npm run test:all
npm run lint
npm run build
npm run test:e2e
```

- Complete regression runner: 18/18 commands passed, 0 failed.
- Stakeholder report suite: 16 passed, 0 failed (4 new review regressions).
- Complete Chromium suite: 138 passed, 0 failed (5.3 minutes), including 3 new
  assertions of exact finding counts, unique intended targets, monetary-only
  conflicts, single corrective actions, downloaded content, and conversation audit.
- TypeScript and production build passed. Existing non-blocking Vite warnings remain.
- Git whitespace check passed; existing exports and evaluation behavior unchanged.

The correction stays on `feature/human-style-assessment-report`; PR #9 remains
draft. Main, accepted tags, original export semantics, reviewer sign-off, and red
report controls are preserved. No merge, deployment, or paid model calls.
