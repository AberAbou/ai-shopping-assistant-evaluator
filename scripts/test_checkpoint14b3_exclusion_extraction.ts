import { analyzeUserPrompt } from '../src/services/evaluation/promptAnalysisService';
import { analyzeLlmOutput } from '../src/services/evaluation/claimAnalysisService';
import { runConstraintVerification } from '../src/services/evaluation/verificationService';
import { runRubricEvaluation } from '../src/services/evaluation/rubricService';
import { runClaimSupportAnalysis } from '../src/services/evaluation/claimSupportService';
import { runRootCauseAnalysis } from '../src/services/evaluation/rootCauseService';
import { runSeverityAndScoringAnalysis } from '../src/services/evaluation/severityScoringService';
import { runRecommendationAnalysis } from '../src/services/evaluation/recommendationService';
import { runFinalEvaluationAnalysis } from '../src/services/evaluation/finalVerdictService';

async function evaluate(userPrompt: string, llmOutput: string) {
  const promptAnalysis = await analyzeUserPrompt(userPrompt);
  const claimAnalysis = await analyzeLlmOutput(llmOutput);
  const verificationResult = await runConstraintVerification(
    promptAnalysis.constraints,
    claimAnalysis.products,
    claimAnalysis.claims
  );
  const rubricResult = await runRubricEvaluation(
    promptAnalysis.constraints,
    claimAnalysis.products,
    verificationResult
  );
  const claimSupportResult = await runClaimSupportAnalysis(
    claimAnalysis.claims,
    claimAnalysis.products,
    llmOutput
  );
  const rootCauseResult = await runRootCauseAnalysis(
    promptAnalysis,
    claimAnalysis,
    verificationResult,
    rubricResult,
    claimSupportResult,
    userPrompt,
    llmOutput
  );
  const severityScoringResult = await runSeverityAndScoringAnalysis(
    promptAnalysis,
    claimAnalysis,
    verificationResult,
    rubricResult,
    claimSupportResult,
    rootCauseResult
  );
  const recommendationResult = await runRecommendationAnalysis(
    promptAnalysis,
    claimAnalysis,
    verificationResult,
    rubricResult,
    claimSupportResult,
    rootCauseResult,
    severityScoringResult
  );
  const finalResult = await runFinalEvaluationAnalysis(
    promptAnalysis,
    claimAnalysis,
    verificationResult,
    rubricResult,
    claimSupportResult,
    rootCauseResult,
    severityScoringResult,
    recommendationResult,
    userPrompt,
    llmOutput
  );

  return {
    promptAnalysis,
    claimAnalysis,
    verificationResult,
    rubricResult,
    claimSupportResult,
    rootCauseResult,
    severityScoringResult,
    recommendationResult,
    finalResult,
  };
}

async function runCheckpoint14b3RegressionTests() {
  console.log('========================================================================');
  console.log('CHECKPOINT 14B.3 REGRESSION TEST: EXCLUSION EXTRACTION & VERIFICATION');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName}`);
      if (details) console.error(`         Details: ${details}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // TEST 1: Exact Reproduction Case ("without leather")
  console.log('TEST 1: Reproduction Case ("without leather")');
  console.log('User Prompt: "I need running shoes without leather under $120."');
  console.log('LLM Output:  "I recommend genuine leather running shoes for $99."\n');

  const test1 = await evaluate(
    'I need running shoes without leather under $120.',
    'I recommend genuine leather running shoes for $99.'
  );

  const leatherConstraint1 = test1.promptAnalysis.constraints.find(
    (c) => c.attribute === 'leather' || c.sourceText.toLowerCase().includes('without leather')
  );

  assert(
    Boolean(leatherConstraint1),
    '1.1 Mandatory "without leather" exclusion is extracted from User Prompt',
    `Constraints extracted: ${JSON.stringify(test1.promptAnalysis.constraints.map(c => ({ attr: c.attribute, src: c.sourceText, type: c.constraintType, pol: c.polarity })))}`
  );

  assert(
    leatherConstraint1?.constraintType === 'hard',
    '1.2 "without leather" is classified as a mandatory HARD requirement',
    `Actual constraintType: ${leatherConstraint1?.constraintType}`
  );

  assert(
    leatherConstraint1?.polarity === 'negative',
    '1.3 "without leather" has negative polarity',
    `Actual polarity: ${leatherConstraint1?.polarity}`
  );

  assert(
    leatherConstraint1?.operator === 'prohibited',
    '1.4 "without leather" has "prohibited" operator',
    `Actual operator: ${leatherConstraint1?.operator}`
  );

  const leatherVerification1 = test1.verificationResult.records.find(
    (r) => r.constraintAttribute === 'leather'
  );

  assert(
    leatherVerification1?.status === 'FAIL',
    '1.5 Leather exclusion produces confirmed FAIL verification against "genuine leather"',
    `Actual status: ${leatherVerification1?.status}, reason: ${leatherVerification1?.reason}`
  );

  const nc01Cause = test1.rootCauseResult.records.find((r) => r.code === 'NC-01');
  assert(
    Boolean(nc01Cause),
    '1.6 NC-01 (Negative Constraint Violation) root cause is identified',
    `Root causes: ${test1.rootCauseResult.records.map(r => r.code).join(', ')}`
  );

  assert(
    test1.finalResult.finalVerdict === 'FAIL',
    '1.7 Final verdict is FAIL (not INDETERMINATE)',
    `Actual verdict: ${test1.finalResult.finalVerdict}, rationale: ${test1.finalResult.verdictRationale}`
  );

  assert(
    test1.finalResult.summary.overallSeverity === 'HIGH',
    '1.8 Overall severity is HIGH',
    `Actual severity: ${test1.finalResult.summary.overallSeverity}`
  );

  // TEST 2: Phrasing 2 ("no leather")
  console.log('\nTEST 2: Phrasing 2 ("no leather")');
  console.log('User Prompt: "I need running shoes no leather under $120."');
  console.log('LLM Output:  "I recommend genuine leather running shoes for $99."\n');

  const test2 = await evaluate(
    'I need running shoes no leather under $120.',
    'I recommend genuine leather running shoes for $99.'
  );

  const leatherConstraint2 = test2.promptAnalysis.constraints.find(
    (c) => c.attribute === 'leather' && c.polarity === 'negative' && c.constraintType === 'hard'
  );

  assert(
    Boolean(leatherConstraint2),
    '2.1 "no leather" phrasing extracted as mandatory HARD negative exclusion',
    `Constraints: ${JSON.stringify(test2.promptAnalysis.constraints.map(c => ({ attr: c.attribute, src: c.sourceText })))}`
  );

  assert(
    test2.finalResult.finalVerdict === 'FAIL',
    '2.2 Final verdict is FAIL for "no leather"',
    `Actual verdict: ${test2.finalResult.finalVerdict}`
  );

  assert(
    test2.finalResult.summary.overallSeverity === 'HIGH',
    '2.3 Severity is HIGH for "no leather"',
    `Actual severity: ${test2.finalResult.summary.overallSeverity}`
  );

  // TEST 3: Phrasing 3 ("leather-free")
  console.log('\nTEST 3: Phrasing 3 ("leather-free")');
  console.log('User Prompt: "I need running shoes leather-free under $120."');
  console.log('LLM Output:  "I recommend genuine leather running shoes for $99."\n');

  const test3 = await evaluate(
    'I need running shoes leather-free under $120.',
    'I recommend genuine leather running shoes for $99.'
  );

  const leatherConstraint3 = test3.promptAnalysis.constraints.find(
    (c) => c.attribute === 'leather' && c.polarity === 'negative' && c.constraintType === 'hard'
  );

  assert(
    Boolean(leatherConstraint3),
    '3.1 "leather-free" phrasing extracted as mandatory HARD negative exclusion',
    `Constraints: ${JSON.stringify(test3.promptAnalysis.constraints.map(c => ({ attr: c.attribute, src: c.sourceText })))}`
  );

  assert(
    test3.finalResult.finalVerdict === 'FAIL',
    '3.2 Final verdict is FAIL for "leather-free"',
    `Actual verdict: ${test3.finalResult.finalVerdict}`
  );

  assert(
    test3.finalResult.summary.overallSeverity === 'HIGH',
    '3.3 Severity is HIGH for "leather-free"',
    `Actual severity: ${test3.finalResult.summary.overallSeverity}`
  );

  // TEST 4: Step 2 Partial-Material Evidence — upper alone does not establish shoe has no leather
  console.log('\nTEST 4: Step 2 Partial-Material Evidence (Upper Alone -> UNKNOWN)');
  console.log('User Prompt: "I need running shoes without leather under $120."');
  console.log('LLM Output:  "I recommend EcoStep Runners for $99 with a synthetic mesh upper."\n');

  const test4 = await evaluate(
    'I need running shoes without leather under $120.',
    'I recommend EcoStep Runners for $99 with a synthetic mesh upper.'
  );

  const leatherVerification4 = test4.verificationResult.records.find(
    (r) => r.constraintAttribute === 'leather'
  );
  const priceVerification4 = test4.verificationResult.records.find(
    (r) => r.constraintAttribute === 'price'
  );

  assert(
    leatherVerification4?.status === 'UNKNOWN',
    '4.1 Leather exclusion is UNKNOWN because upper alone does not establish entire shoe is leather-free',
    `Actual status: ${leatherVerification4?.status}, reason: ${leatherVerification4?.reason}`
  );

  assert(
    priceVerification4?.status === 'PASS',
    '4.2 Price requirement ($99 < $120) is PASS',
    `Actual status: ${priceVerification4?.status}`
  );

  assert(
    test4.finalResult.finalVerdict === 'INDETERMINATE',
    '4.3 Overall verdict is INDETERMINATE (not PASS, not FAIL)',
    `Actual verdict: ${test4.finalResult.finalVerdict}`
  );

  // TEST 5: Explicit Product-Wide "100% leather-free" -> PASS
  console.log('\nTEST 5: Explicit Product-Wide "100% leather-free" -> PASS');
  console.log('User Prompt: "I need running shoes without leather under $120."');
  console.log('LLM Output:  "I recommend EcoStep Runners for $99. They are 100% leather-free."\n');

  const test5 = await evaluate(
    'I need running shoes without leather under $120.',
    'I recommend EcoStep Runners for $99. They are 100% leather-free.'
  );

  const leatherVerification5 = test5.verificationResult.records.find(
    (r) => r.constraintAttribute === 'leather'
  );
  const priceVerification5 = test5.verificationResult.records.find(
    (r) => r.constraintAttribute === 'price'
  );

  assert(
    leatherVerification5?.status === 'PASS',
    '5.1 Explicit product-wide "100% leather-free" produces PASS for leather exclusion',
    `Actual status: ${leatherVerification5?.status}, reason: ${leatherVerification5?.reason}`
  );

  assert(
    priceVerification5?.status === 'PASS',
    '5.2 Price requirement ($99 < $120) is PASS',
    `Actual status: ${priceVerification5?.status}`
  );

  // TEST 6: Safeguard — Unmentioned material remains UNKNOWN (not false failure)
  console.log('\nTEST 6: Safeguard — UNKNOWN material does not create false failure');
  console.log('User Prompt: "I need running shoes without leather under $120."');
  console.log('LLM Output:  "I recommend TrailPace for $99."\n');

  const test6 = await evaluate(
    'I need running shoes without leather under $120.',
    'I recommend TrailPace for $99.'
  );

  const leatherVerification6 = test6.verificationResult.records.find(
    (r) => r.constraintAttribute === 'leather'
  );

  assert(
    leatherVerification6?.status === 'UNKNOWN',
    '6.1 Unstated material produces UNKNOWN status (not FAIL)',
    `Actual status: ${leatherVerification6?.status}`
  );

  assert(
    test6.finalResult.finalVerdict === 'INDETERMINATE',
    '6.2 Missing material evidence produces INDETERMINATE (preserving UNKNOWN vs FAIL safeguard)',
    `Actual verdict: ${test6.finalResult.finalVerdict}`
  );

  // TEST 7: Step 3 — Explicit Use-Case Evidence Recognition ("specifically designed for running")
  console.log('\nTEST 7: Step 3 — Explicit Use-Case Evidence Recognition');
  console.log('User Prompt: "I need running shoes without leather under $120."');
  console.log('LLM Output:  "I recommend EcoStep Runners for $99. They are 100% leather-free and specifically designed for running."\n');

  const test7 = await evaluate(
    'I need running shoes without leather under $120.',
    'I recommend EcoStep Runners for $99. They are 100% leather-free and specifically designed for running.'
  );

  const priceVerification7 = test7.verificationResult.records.find(
    (r) => r.constraintAttribute === 'price'
  );
  const leatherVerification7 = test7.verificationResult.records.find(
    (r) => r.constraintAttribute === 'leather'
  );
  const useCaseVerification7 = test7.verificationResult.records.find(
    (r) => r.constraintAttribute === 'use_case'
  );

  assert(
    priceVerification7?.status === 'PASS',
    '7.1 Price requirement ($99 < $120) is PASS',
    `Actual status: ${priceVerification7?.status}`
  );

  assert(
    leatherVerification7?.status === 'PASS',
    '7.2 Leather exclusion (100% leather-free) is PASS',
    `Actual status: ${leatherVerification7?.status}`
  );

  assert(
    useCaseVerification7?.status === 'PASS',
    '7.3 Use-case running ("specifically designed for running") is PASS',
    `Actual status: ${useCaseVerification7?.status}, reason: ${useCaseVerification7?.reason}`
  );

  assert(
    test7.finalResult.finalVerdict === 'PASS',
    '7.4 Overall verdict is PASS (all mandatory requirements cleanly satisfied)',
    `Actual verdict: ${test7.finalResult.finalVerdict}, rationale: ${test7.finalResult.verdictRationale}`
  );

  // TEST 8: Step 3 — Do not infer suitability merely from product name containing "running"
  console.log('\nTEST 8: Step 3 — Product-Name-Only Evidence (No Inference)');
  console.log('User Prompt: "I need running shoes without leather under $120."');
  console.log('LLM Output:  "I recommend EcoStep Running Shoes for $99. They are 100% leather-free."\n');

  const test8 = await evaluate(
    'I need running shoes without leather under $120.',
    'I recommend EcoStep Running Shoes for $99. They are 100% leather-free.'
  );

  const useCaseVerification8 = test8.verificationResult.records.find(
    (r) => r.constraintAttribute === 'use_case'
  );

  assert(
    useCaseVerification8?.status === 'UNKNOWN',
    '8.1 Suitability is NOT inferred from product name "EcoStep Running Shoes" (remains UNKNOWN)',
    `Actual status: ${useCaseVerification8?.status}, reason: ${useCaseVerification8?.reason}`
  );

  assert(
    test8.finalResult.finalVerdict === 'INDETERMINATE',
    '8.2 Overall verdict is INDETERMINATE when suitability evidence is only in product name',
    `Actual verdict: ${test8.finalResult.finalVerdict}`
  );

  // TEST 9: Step 3 — Missing suitability evidence preserves UNKNOWN
  console.log('\nTEST 9: Step 3 — Missing Suitability Evidence');
  console.log('User Prompt: "I need running shoes without leather under $120."');
  console.log('LLM Output:  "I recommend EcoStep Runners for $99. They are 100% leather-free."\n');

  const test9 = await evaluate(
    'I need running shoes without leather under $120.',
    'I recommend EcoStep Runners for $99. They are 100% leather-free.'
  );

  const useCaseVerification9 = test9.verificationResult.records.find(
    (r) => r.constraintAttribute === 'use_case'
  );

  assert(
    useCaseVerification9?.status === 'UNKNOWN',
    '9.1 Missing suitability evidence preserves UNKNOWN status',
    `Actual status: ${useCaseVerification9?.status}`
  );

  assert(
    test9.finalResult.finalVerdict === 'INDETERMINATE',
    '9.2 Overall verdict remains INDETERMINATE with unstated suitability',
    `Actual verdict: ${test9.finalResult.finalVerdict}`
  );

  // TEST 10: Step 3 — Product-level evidence isolation across multiple products
  console.log('\nTEST 10: Step 3 — Product-Level Evidence Isolation');
  console.log('User Prompt: "I need running shoes without leather under $120."');
  console.log('LLM Output:  "1. EcoStep Runners ($99) - 100% leather-free and specifically designed for running.\\n2. UrbanStep ($80) - 100% leather-free."\n');

  const test10 = await evaluate(
    'I need running shoes without leather under $120.',
    '1. EcoStep Runners ($99) - 100% leather-free and specifically designed for running.\n2. UrbanStep ($80) - 100% leather-free.'
  );

  const p1UseCase = test10.verificationResult.records.find(
    (r) => r.productId === 'P1' && r.constraintAttribute === 'use_case'
  );
  const p2UseCase = test10.verificationResult.records.find(
    (r) => r.productId === 'P2' && r.constraintAttribute === 'use_case'
  );

  assert(
    p1UseCase?.status === 'PASS',
    '10.1 P1 ("EcoStep Runners") receives PASS for running suitability',
    `Actual status: ${p1UseCase?.status}`
  );

  assert(
    p2UseCase?.status === 'UNKNOWN',
    '10.2 P2 ("UrbanStep") receives UNKNOWN for running suitability (evidence isolation preserved)',
    `Actual status: ${p2UseCase?.status}`
  );

  console.log('\n========================================================================');
  console.log(`ALL ${passedTests}/${totalTests} CHECKPOINT 14B.3 REGRESSION TESTS PASSED!`);
  console.log('========================================================================\n');
}

runCheckpoint14b3RegressionTests().catch((err) => {
  console.error('\nRegression test failed:', err);
  process.exit(1);
});
