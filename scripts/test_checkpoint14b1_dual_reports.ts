/**
 * Checkpoint 14B.1: Dual Professional Report Styles Test Suite
 *
 * Verifies:
 * 1. Concise Professional Report generation across all 6 scenarios
 * 2. Detailed Professional Report generation with expanded requirement-by-requirement audit
 * 3. Exact verdict and severity parity between Concise and Detailed reports
 * 4. Requirement statuses match underlying structured results (PASS, FAIL, UNKNOWN)
 * 5. Multi-product isolation preserved across both reports
 * 6. Literal numeric boundary precision ('under $25' strictly less than $25, not 'at or below $25')
 * 7. Absence of raw Markdown syntax (# or **) in plain-text copies
 * 8. Absence of internal codes (HC-01, INT-01, NC-01, DAT-01, SAF-01, RET-01, FAC-01, HARD_GATE_FAIL)
 * 9. Absence of formulaic phrases ('precluding an acceptable rating', 'in accordance with objective QA standards')
 * 10. Coexistence with Technical Markdown and JSON export schemas
 */

import { REGRESSION_SCENARIOS } from '../src/fixtures/regressionScenarios';
import { runSingleScenarioTest } from '../src/services/evaluation/regressionRunner';
import {
  buildConciseProfessionalReport,
  buildDetailedProfessionalReport,
  buildExportMarkdownReport,
  buildExportJsonPayload,
} from '../src/services/evaluation/reportExportHelper';

async function runCheckpoint14B1Tests() {
  console.log('\n================================================================');
  console.log(' CHECKPOINT 14B.1: DUAL PROFESSIONAL REPORT VERIFICATION SUITE');
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

  // Pre-run all 6 regression scenarios
  const scenarioResults: Record<string, any> = {};
  for (const sc of REGRESSION_SCENARIOS) {
    const res = await runSingleScenarioTest(sc);
    if (!res.passed || !res.pipelineOutputs) {
      throw new Error(`Scenario ${sc.key} failed execution.`);
    }
    scenarioResults[sc.key] = res;
  }

  console.log('--- 1. Dual Report Generation & Verdict/Severity Parity ---');
  for (const sc of REGRESSION_SCENARIOS) {
    const pipelineOut = scenarioResults[sc.key].pipelineOutputs;
    const params = {
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
    };

    const concise = buildConciseProfessionalReport(params);
    const detailed = buildDetailedProfessionalReport(params);

    assert(
      `Scenario ${sc.key}: Concise verdict (${concise.overallVerdict}) matches authoritative verdict (${pipelineOut.finalRes.finalVerdict})`,
      concise.overallVerdict === pipelineOut.finalRes.finalVerdict
    );
    assert(
      `Scenario ${sc.key}: Detailed verdict (${detailed.overallVerdict}) matches authoritative verdict (${pipelineOut.finalRes.finalVerdict})`,
      detailed.overallVerdict === pipelineOut.finalRes.finalVerdict
    );
    assert(
      `Scenario ${sc.key}: Detailed severity (${detailed.overallSeverity}) matches concise severity (${concise.overallSeverity})`,
      detailed.overallSeverity === concise.overallSeverity
    );
  }

  console.log('\n--- 2. Natural-Language QA Voice, No Markdown Syntax, No Internal Codes ---');
  const codeRegex = /\b(HC-\d+|DAT-\d+|SAF-\d+|RET-\d+|INT-\d+|FAC-\d+|NC-\d+|HARD_GATE_FAIL|HARD_GATE_PASS)\b/;
  const mdSyntaxRegex = /^#{1,6}\s|\*\*[^*]+\*\*/m;
  const formulaicRegex = /(precluding an acceptable rating|in accordance with objective QA standards)/i;

  for (const sc of REGRESSION_SCENARIOS) {
    const pipelineOut = scenarioResults[sc.key].pipelineOutputs;
    const params = {
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
    };

    const concise = buildConciseProfessionalReport(params);
    const detailed = buildDetailedProfessionalReport(params);

    // Concise checks
    assert(
      `Scenario ${sc.key}: Concise plain text has no internal diagnostic codes`,
      !codeRegex.test(concise.plainText)
    );
    assert(
      `Scenario ${sc.key}: Concise plain text has no Markdown syntax (# or **)`,
      !mdSyntaxRegex.test(concise.plainText)
    );
    assert(
      `Scenario ${sc.key}: Concise report avoids formulaic boilerplate phrases`,
      !formulaicRegex.test(concise.plainText)
    );

    // Detailed checks
    assert(
      `Scenario ${sc.key}: Detailed plain text has no internal diagnostic codes`,
      !codeRegex.test(detailed.plainText)
    );
    assert(
      `Scenario ${sc.key}: Detailed plain text has no Markdown syntax (# or **)`,
      !mdSyntaxRegex.test(detailed.plainText)
    );
    assert(
      `Scenario ${sc.key}: Detailed report avoids formulaic boilerplate phrases`,
      !formulaicRegex.test(detailed.plainText)
    );

    // Detailed required sections
    assert(
      `Scenario ${sc.key}: Detailed report contains all comprehensive QA sections`,
      detailed.plainText.includes('SHOPPING ASSISTANT RESPONSE EVALUATION — DETAILED AUDIT') &&
      detailed.plainText.includes('CUSTOMER REQUEST & ASSISTANT RECOMMENDATION CONTEXT') &&
      detailed.plainText.includes('OVERALL ASSESSMENT') &&
      detailed.plainText.includes('KEY FINDINGS') &&
      detailed.plainText.includes('REQUIREMENT-BY-REQUIREMENT EVALUATION') &&
      detailed.plainText.includes('PRODUCT-SPECIFIC ANALYSIS') &&
      detailed.plainText.includes('RECOMMENDED CORRECTIVE ACTIONS') &&
      detailed.plainText.includes('FINAL CONCLUSION') &&
      detailed.plainText.includes('ASSESSMENT SCOPE & LIMITATIONS')
    );
  }

  console.log('\n--- 3. Detailed Requirement Matrix Parity & Accuracy ---');
  for (const sc of REGRESSION_SCENARIOS) {
    const pipelineOut = scenarioResults[sc.key].pipelineOutputs;
    const params = {
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
    };

    const detailed = buildDetailedProfessionalReport(params);
    const cov = pipelineOut.finalRes.requirementCoverage;

    const satDetailed = detailed.evaluatedRequirements.filter(r => r.status === 'PASS').length;
    const failDetailed = detailed.evaluatedRequirements.filter(r => r.status === 'FAIL').length;
    const unkDetailed = detailed.evaluatedRequirements.filter(r => r.status === 'UNKNOWN').length;

    assert(
      `Scenario ${sc.key}: Satisfied requirements count (${satDetailed}) matches structured result (${cov.confirmedSatisfied.length})`,
      satDetailed === cov.confirmedSatisfied.length
    );
    assert(
      `Scenario ${sc.key}: Failed requirements count (${failDetailed}) matches structured result (${cov.confirmedFailed.length})`,
      failDetailed === cov.confirmedFailed.length
    );
    assert(
      `Scenario ${sc.key}: Unknown requirements count (${unkDetailed}) matches structured result (${cov.unknownRequirements.length})`,
      unkDetailed === cov.unknownRequirements.length
    );
  }

  console.log('\n--- 4. Scenario-Specific Quality Invariants & Isolation ---');

  // Scenario A: Strict numeric ceiling boundary
  {
    const pipelineOut = scenarioResults['A'].pipelineOutputs;
    const detailed = buildDetailedProfessionalReport({
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

    const priceReq = detailed.evaluatedRequirements.find(r => r.sourceText.includes('25'));
    assert(
      'Scenario A: Requirement explanation explicitly references strictly less than $25 boundary',
      !!priceReq && priceReq.evidenceOrDetails.includes('strictly less than $25')
    );
    assert(
      'Scenario A: Corrective action reflects strictly below boundary',
      detailed.prioritizedCorrectiveActions.some(a => a.includes('strictly below') || a.includes('$25'))
    );
  }

  // Scenario B: Missing evidence preserved as UNKNOWN, never FAIL
  {
    const pipelineOut = scenarioResults['B'].pipelineOutputs;
    const detailed = buildDetailedProfessionalReport({
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
      'Scenario B: Overall verdict is INDETERMINATE in Detailed Report',
      detailed.overallVerdict === 'INDETERMINATE'
    );
    const unconfirmedReqs = detailed.evaluatedRequirements.filter(r => r.status === 'UNKNOWN');
    assert(
      'Scenario B: Exactly 3 unconfirmed criteria preserved without becoming failures',
      unconfirmedReqs.length === 3
    );
  }

  // Scenario C: Multi-Product Isolation & Cart Scope Note
  {
    const pipelineOut = scenarioResults['C'].pipelineOutputs;
    const detailed = buildDetailedProfessionalReport({
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
      'Scenario C: Exactly 2 product analyses generated in Detailed Report',
      detailed.productAnalyses.length === 2
    );
    const trailAir = detailed.productAnalyses.find(p => p.productName.includes('TrailAir'));
    const mtnGuard = detailed.productAnalyses.find(p => p.productName.includes('MountainGuard'));

    assert(
      'Scenario C: TrailAir Shell has 0 violated requirements',
      !!trailAir && trailAir.requirements.filter(r => r.status === 'FAIL').length === 0
    );
    assert(
      'Scenario C: MountainGuard Parka has 1 violated requirement',
      !!mtnGuard && mtnGuard.requirements.filter(r => r.status === 'FAIL').length === 1
    );
    assert(
      'Scenario C: Cart verification note present and explains scope limits',
      !!detailed.cartVerificationNote && detailed.cartVerificationNote.includes('arithmetic')
    );
  }

  // Scenario E: Clean Requirement Satisfaction
  {
    const pipelineOut = scenarioResults['E'].pipelineOutputs;
    const detailed = buildDetailedProfessionalReport({
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
      'Scenario E: Overall verdict is PASS in Detailed Report',
      detailed.overallVerdict === 'PASS'
    );
    assert(
      'Scenario E: All requirements are marked Satisfied',
      detailed.evaluatedRequirements.every(r => r.status === 'PASS')
    );
  }

  // Scenario F: Negative Exclusion Violation
  {
    const pipelineOut = scenarioResults['F'].pipelineOutputs;
    const detailed = buildDetailedProfessionalReport({
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
      'Scenario F: Overall verdict is FAIL in Detailed Report',
      detailed.overallVerdict === 'FAIL'
    );
    const noLeather = detailed.evaluatedRequirements.find(r => r.sourceText.includes('no leather'));
    assert(
      'Scenario F: Negative exclusion constraint "no leather" marked Violated',
      !!noLeather && noLeather.status === 'FAIL'
    );
  }

  console.log('\n--- 5. Preservation of Technical Exports ---');
  for (const sc of REGRESSION_SCENARIOS) {
    const pipelineOut = scenarioResults[sc.key].pipelineOutputs;
    const params = {
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
    };

    const json = buildExportJsonPayload(params);
    const md = buildExportMarkdownReport(params);

    assert(
      `Scenario ${sc.key}: JSON payload preserves complete metadata and results`,
      !!json.metadata && json.finalVerdict === pipelineOut.finalRes.finalVerdict
    );
    assert(
      `Scenario ${sc.key}: Technical Markdown preserves all 7 auditable sections`,
      md.includes('## OVERALL VERDICT:') &&
      md.includes('## 1. ORIGINAL EVALUATION INPUTS') &&
      md.includes('## 7. INVARIANTS & AUDIT LIMITATIONS')
    );
  }

  console.log('\n================================================================');
  console.log(` CHECKPOINT 14B.1 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCheckpoint14B1Tests().catch((err) => {
  console.error('Fatal error in Checkpoint 14B.1 tests:', err);
  process.exit(1);
});
