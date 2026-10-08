/**
 * Checkpoint 14B: Professional Human-Readable Evaluation Report Test Suite
 *
 * Verifies:
 * 1. Professional report generation from structured evaluation artifacts
 * 2. Natural language QA analyst voice, without raw internal codes (HC-01, INT-01, DAT-01, HARD_GATE_FAIL)
 * 3. Exact verdict and severity alignment with authoritative evaluation
 * 4. Product-specific isolation in prose (no cross-contamination)
 * 5. Clean plain-text formatting (no markdown header # or bold ** markup)
 * 6. Appropriate handling of uncertainty (UNKNOWN is not FAIL) and unverified factual claims
 * 7. Preservation of existing exports (JSON and Technical Markdown)
 */

import { REGRESSION_SCENARIOS } from '../src/fixtures/regressionScenarios';
import { runSingleScenarioTest } from '../src/services/evaluation/regressionRunner';
import {
  buildProfessionalEvaluationReport,
  buildExportMarkdownReport,
  buildExportJsonPayload,
} from '../src/services/evaluation/reportExportHelper';

async function runCheckpoint14BTests() {
  console.log('\n================================================================');
  console.log(' CHECKPOINT 14B: PROFESSIONAL EVALUATION REPORT VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}`);
      if (details) console.log(`     Error: ${details}`);
      failed++;
    }
  }

  // Evaluate all 6 regression scenarios
  const scenarioResults: Record<string, any> = {};

  for (const sc of REGRESSION_SCENARIOS) {
    const res = await runSingleScenarioTest(sc);
    if (!res.passed || !res.pipelineOutputs) {
      throw new Error(`Scenario ${sc.key} failed during pipeline execution.`);
    }
    scenarioResults[sc.key] = res;
  }

  console.log('--- 1. Authoritative Verdict & Severity Alignment Across Scenarios ---');

  for (const sc of REGRESSION_SCENARIOS) {
    const pipelineOut = scenarioResults[sc.key].pipelineOutputs;
    const profReport = buildProfessionalEvaluationReport({
      inputs: { userPrompt: sc.userPrompt, llmOutput: sc.llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    assert(
      `Scenario ${sc.key}: Overall verdict (${profReport.overallVerdict}) matches authoritative verdict (${pipelineOut.finalRes.finalVerdict})`,
      profReport.overallVerdict === pipelineOut.finalRes.finalVerdict
    );

    assert(
      `Scenario ${sc.key}: Overall severity (${profReport.overallSeverity}) matches authoritative severity (${pipelineOut.finalRes.summary.overallSeverity})`,
      profReport.overallSeverity === pipelineOut.finalRes.summary.overallSeverity
    );
  }

  console.log('\n--- 2. Natural-Language QA Voice & Absence of Internal Codes ---');

  for (const sc of REGRESSION_SCENARIOS) {
    const pipelineOut = scenarioResults[sc.key].pipelineOutputs;
    const profReport = buildProfessionalEvaluationReport({
      inputs: { userPrompt: sc.userPrompt, llmOutput: sc.llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    const plain = profReport.plainText;

    // Must NOT contain internal codes like HC-01, DAT-01, HARD_GATE_FAIL, CL1
    const containsInternalCodes = /\b(HC-\d+|DAT-\d+|SAF-\d+|RET-\d+|INT-\d+|FAC-\d+|NC-\d+|HARD_GATE_FAIL|HARD_GATE_PASS)\b/.test(plain);
    assert(
      `Scenario ${sc.key}: Report plain text contains no internal diagnostic codes`,
      !containsInternalCodes,
      `Found internal codes in plain text: ${plain.match(/\b(HC-\d+|DAT-\d+|SAF-\d+|RET-\d+|INT-\d+|FAC-\d+|NC-\d+|HARD_GATE_FAIL|HARD_GATE_PASS)\b/g)?.join(', ')}`
    );

    // Must NOT contain markdown headings (# or ##) or bold markdown (**text**)
    const containsMarkdownMarkup = /^#{1,6}\s|\*\*[^*]+\*\*/m.test(plain);
    assert(
      `Scenario ${sc.key}: Report plain text contains no Markdown syntax (# or **)`,
      !containsMarkdownMarkup
    );

    // Required sections
    assert(
      `Scenario ${sc.key}: Report contains all standard professional QA sections`,
      plain.includes('SHOPPING ASSISTANT RESPONSE EVALUATION') &&
      plain.includes('OVERALL ASSESSMENT') &&
      plain.includes('KEY FINDINGS') &&
      plain.includes('PRODUCT-SPECIFIC ASSESSMENTS') &&
      plain.includes('RECOMMENDED CORRECTIVE ACTIONS') &&
      plain.includes('FINAL CONCLUSION') &&
      plain.includes('ASSESSMENT LIMITATIONS')
    );
  }

  console.log('\n--- 3. Scenario-Specific Quality Invariants ---');

  // Scenario A: Hard Fail (Price Ceiling $32 vs $25)
  {
    const pipelineOut = scenarioResults['A'].pipelineOutputs;
    const profReport = buildProfessionalEvaluationReport({
      inputs: { userPrompt: REGRESSION_SCENARIOS[0].userPrompt, llmOutput: REGRESSION_SCENARIOS[0].llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    assert(
      'Scenario A: Professional report reflects price ceiling violation',
      profReport.findings.some(f => f.toLowerCase().includes('violated') && (f.includes('25') || f.includes('price')))
    );
    assert(
      'Scenario A: Final conclusion states response requires revision/fails requirements',
      profReport.conclusion.toLowerCase().includes('revision') || profReport.conclusion.toLowerCase().includes('fails')
    );
  }

  // Scenario B: Missing Evidence (UNKNOWN != FAIL)
  {
    const pipelineOut = scenarioResults['B'].pipelineOutputs;
    const profReport = buildProfessionalEvaluationReport({
      inputs: { userPrompt: REGRESSION_SCENARIOS[1].userPrompt, llmOutput: REGRESSION_SCENARIOS[1].llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    assert(
      'Scenario B: Professional report notes unaddressed customer criteria without calling them defects',
      profReport.findings.some(f => f.includes('Unaddressed') || f.includes('unconfirmed'))
    );
    assert(
      'Scenario B: Product assessment for Summit Trek Boots notes unconfirmed criteria',
      profReport.productAssessments[0].narrative.toLowerCase().includes('cannot be definitively verified') ||
      profReport.productAssessments[0].uncertainties.length > 0
    );
    assert(
      'Scenario B: Overall verdict is INDETERMINATE, not FAIL',
      profReport.overallVerdict === 'INDETERMINATE'
    );
  }

  // Scenario C: Multi-Product Isolation (TrailAir vs MountainGuard)
  {
    const pipelineOut = scenarioResults['C'].pipelineOutputs;
    const profReport = buildProfessionalEvaluationReport({
      inputs: { userPrompt: REGRESSION_SCENARIOS[2].userPrompt, llmOutput: REGRESSION_SCENARIOS[2].llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    assert(
      'Scenario C: Exactly 2 product assessments generated',
      profReport.productAssessments.length === 2
    );

    const trailAir = profReport.productAssessments.find(p => p.productName.includes('TrailAir'));
    const mtnGuard = profReport.productAssessments.find(p => p.productName.includes('MountainGuard'));

    assert(
      'Scenario C: TrailAir Shell is evaluated separately with 0 violations',
      !!trailAir && trailAir.violations.length === 0
    );
    assert(
      'Scenario C: MountainGuard Parka verdict is FAIL',
      !!mtnGuard && mtnGuard.verdict === 'FAIL'
    );
    assert(
      'Scenario C: Product findings do not leak across products',
      !!trailAir && !trailAir.narrative.includes('freezing') && !trailAir.narrative.includes('insulated')
    );
  }

  // Scenario D: Internal Contradiction (StormShell waterproof)
  {
    const pipelineOut = scenarioResults['D'].pipelineOutputs;
    const profReport = buildProfessionalEvaluationReport({
      inputs: { userPrompt: REGRESSION_SCENARIOS[3].userPrompt, llmOutput: REGRESSION_SCENARIOS[3].llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    assert(
      'Scenario D: Notes internal inconsistency in findings',
      profReport.findings.some(f => f.toLowerCase().includes('inconsistency') || f.toLowerCase().includes('conflicting'))
    );
    assert(
      'Scenario D: Overall verdict is INDETERMINATE',
      profReport.overallVerdict === 'INDETERMINATE'
    );
  }

  // Scenario E: Clean Requirement Satisfaction (RainShield Jacket)
  {
    const pipelineOut = scenarioResults['E'].pipelineOutputs;
    const profReport = buildProfessionalEvaluationReport({
      inputs: { userPrompt: REGRESSION_SCENARIOS[4].userPrompt, llmOutput: REGRESSION_SCENARIOS[4].llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    assert(
      'Scenario E: Overall verdict is PASS and approved in conclusion',
      profReport.overallVerdict === 'PASS' && profReport.conclusion.toLowerCase().includes('approved')
    );
    assert(
      'Scenario E: Product assessment reflects full satisfaction',
      profReport.productAssessments[0].verdict === 'PASS' && profReport.productAssessments[0].violations.length === 0
    );
  }

  // Scenario F: Negative Exclusion Violation (RoadMaster leather)
  {
    const pipelineOut = scenarioResults['F'].pipelineOutputs;
    const profReport = buildProfessionalEvaluationReport({
      inputs: { userPrompt: REGRESSION_SCENARIOS[5].userPrompt, llmOutput: REGRESSION_SCENARIOS[5].llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    assert(
      'Scenario F: Overall verdict is FAIL',
      profReport.overallVerdict === 'FAIL'
    );
    assert(
      'Scenario F: Product assessment documents negative exclusion violation',
      profReport.productAssessments[0].violations.some(v => v.toLowerCase().includes('leather') || v.toLowerCase().includes('no leather'))
    );
  }

  console.log('\n--- 4. Coexistence with Technical Exports ---');

  for (const sc of REGRESSION_SCENARIOS) {
    const pipelineOut = scenarioResults[sc.key].pipelineOutputs;
    const jsonPayload = buildExportJsonPayload({
      inputs: { userPrompt: sc.userPrompt, llmOutput: sc.llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    const mdReport = buildExportMarkdownReport({
      inputs: { userPrompt: sc.userPrompt, llmOutput: sc.llmOutput },
      promptAnalysis: pipelineOut.promptRes,
      claimAnalysis: pipelineOut.claimRes,
      verificationResult: pipelineOut.verifRes,
      rubricResult: pipelineOut.rubricRes,
      claimSupportResult: pipelineOut.supportRes,
      rootCauseResult: pipelineOut.rootCauseRes,
      severityAndScoringResult: pipelineOut.severityRes,
      recommendationResult: pipelineOut.recRes,
      finalEvaluationResult: pipelineOut.finalRes,
    });

    assert(
      `Scenario ${sc.key}: JSON export remains intact with full audit schema`,
      jsonPayload.finalVerdict === pipelineOut.finalRes.finalVerdict &&
      jsonPayload.claimSupportAudit.length > 0 &&
      typeof jsonPayload.rawUpstreamArtifacts === 'object'
    );

    assert(
      `Scenario ${sc.key}: Markdown technical export remains intact with all 7 sections`,
      mdReport.includes('## OVERALL VERDICT:') &&
      mdReport.includes('## 1. ORIGINAL EVALUATION INPUTS') &&
      mdReport.includes('## 7. INVARIANTS & AUDIT LIMITATIONS')
    );
  }

  console.log('\n================================================================');
  console.log(` CHECKPOINT 14B TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCheckpoint14BTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
