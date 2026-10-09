import { analyzeUserPromptDeterministically } from '../../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically } from '../../src/services/evaluation/fallbackClaimAnalyzer';
import { runConstraintVerification } from '../../src/services/evaluation/verificationService';
import { runRubricEvaluation } from '../../src/services/evaluation/rubricService';
import { runClaimSupportAnalysis } from '../../src/services/evaluation/claimSupportService';
import { runRootCauseAnalysis } from '../../src/services/evaluation/rootCauseService';
import { runSeverityAndScoringAnalysis } from '../../src/services/evaluation/severityScoringService';
import { runRecommendationAnalysis } from '../../src/services/evaluation/recommendationService';
import { runFinalEvaluationAnalysis } from '../../src/services/evaluation/finalVerdictService';
import type { UserPromptAnalysisResult, LlmOutputClaimAnalysisResult } from '../../src/types/evaluation';

export async function evaluate(userPrompt: string, llmOutput: string, analyses?: { prompt: UserPromptAnalysisResult; claims: LlmOutputClaimAnalysisResult }) {
  const promptAnalysis = analyses?.prompt ?? analyzeUserPromptDeterministically(userPrompt);
  const claimAnalysis = analyses?.claims ?? analyzeLlmOutputDeterministically(llmOutput);
  const verificationResult = await runConstraintVerification(promptAnalysis.constraints, claimAnalysis.products, claimAnalysis.claims);
  const rubricResult = await runRubricEvaluation(promptAnalysis.constraints, claimAnalysis.products, verificationResult);
  const claimSupportResult = await runClaimSupportAnalysis(claimAnalysis.claims, claimAnalysis.products, llmOutput);
  const rootCauseResult = await runRootCauseAnalysis(promptAnalysis, claimAnalysis, verificationResult, rubricResult, claimSupportResult, userPrompt, llmOutput);
  const severityAndScoringResult = await runSeverityAndScoringAnalysis(promptAnalysis, claimAnalysis, verificationResult, rubricResult, claimSupportResult, rootCauseResult);
  const recommendationResult = await runRecommendationAnalysis(promptAnalysis, claimAnalysis, verificationResult, rubricResult, claimSupportResult, rootCauseResult, severityAndScoringResult);
  const finalEvaluationResult = await runFinalEvaluationAnalysis(promptAnalysis, claimAnalysis, verificationResult, rubricResult, claimSupportResult, rootCauseResult, severityAndScoringResult, recommendationResult, userPrompt, llmOutput);
  return { inputs: { userPrompt, llmOutput }, promptAnalysis, claimAnalysis, verificationResult, rubricResult, claimSupportResult, rootCauseResult, severityAndScoringResult, recommendationResult, finalEvaluationResult };
}
