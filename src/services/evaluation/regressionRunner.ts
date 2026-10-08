/**
 * Automated Regression Test Engine
 *
 * Evaluates canonical scenarios A–F against the full evaluation pipeline
 * and executes semantic assertions that protect all core invariants:
 *
 * 1. Hard gates are authoritative; numeric scores cannot override confirmed hard failures.
 * 2. UNKNOWN is NOT FAIL; missing evidence remains UNKNOWN.
 * 3. UNVERIFIED is NOT FALSE; absent external verification does not create hard failures.
 * 4. Numeric evidence scores measure supported coverage, not probability or quality.
 * 5. Product-specific claims, verification, diagnostics, recommendations, and verdicts remain isolated.
 * 6. Internal contradictions must not be arbitrarily resolved as true or false.
 * 7. Exactly two human inputs remain.
 */

import { REGRESSION_SCENARIOS, RegressionScenario } from '../../fixtures/regressionScenarios';
import { analyzeUserPrompt } from './promptAnalysisService';
import { analyzeLlmOutput } from './claimAnalysisService';
import { runConstraintVerification } from './verificationService';
import { runRubricEvaluation } from './rubricService';
import { runClaimSupportAnalysis } from './claimSupportService';
import { runRootCauseAnalysis } from './rootCauseService';
import { runSeverityAndScoringAnalysis } from './severityScoringService';
import { runRecommendationAnalysis } from './recommendationService';
import { runFinalEvaluationAnalysis } from './finalVerdictService';
import {
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  ClaimSupportAnalysisResult,
  FinalEvaluationResult,
  SeverityAndScoringResult,
  RecommendationEngineResult,
  RootCauseAnalysisResult,
  VerificationEngineResult,
  RubricEngineResult,
} from '../../types/evaluation';
import {
  buildExtractedClaimMap,
  formatReadableClaimStatement,
  buildExportJsonPayload,
  buildExportMarkdownReport,
  ReportExportDataParams,
} from './reportExportHelper';

export interface AssertionResult {
  name: string;
  passed: boolean;
  actual: any;
  expected: any;
  message?: string;
}

export interface ScenarioTestResult {
  scenario: RegressionScenario;
  passed: boolean;
  durationMs: number;
  assertions: AssertionResult[];
  pipelineOutputs?: {
    promptRes: UserPromptAnalysisResult;
    claimRes: LlmOutputClaimAnalysisResult;
    verifRes: VerificationEngineResult;
    rubricRes: RubricEngineResult;
    supportRes: ClaimSupportAnalysisResult;
    rootCauseRes: RootCauseAnalysisResult;
    severityRes: SeverityAndScoringResult;
    recRes: RecommendationEngineResult;
    finalRes: FinalEvaluationResult;
  };
  error?: string;
}

export interface RegressionSuiteResult {
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  durationMs: number;
  timestamp: string;
  scenarioResults: ScenarioTestResult[];
}

/**
 * Execute the full pipeline on a single scenario and run all semantic assertions.
 */
export async function runSingleScenarioTest(scenario: RegressionScenario): Promise<ScenarioTestResult> {
  const startTime = Date.now();
  const assertions: AssertionResult[] = [];

  const assert = (name: string, passed: boolean, actual: any, expected: any, message?: string) => {
    assertions.push({ name, passed, actual, expected, message });
  };

  try {
    const promptRes = await analyzeUserPrompt(scenario.userPrompt);
    const claimRes = await analyzeLlmOutput(scenario.llmOutput);

    if (!claimRes) {
      throw new Error(`Claim analysis returned null for scenario ${scenario.key}`);
    }

    const verifRes = await runConstraintVerification(
      promptRes.constraints,
      claimRes.products,
      claimRes.claims
    );
    const rubricRes = await runRubricEvaluation(
      promptRes.constraints,
      claimRes.products,
      verifRes
    );
    const supportRes = await runClaimSupportAnalysis(
      claimRes.claims,
      claimRes.products,
      scenario.llmOutput
    );
    const rootCauseRes = await runRootCauseAnalysis(
      promptRes,
      claimRes,
      verifRes,
      rubricRes,
      supportRes,
      scenario.userPrompt,
      scenario.llmOutput
    );
    const severityRes = await runSeverityAndScoringAnalysis(
      promptRes,
      claimRes,
      verifRes,
      rubricRes,
      supportRes,
      rootCauseRes
    );
    const recRes = await runRecommendationAnalysis(
      promptRes,
      claimRes,
      verifRes,
      rubricRes,
      supportRes,
      rootCauseRes,
      severityRes
    );
    const finalRes = await runFinalEvaluationAnalysis(
      promptRes,
      claimRes,
      verifRes,
      rubricRes,
      supportRes,
      rootCauseRes,
      severityRes,
      recRes,
      scenario.userPrompt,
      scenario.llmOutput
    );

    // =========================================================================
    // SEMANTIC ASSERTIONS AGAINST EXPECTED INVARIANTS
    // =========================================================================

    // 1. Overall Verdict
    assert(
      'Overall Verdict matches expected authoritative verdict',
      finalRes.finalVerdict === scenario.expected.overallVerdict,
      finalRes.finalVerdict,
      scenario.expected.overallVerdict
    );

    // 2. Authoritative Hard Gate State
    const hasAnyHardGateFail = rubricRes.productsList.some((p) => p.hardGateState === 'HARD_GATE_FAIL');
    const allHardGatePass = rubricRes.productsList.length > 0 && rubricRes.productsList.every((p) => p.hardGateState === 'HARD_GATE_PASS');
    const computedExpectedGate = hasAnyHardGateFail
      ? 'HARD_GATE_FAIL'
      : allHardGatePass
      ? 'HARD_GATE_PASS'
      : 'HARD_GATE_INDETERMINATE';

    assert(
      'Hard gate state matches expected authoritative state',
      computedExpectedGate === scenario.expected.hardGateState,
      computedExpectedGate,
      scenario.expected.hardGateState
    );

    // 3. Confirmed Failures Count
    if (scenario.expected.expectedConfirmedFailures !== undefined) {
      assert(
        'Total confirmed failures equals expected count',
        finalRes.summary.totalConfirmedFailures === scenario.expected.expectedConfirmedFailures,
        finalRes.summary.totalConfirmedFailures,
        scenario.expected.expectedConfirmedFailures
      );
    }
    if (scenario.expected.minConfirmedFailures !== undefined) {
      assert(
        'Total confirmed failures meets minimum threshold',
        finalRes.summary.totalConfirmedFailures >= scenario.expected.minConfirmedFailures,
        finalRes.summary.totalConfirmedFailures,
        `>= ${scenario.expected.minConfirmedFailures}`
      );
    }

    // 4. Unresolved UNKNOWN count (UNKNOWN is NOT FAIL invariant)
    if (scenario.expected.expectedUnresolvedUnknown !== undefined) {
      assert(
        'Unresolved unknowns preserved and NOT converted into failures',
        finalRes.summary.totalUnresolvedUnknown === scenario.expected.expectedUnresolvedUnknown,
        finalRes.summary.totalUnresolvedUnknown,
        scenario.expected.expectedUnresolvedUnknown,
        'Missing requirements must remain UNKNOWN, never treated as FAIL'
      );
    }

    // 5. Overall Severity
    if (scenario.expected.expectedSeverity) {
      assert(
        'Overall severity matches expected tier',
        finalRes.summary.overallSeverity === scenario.expected.expectedSeverity,
        finalRes.summary.overallSeverity,
        scenario.expected.expectedSeverity
      );
    }

    // 6. Evaluated Evidence Score (Coverage metric, NOT probability)
    if (scenario.expected.expectedEvidenceScore !== undefined) {
      assert(
        'Evidence coverage score matches expected value',
        finalRes.summary.averageEvaluatedEvidenceScore === scenario.expected.expectedEvidenceScore,
        finalRes.summary.averageEvaluatedEvidenceScore,
        scenario.expected.expectedEvidenceScore,
        'Score is a transparent coverage/evidence metric'
      );
    }

    // 7. Hard Gate Non-Override Invariant
    if (scenario.expected.overallVerdict === 'FAIL') {
      assert(
        'Numeric score does NOT override confirmed FAIL',
        finalRes.finalVerdict === 'FAIL',
        finalRes.finalVerdict,
        'FAIL',
        'Scores cannot soften authoritative hard-gate failures'
      );
    }

    // 8. UNVERIFIED is NOT FALSE Invariant
    const unverifiedClaims = supportRes.records.filter((r) => r.externalTruthStatus === 'UNVERIFIED');
    const unverifiedTreatedAsFail = verifRes.records.some(
      (v) => v.status === 'FAIL' && v.claimEvidence.some((e) => e.includes('UNVERIFIED_CLAIM_ASSUMED_FALSE'))
    );
    assert(
      'UNVERIFIED external claims are NOT assumed false',
      !unverifiedTreatedAsFail,
      unverifiedTreatedAsFail,
      false,
      'Absence of external catalog truth does not create failure'
    );

    // 9. Root-Cause Classification
    if (scenario.expected.expectedPrimaryRootCause) {
      const primaryRecords = rootCauseRes.records.filter((r) => r.role === 'primary');
      const allCodes = rootCauseRes.records.map((r) => r.code);
      const primaryCodes = primaryRecords.map((r) => r.code);
      const hasCode =
        primaryCodes.includes(scenario.expected.expectedPrimaryRootCause as any) ||
        allCodes.includes(scenario.expected.expectedPrimaryRootCause as any);

      assert(
        `Root-cause classification includes ${scenario.expected.expectedPrimaryRootCause}`,
        hasCode,
        primaryCodes.length > 0 ? primaryCodes : allCodes,
        scenario.expected.expectedPrimaryRootCause
      );
    }

    // 10. Multi-Product Isolation (Scenario C specifically & general multi-product)
    if (scenario.expected.productCount !== undefined) {
      assert(
        'Expected number of distinct products identified',
        claimRes.products.length === scenario.expected.productCount,
        claimRes.products.length,
        scenario.expected.productCount
      );
    }

    if (scenario.expected.productVerdicts) {
      for (const pvExpected of scenario.expected.productVerdicts) {
        const matchingPv = finalRes.productVerdicts.find(
          (pv) =>
            (pvExpected.productId && pv.productId === pvExpected.productId) ||
            (pvExpected.productNameSnippet && pv.productName.toLowerCase().includes(pvExpected.productNameSnippet.toLowerCase()))
        );

        assert(
          `Product verdict exists for ${pvExpected.productNameSnippet || pvExpected.productId}`,
          Boolean(matchingPv),
          matchingPv ? matchingPv.productName : null,
          pvExpected.productNameSnippet || pvExpected.productId
        );

        if (matchingPv) {
          if (pvExpected.verdict) {
            assert(
              `Isolated product verdict for ${matchingPv.productName} is ${pvExpected.verdict}`,
              matchingPv.verdict === pvExpected.verdict,
              matchingPv.verdict,
              pvExpected.verdict
            );
          }
          if (pvExpected.hardGateState) {
            assert(
              `Isolated product hard gate for ${matchingPv.productName} is ${pvExpected.hardGateState}`,
              matchingPv.hardGateState === pvExpected.hardGateState,
              matchingPv.hardGateState,
              pvExpected.hardGateState
            );
          }
          if (pvExpected.maxConfirmedFailures !== undefined) {
            assert(
              `Isolated product ${matchingPv.productName} does not exceed max failures (${pvExpected.maxConfirmedFailures})`,
              matchingPv.failedHardCount <= pvExpected.maxConfirmedFailures,
              matchingPv.failedHardCount,
              `<= ${pvExpected.maxConfirmedFailures}`
            );
          }
        }
      }
    }

    // 11. Contradiction Invariant (Scenario D)
    if (scenario.id === 'scenario-d') {
      const contradictionDetected =
        rootCauseRes.records.some((r) => r.code === 'FAC-01') ||
        finalRes.verdictRationale.toLowerCase().includes('contradiction') ||
        verifRes.records.some((v) => Boolean(v.conflictDetected) || v.status === 'UNKNOWN');

      assert(
        'Internal factual contradiction detected and neither statement assumed true',
        contradictionDetected && finalRes.finalVerdict === 'INDETERMINATE',
        { contradictionDetected, verdict: finalRes.finalVerdict },
        { contradictionDetected: true, verdict: 'INDETERMINATE' }
      );
    }

    // =========================================================================
    // 12. HARDENED INVARIANT ASSERTIONS (CHECKPOINT 13A SPECIFICATION)
    // =========================================================================

    // A. Scenario B Invariants (UNKNOWN is NOT FAIL)
    if (scenario.id === 'scenario-b') {
      const p0 = finalRes.productVerdicts[0];
      const hardSummary = rubricRes.productsList[0]?.hardRequirementSummary;

      assert(
        'Scenario B: Hard requirements distribution is exactly 1 PASS, 0 FAIL, 3 UNKNOWN',
        p0.passedHardCount === 1 && p0.failedHardCount === 0 && p0.unknownHardCount === 3,
        { passed: p0.passedHardCount, failed: p0.failedHardCount, unknown: p0.unknownHardCount },
        { passed: 1, failed: 0, unknown: 3 },
        'Missing evidence remains UNKNOWN, never converted into failures'
      );

      assert(
        'Scenario B: Confirmed hard satisfaction percent is exactly 25%',
        p0.confirmedHardSatisfactionPercent === 25,
        p0.confirmedHardSatisfactionPercent,
        25
      );

      assert(
        'Scenario B: Hard failure rate is 0% and unknown rate is 75%',
        p0.failedHardCount === 0 && p0.unknownHardCount / p0.totalHardCount === 0.75,
        { failRate: p0.failedHardCount / p0.totalHardCount, unknownRate: p0.unknownHardCount / p0.totalHardCount },
        { failRate: 0, unknownRate: 0.75 }
      );

      assert(
        'Scenario B: Hard evaluated coverage is 25%',
        hardSummary?.hardEvaluatedCoverage === 25,
        hardSummary?.hardEvaluatedCoverage,
        25
      );

      assert(
        'Scenario B: Missing requirements (hiking, size 10, waterproof) remain UNKNOWN, never treated as FAIL',
        finalRes.requirementCoverage.unknownRequirements.length === 3 &&
          finalRes.requirementCoverage.confirmedFailed.length === 0,
        {
          unknownCount: finalRes.requirementCoverage.unknownRequirements.length,
          failedCount: finalRes.requirementCoverage.confirmedFailed.length,
        },
        { unknownCount: 3, failedCount: 0 }
      );
    }

    // B. Scenario A Invariants (Hard Gates Authoritative & UNVERIFIED is NOT FALSE)
    if (scenario.id === 'scenario-a') {
      const p0 = finalRes.productVerdicts[0];
      assert(
        'Scenario A: Price constraint failure produces authoritative HARD_GATE_FAIL without score override',
        p0.hardGateState === 'HARD_GATE_FAIL' && finalRes.finalVerdict === 'FAIL',
        { gate: p0.hardGateState, verdict: finalRes.finalVerdict },
        { gate: 'HARD_GATE_FAIL', verdict: 'FAIL' },
        'Hard gates are authoritative and cannot be overridden by score'
      );

      const unverifiedNonFailures = supportRes.records
        .filter((r) => r.externalTruthStatus === 'UNVERIFIED')
        .every((r) => !verifRes.records.some((v) => v.status === 'FAIL' && v.claimEvidence.includes(r.statement)));
      assert(
        'Scenario A: External claims (organic, lavender, hypoallergenic) not assumed false or failed',
        supportRes.records.some((r) => r.externalTruthStatus === 'UNVERIFIED') && unverifiedNonFailures,
        true,
        true,
        'UNVERIFIED is NOT FALSE'
      );
    }

    // C. Scenario C Invariants (Multi-Product Isolation & Diagnostics)
    if (scenario.id === 'scenario-c') {
      const p1 = finalRes.productVerdicts.find(
        (p) => p.productId === 'P1' || p.productName.toLowerCase().includes('trailair')
      );
      const p2 = finalRes.productVerdicts.find(
        (p) => p.productId === 'P2' || p.productName.toLowerCase().includes('mountainguard')
      );

      assert(
        'Scenario C: Multi-product isolation — TrailAir Shell has 0 hard failures',
        Boolean(p1 && p1.failedHardCount === 0),
        p1?.failedHardCount,
        0,
        'P1 must not inherit P2 failures'
      );

      assert(
        'Scenario C: Multi-product isolation — MountainGuard Parka fails summer intent (HARD_GATE_FAIL)',
        Boolean(p2 && p2.failedHardCount >= 1 && p2.hardGateState === 'HARD_GATE_FAIL'),
        { failedCount: p2?.failedHardCount, gate: p2?.hardGateState },
        { failedCount: '>= 1', gate: 'HARD_GATE_FAIL' }
      );

      assert(
        'Scenario C: Isolated product diagnostics and recommendations (P1 free from freezing defect)',
        Boolean(
          p1 &&
            !p1.rationale.toLowerCase().includes('freezing') &&
            !p1.remediationSummary.toLowerCase().includes('freezing')
        ),
        true,
        true,
        'Remediation and diagnostics are strictly product-isolated'
      );
    }

    // D. Scenario D Invariants (Contradiction Retention)
    if (scenario.id === 'scenario-d') {
      const hasFac01 = rootCauseRes.records.some((r) => r.code === 'FAC-01');
      const neitherAssumedTrue = verifRes.records.some((v) => Boolean(v.conflictDetected) || v.status === 'UNKNOWN');
      assert(
        'Scenario D: FAC-01 identified and neither conflicting claim arbitrarily assumed true/false',
        hasFac01 && neitherAssumedTrue && finalRes.finalVerdict === 'INDETERMINATE',
        { hasFac01, neitherAssumedTrue, verdict: finalRes.finalVerdict },
        { hasFac01: true, neitherAssumedTrue: true, verdict: 'INDETERMINATE' }
      );
    }

    // =========================================================================
    // 13. READABLE CLAIM STATEMENT ASSERTIONS (CHECKPOINT 11A / 13A)
    // =========================================================================
    const extractedClaimMap = buildExtractedClaimMap(claimRes.claims);
    const bareScalarPattern = /^\s*(\$)?(32|50|89|99|129|140|95|10|25|100|120|150)\s*$/i;

    const allReadableStatements = supportRes.records.map((r) => ({
      claimId: r.claimId,
      productName: r.productName,
      readable: formatReadableClaimStatement(r, extractedClaimMap),
      sourceEvidence: r.sourceEvidence,
      bareStatement: r.statement,
    }));

    const hasBareScalar = allReadableStatements.some((s) => bareScalarPattern.test(s.readable));
    assert(
      'All claim statements in report are independently readable (no bare scalars)',
      !hasBareScalar && allReadableStatements.length > 0,
      hasBareScalar ? 'Found bare scalar' : 'All statements descriptive',
      'No bare scalars'
    );

    const allHaveProductOrContext = allReadableStatements.every(
      (s) =>
        s.readable.length > 8 &&
        (s.productName ? s.readable.includes(s.productName) || s.readable.includes('Recommended product') : true)
    );
    assert(
      'Readable claims preserve product association and context',
      allHaveProductOrContext,
      allHaveProductOrContext,
      true
    );

    const allPreserveSourceEvidence = supportRes.records.every(
      (r) => typeof r.sourceEvidence === 'string' && r.sourceEvidence.trim().length > 0
    );
    assert(
      'Readable claims preserve sourceEvidence from LLM output',
      allPreserveSourceEvidence,
      allPreserveSourceEvidence,
      true
    );

    // Specific scenario claims verification
    if (scenario.id === 'scenario-a') {
      const priceClaim = allReadableStatements.find(
        (s) => s.bareStatement === '32' || s.sourceEvidence.includes('32')
      );
      const spfClaim = allReadableStatements.find(
        (s) => s.bareStatement === '50' || s.sourceEvidence.includes('50')
      );
      const lavenderClaim = allReadableStatements.find((s) => s.sourceEvidence.includes('lavender'));
      const hypoClaim = allReadableStatements.find((s) => s.sourceEvidence.includes('hypoallergenic'));

      assert(
        'Scenario A: Price claim formatted with product and currency (e.g. "Luxury Botanical Sunscreen — price: $32")',
        Boolean(
          priceClaim &&
            priceClaim.readable.includes('$32') &&
            priceClaim.readable.includes('price') &&
            !bareScalarPattern.test(priceClaim.readable)
        ),
        priceClaim?.readable,
        'Contains "$32", "price", not bare "32"'
      );

      assert(
        'Scenario A: SPF claim formatted with product and SPF rating (e.g. "Luxury Botanical Sunscreen — SPF rating: 50")',
        Boolean(
          spfClaim &&
            /spf/i.test(spfClaim.readable) &&
            spfClaim.readable.includes('50') &&
            !bareScalarPattern.test(spfClaim.readable)
        ),
        spfClaim?.readable,
        'Contains "SPF", "50", not bare "50"'
      );

      assert(
        'Scenario A: Lavender ingredient claim formatted with composition context',
        Boolean(
          lavenderClaim &&
            lavenderClaim.readable.includes('lavender essential oil') &&
            lavenderClaim.readable.includes('Luxury Botanical Sunscreen')
        ),
        lavenderClaim?.readable,
        'Contains "lavender essential oil" and product'
      );

      assert(
        'Scenario A: Hypoallergenic claim formatted with safety/sensitivity context',
        Boolean(hypoClaim && hypoClaim.readable.includes('hypoallergenic')),
        hypoClaim?.readable,
        'Contains "hypoallergenic"'
      );
    }

    if (scenario.id === 'scenario-b') {
      const priceClaim = allReadableStatements.find(
        (s) => s.bareStatement === '129' || s.sourceEvidence.includes('129')
      );
      assert(
        'Scenario B: Summit Trek Boots price formatted meaningfully ($129)',
        Boolean(
          priceClaim &&
            priceClaim.readable.includes('$129') &&
            priceClaim.readable.includes('Summit Trek Boots') &&
            !bareScalarPattern.test(priceClaim.readable)
        ),
        priceClaim?.readable,
        'Contains "$129" and "Summit Trek Boots", not bare "129"'
      );
    }

    if (scenario.id === 'scenario-d') {
      const waterAffirm = allReadableStatements.find(
        (s) => s.claimId === 'CL2' || (s.readable.includes('waterproof') && !s.readable.includes('not waterproof'))
      );
      const waterNegate = allReadableStatements.find(
        (s) => s.claimId === 'CL3' || s.readable.includes('not waterproof') || s.sourceEvidence.includes('not waterproof')
      );

      assert(
        'Scenario D: StormShell Jacket contradictory waterproof claims formatted with full statements',
        Boolean(
          waterAffirm &&
            waterNegate &&
            waterAffirm.readable.includes('StormShell Jacket') &&
            waterNegate.readable.includes('StormShell Jacket')
        ),
        { affirm: waterAffirm?.readable, negate: waterNegate?.readable },
        'Both contradictory claims formatted with product association'
      );
    }

    if (scenario.id === 'scenario-e') {
      const priceClaim = allReadableStatements.find(
        (s) => s.bareStatement === '89' || s.sourceEvidence.includes('89')
      );
      const waterClaim = allReadableStatements.find((s) => s.sourceEvidence.includes('waterproof'));

      assert(
        'Scenario E: RainShield Jacket price formatted meaningfully ($89)',
        Boolean(
          priceClaim &&
            priceClaim.readable.includes('$89') &&
            priceClaim.readable.includes('RainShield Jacket') &&
            !bareScalarPattern.test(priceClaim.readable)
        ),
        priceClaim?.readable,
        'Contains "$89" and "RainShield Jacket", not bare "89"'
      );

      assert(
        'Scenario E: RainShield Jacket waterproof claim formatted with product association',
        Boolean(waterClaim && waterClaim.readable.includes('waterproof') && waterClaim.readable.includes('RainShield Jacket')),
        waterClaim?.readable,
        'Contains "waterproof" and "RainShield Jacket"'
      );
    }

    if (scenario.id === 'scenario-f') {
      const leatherClaim = allReadableStatements.find((s) => s.sourceEvidence.includes('leather'));
      assert(
        'Scenario F: RoadMaster 5 genuine leather claim formatted with product association',
        Boolean(leatherClaim && leatherClaim.readable.includes('leather') && leatherClaim.readable.includes('RoadMaster 5')),
        leatherClaim?.readable,
        'Contains "leather" and "RoadMaster 5"'
      );
    }

    // =========================================================================
    // 14. EXPORT COVERAGE (JSON & MARKDOWN AUDIT SPECIFICATION)
    // =========================================================================
    const exportParams: ReportExportDataParams = {
      inputs: { userPrompt: scenario.userPrompt, llmOutput: scenario.llmOutput },
      promptAnalysis: promptRes,
      claimAnalysis: claimRes,
      verificationResult: verifRes,
      rubricResult: rubricRes,
      claimSupportResult: supportRes,
      rootCauseResult: rootCauseRes,
      severityAndScoringResult: severityRes,
      recommendationResult: recRes,
      finalEvaluationResult: finalRes,
    };

    const jsonPayload = buildExportJsonPayload(exportParams);
    const mdReport = buildExportMarkdownReport(exportParams);

    const hasValidJsonStructure =
      Boolean(jsonPayload.reportId?.startsWith('EV-RPT-')) &&
      jsonPayload.metadata?.checkpoint?.includes('11A') &&
      jsonPayload.metadata?.evaluatorVersion === '1.0.0-auditable' &&
      jsonPayload.metadata?.inputContract === 'EXACTLY_TWO_INPUTS' &&
      jsonPayload.metadata?.externalTruthVerificationConducted === false &&
      jsonPayload.inputs?.userPrompt === scenario.userPrompt &&
      jsonPayload.inputs?.llmOutput === scenario.llmOutput &&
      jsonPayload.finalVerdict === finalRes.finalVerdict &&
      typeof jsonPayload.verdictRationale === 'string' &&
      Array.isArray(jsonPayload.productVerdicts) &&
      Array.isArray(jsonPayload.claimSupportAudit) &&
      Boolean(jsonPayload.rawUpstreamArtifacts?.promptAnalysis) &&
      Boolean(jsonPayload.rawUpstreamArtifacts?.claimAnalysis) &&
      Boolean(jsonPayload.rawUpstreamArtifacts?.verificationResult) &&
      Boolean(jsonPayload.rawUpstreamArtifacts?.rubricResult) &&
      Boolean(jsonPayload.rawUpstreamArtifacts?.claimSupportResult) &&
      Boolean(jsonPayload.rawUpstreamArtifacts?.rootCauseResult) &&
      Boolean(jsonPayload.rawUpstreamArtifacts?.severityAndScoringResult) &&
      Boolean(jsonPayload.rawUpstreamArtifacts?.recommendationResult);

    assert(
      'JSON export payload conforms to audit schema and includes all artifacts',
      hasValidJsonStructure,
      hasValidJsonStructure,
      true
    );

    const jsonClaimsHaveReadableStatements = jsonPayload.claimSupportAudit.every(
      (c) => Boolean(c.readableClaimStatement && !bareScalarPattern.test(c.readableClaimStatement))
    );
    assert(
      'JSON claimSupportAudit contains independently readable claim statements',
      jsonClaimsHaveReadableStatements && jsonPayload.claimSupportAudit.length > 0,
      jsonClaimsHaveReadableStatements,
      true
    );

    const hasValidMdSections =
      mdReport.includes('# AI Shopping Assistant Evaluation Report') &&
      mdReport.includes('**Report ID:**') &&
      mdReport.includes('Checkpoint 11A') &&
      mdReport.includes(`## OVERALL VERDICT: ${finalRes.finalVerdict}`) &&
      mdReport.includes('## 1. ORIGINAL EVALUATION INPUTS') &&
      mdReport.includes('## 2. PRODUCT-LEVEL EVALUATIONS') &&
      mdReport.includes('## 3. REQUIREMENT COVERAGE SUMMARY') &&
      mdReport.includes('## 4. CLAIM SUPPORT & TRUTH CONTEXT') &&
      mdReport.includes('## 5. ROOT-CAUSE FINDINGS') &&
      mdReport.includes('## 6. ACTIONABLE RECOMMENDATIONS') &&
      mdReport.includes('## 7. INVARIANTS & AUDIT LIMITATIONS') &&
      mdReport.includes('UNKNOWN ≠ FAIL') &&
      mdReport.includes('UNVERIFIED ≠ FALSE');

    assert(
      'Markdown export generates complete 7-section auditable report',
      hasValidMdSections,
      hasValidMdSections,
      true
    );

    const durationMs = Date.now() - startTime;
    const allPassed = assertions.every((a) => a.passed);

    return {
      scenario,
      passed: allPassed,
      durationMs,
      assertions,
      pipelineOutputs: {
        promptRes,
        claimRes,
        verifRes,
        rubricRes,
        supportRes,
        rootCauseRes,
        severityRes,
        recRes,
        finalRes,
      },
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      scenario,
      passed: false,
      durationMs,
      assertions,
      error: err.message || String(err),
    };
  }
}

/**
 * Run the entire regression suite covering all scenarios A–F.
 */
export async function runRegressionSuite(): Promise<RegressionSuiteResult> {
  const startTime = Date.now();
  const scenarioResults: ScenarioTestResult[] = [];

  for (const scenario of REGRESSION_SCENARIOS) {
    const res = await runSingleScenarioTest(scenario);
    scenarioResults.push(res);
  }

  const durationMs = Date.now() - startTime;
  const passedScenarios = scenarioResults.filter((r) => r.passed).length;
  const failedScenarios = scenarioResults.filter((r) => !r.passed).length;

  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;

  for (const sr of scenarioResults) {
    totalAssertions += sr.assertions.length;
    passedAssertions += sr.assertions.filter((a) => a.passed).length;
    failedAssertions += sr.assertions.filter((a) => !a.passed).length;
  }

  return {
    totalScenarios: REGRESSION_SCENARIOS.length,
    passedScenarios,
    failedScenarios,
    totalAssertions,
    passedAssertions,
    failedAssertions,
    durationMs,
    timestamp: new Date().toISOString(),
    scenarioResults,
  };
}
