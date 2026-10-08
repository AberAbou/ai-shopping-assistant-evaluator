import { analyzeUserPrompt } from '../src/services/evaluation/promptAnalysisService';
import { analyzeLlmOutput } from '../src/services/evaluation/claimAnalysisService';
import { runConstraintVerification } from '../src/services/evaluation/verificationService';
import { runRubricEvaluation } from '../src/services/evaluation/rubricService';
import { runClaimSupportAnalysis } from '../src/services/evaluation/claimSupportService';
import { runRootCauseAnalysis } from '../src/services/evaluation/rootCauseService';
import { runSeverityAndScoringAnalysis } from '../src/services/evaluation/severityScoringService';
import { runRecommendationAnalysis } from '../src/services/evaluation/recommendationService';
import { runFinalEvaluationAnalysis } from '../src/services/evaluation/finalVerdictService';

async function runPipeline(userPrompt: string, llmOutput: string) {
  const promptRes = await analyzeUserPrompt(userPrompt);
  const claimRes = await analyzeLlmOutput(llmOutput);
  if (!claimRes) throw new Error('Claim extraction failed');

  const verifRes = await runConstraintVerification(promptRes.constraints, claimRes.products, claimRes.claims);
  const rubricRes = await runRubricEvaluation(promptRes.constraints, claimRes.products, verifRes);
  const supportRes = await runClaimSupportAnalysis(claimRes.claims, claimRes.products, llmOutput);
  const rootCauseRes = await runRootCauseAnalysis(promptRes, claimRes, verifRes, rubricRes, supportRes, userPrompt, llmOutput);
  const severityRes = await runSeverityAndScoringAnalysis(promptRes, claimRes, verifRes, rubricRes, supportRes, rootCauseRes);
  const recRes = await runRecommendationAnalysis(promptRes, claimRes, verifRes, rubricRes, supportRes, rootCauseRes, severityRes);
  const finalRes = await runFinalEvaluationAnalysis(promptRes, claimRes, verifRes, rubricRes, supportRes, rootCauseRes, severityRes, recRes, userPrompt, llmOutput);

  return { promptRes, claimRes, verifRes, rubricRes, supportRes, rootCauseRes, severityRes, recRes, finalRes };
}

async function runAllTests() {
  console.log('====================================================');
  console.log('CHECKPOINT 10 REGRESSION & VERIFICATION SUITE');
  console.log('====================================================\n');

  // TEST A
  console.log('--- TEST A: HARD FAIL ---');
  const testA = await runPipeline(
    'fragrance-free organic sunscreen suitable for sensitive skin under $25',
    'I recommend Luxury Botanical Sunscreen SPF 50 for $32. It contains lavender essential oil and is 100% hypoallergenic.'
  );
  console.log('Test A Final Verdict:', testA.finalRes.finalVerdict);
  console.log('Test A Hard Gate Distribution:', testA.finalRes.summary.hardGateDistribution);
  console.log('Test A Confirmed Failures:', testA.finalRes.summary.totalConfirmedFailures);
  console.log('Test A Unresolved Unknown:', testA.finalRes.summary.totalUnresolvedUnknown);
  console.log('Test A Overall Severity:', testA.finalRes.summary.overallSeverity);
  console.log('Test A Critical Recs Count:', testA.recRes.recommendations.filter(r => r.priority === 'CRITICAL').length);
  console.log('Test A Rationale:', testA.finalRes.verdictRationale);
  if (testA.finalRes.finalVerdict !== 'FAIL') throw new Error('Test A expected FAIL');
  if (testA.finalRes.summary.totalConfirmedFailures !== 1) throw new Error('Test A expected 1 confirmed failure');
  if (testA.recRes.recommendations.some(r => r.type === 'ADDRESS_SAFETY_SENSITIVITY' && r.priority === 'CRITICAL')) {
    throw new Error('Test A should NOT have CRITICAL safety recommendation');
  }
  console.log('>>> TEST A PASSED\n');

  // TEST B
  console.log('--- TEST B: MISSING EVIDENCE ---');
  const testB = await runPipeline(
    'waterproof hiking boots size 10 under $150',
    'I recommend Summit Trek Boots for $129.'
  );
  console.log('Test B Final Verdict:', testB.finalRes.finalVerdict);
  console.log('Test B Hard Gate Distribution:', testB.finalRes.summary.hardGateDistribution);
  console.log('Test B Confirmed Failures:', testB.finalRes.summary.totalConfirmedFailures);
  console.log('Test B Unresolved Unknown:', testB.finalRes.summary.totalUnresolvedUnknown);
  console.log('Test B Evidence Score:', testB.finalRes.summary.averageEvaluatedEvidenceScore);
  console.log('Test B Rationale:', testB.finalRes.verdictRationale);
  if (testB.finalRes.finalVerdict !== 'INDETERMINATE') throw new Error('Test B expected INDETERMINATE');
  if (testB.finalRes.summary.totalConfirmedFailures !== 0) throw new Error('Test B expected 0 confirmed failures');
  if (testB.finalRes.summary.totalUnresolvedUnknown !== 3) throw new Error('Test B expected 3 unknown');
  console.log('>>> TEST B PASSED\n');

  // TEST C
  console.log('--- TEST C: MULTI-PRODUCT INTENT ---');
  const testC = await runPipeline(
    'lightweight breathable jackets for summer trail running',
    'Two options: TrailAir Shell ($95) is lightweight and highly breathable. MountainGuard Parka ($140) is waterproof, heavily insulated, and designed for freezing conditions.'
  );
  console.log('Test C Final Verdict (Response):', testC.finalRes.finalVerdict);
  console.log('Test C Products Evaluated:', testC.finalRes.productVerdicts.length);
  for (const pv of testC.finalRes.productVerdicts) {
    console.log(`  - Product: ${pv.productName} (${pv.productId}) -> Verdict: ${pv.verdict}, Hard Gate: ${pv.hardGateState}`);
  }
  console.log('Test C Rationale:', testC.finalRes.verdictRationale);
  if (testC.finalRes.finalVerdict !== 'FAIL') throw new Error('Test C expected response-level FAIL due to MountainGuard Parka');
  const parka = testC.finalRes.productVerdicts.find(p => p.productName.includes('MountainGuard') || p.productId === 'P2');
  const shell = testC.finalRes.productVerdicts.find(p => p.productName.includes('TrailAir') || p.productId === 'P1');
  if (!parka || parka.verdict !== 'FAIL') throw new Error('MountainGuard Parka expected product verdict FAIL');
  if (!shell) throw new Error('TrailAir Shell missing');
  console.log('>>> TEST C PASSED\n');

  // TEST D
  console.log('--- TEST D: CONTRADICTION ---');
  const testD = await runPipeline(
    'waterproof jacket',
    'The StormShell Jacket is waterproof. However, its outer fabric is not waterproof.'
  );
  console.log('Test D Final Verdict:', testD.finalRes.finalVerdict);
  console.log('Test D Hard Gate State:', testD.finalRes.productVerdicts[0]?.hardGateState);
  console.log('Test D Rationale:', testD.finalRes.verdictRationale);
  if (testD.finalRes.finalVerdict !== 'INDETERMINATE') throw new Error('Test D expected INDETERMINATE');
  console.log('>>> TEST D PASSED\n');

  // TEST E
  console.log('--- TEST E: CLEAN SATISFACTION ---');
  const testE = await runPipeline(
    'waterproof jacket under $100',
    'I recommend the RainShield Jacket for $89. It is waterproof.'
  );
  console.log('Test E Final Verdict:', testE.finalRes.finalVerdict);
  console.log('Test E Hard Gate State:', testE.finalRes.productVerdicts[0]?.hardGateState);
  console.log('Test E Evidence Score:', testE.finalRes.summary.averageEvaluatedEvidenceScore);
  console.log('Test E Overall Severity:', testE.finalRes.summary.overallSeverity);
  console.log('Test E Rationale:', testE.finalRes.verdictRationale);
  if (testE.finalRes.finalVerdict !== 'PASS') throw new Error('Test E expected PASS');
  if (testE.finalRes.summary.overallSeverity !== 'NONE') throw new Error('Test E expected severity NONE');
  console.log('>>> TEST E PASSED\n');

  // TEST F
  console.log('--- TEST F: NEGATIVE EXCLUSION ---');
  const testF = await runPipeline(
    'running shoes under $120, no leather',
    'I recommend the RoadMaster 5 for $99. It has a genuine leather upper.'
  );
  console.log('Test F Final Verdict:', testF.finalRes.finalVerdict);
  console.log('Test F Hard Gate State:', testF.finalRes.productVerdicts[0]?.hardGateState);
  console.log('Test F Confirmed Failures:', testF.finalRes.summary.totalConfirmedFailures);
  console.log('Test F Rationale:', testF.finalRes.verdictRationale);
  if (testF.finalRes.finalVerdict !== 'FAIL') throw new Error('Test F expected FAIL');
  if (testF.finalRes.summary.totalConfirmedFailures < 1) throw new Error('Test F expected confirmed failure');
  console.log('>>> TEST F PASSED\n');

  console.log('====================================================');
  console.log('ALL TESTS A–F PASSED PERFECTLY!');
  console.log('====================================================');
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
