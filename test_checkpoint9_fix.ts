import { analyzeUserPrompt } from './src/services/evaluation/promptAnalysisService';
import { analyzeLlmOutput } from './src/services/evaluation/claimAnalysisService';
import { runConstraintVerification } from './src/services/evaluation/verificationService';
import { runRubricEvaluation } from './src/services/evaluation/rubricService';
import { runClaimSupportAnalysis } from './src/services/evaluation/claimSupportService';
import { runRootCauseAnalysis } from './src/services/evaluation/rootCauseService';
import { runSeverityAndScoringAnalysis } from './src/services/evaluation/severityScoringService';
import { runRecommendationAnalysis } from './src/services/evaluation/recommendationService';

async function runTest(name: string, prompt: string, output: string) {
  console.log(`\n=================== ${name} ===================`);
  console.log(`Prompt: "${prompt}"`);
  console.log(`Output: "${output}"`);

  const promptRes = await analyzeUserPrompt(prompt);
  const claimRes = await analyzeLlmOutput(output);
  if (!claimRes) {
    console.log('Claim extraction failed.');
    return;
  }
  const verifRes = await runConstraintVerification(promptRes.constraints, claimRes.products, claimRes.claims);
  const rubricRes = await runRubricEvaluation(promptRes.constraints, claimRes.products, verifRes);
  const supportRes = await runClaimSupportAnalysis(claimRes.claims, claimRes.products, output);
  const rootCauseRes = await runRootCauseAnalysis(promptRes, claimRes, verifRes, rubricRes, supportRes, prompt, output);
  const sevRes = await runSeverityAndScoringAnalysis(promptRes, claimRes, verifRes, rubricRes, supportRes, rootCauseRes);
  const recRes = await runRecommendationAnalysis(promptRes, claimRes, verifRes, rubricRes, supportRes, rootCauseRes, sevRes);

  console.log(`Verifications: ${verifRes.records.map(v => `${v.constraintAttribute}:${v.status}`).join(', ')}`);
  console.log(`Hard Gates: ${rubricRes.productsList.map(p => `${p.productName}:${p.hardGateState}`).join(', ')}`);
  console.log(`Severity: ${sevRes.responseSeverity.overallSeverity}`);
  console.log(`Score: ${sevRes.overallSummary.evaluatedEvidenceScore}`);
  console.log(`Recommendations Total: ${recRes.recommendations.length}`);
  console.log(`Overall Summary:`, recRes.overallSummary);
  recRes.recommendations.forEach(r => {
    console.log(`  [${r.recommendationId}] ${r.priority} | ${r.type} | "${r.title}"`);
    console.log(`    Action: ${r.action}`);
    console.log(`    Trace: constraints=[${r.constraintIds.join(', ')}], claims=[${r.claimIds.join(', ')}], verif=[${r.verificationIds.join(', ')}]`);
  });
}

async function main() {
  await runTest(
    'TEST A (Sunscreen - Price violation + Lavender oil + Sensitive Skin)',
    'fragrance-free organic sunscreen suitable for sensitive skin under $25',
    'I recommend Luxury Botanical Sunscreen SPF 50 for $32. It contains lavender essential oil and is 100% hypoallergenic.'
  );

  await runTest(
    'TEST B (Summit Trek Boots - Unknowns/Omissions + Price Pass)',
    'waterproof hiking boots size 10 under $150',
    'I recommend Summit Trek Boots for $129.'
  );

  await runTest(
    'TEST C (Cruelty-Free Runner - All satisfied clean pass)',
    'vegan running shoes under $100',
    'Cruelty-Free Runner for $85. Made from 100% synthetic mesh and recycled foam, certified vegan.'
  );

  await runTest(
    'TEST D (Executive Comfort Chair - Negative leather exclusion violation)',
    'leather-free office chair under $200',
    'Executive Comfort Chair for $180 featuring premium bonded leather cushions.'
  );

  await runTest(
    'TEST E (Nut-Free Bars - Contradiction / Allergen)',
    'nut-free energy bars under $30',
    'Nut-Free Energy Bar box for $24. Note: Manufactured in a facility that also processes peanuts and tree nuts.'
  );

  await runTest(
    'TEST F (Negative Constraint - Genuine leather)',
    'running shoes under $120, no leather',
    'I recommend the RoadMaster 5 for $99. It has a genuine leather upper.'
  );
}

main().catch(console.error);
