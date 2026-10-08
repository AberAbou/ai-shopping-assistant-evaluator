import {
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  VerificationEngineResult,
  RubricEngineResult,
  ClaimSupportAnalysisResult,
  RootCauseAnalysisResult,
  SeverityAndScoringResult,
  RecommendationEngineResult,
  FinalEvaluationResult,
} from '../../types/evaluation';
import { runFinalVerdictEngine } from './finalVerdictEngine';

/**
 * Service to execute Checkpoint 10: Final Integrated Evaluation & Verdict.
 * Strictly deterministic and evidence-bound. Consumes Checkpoints 2–9.
 */
export async function runFinalEvaluationAnalysis(
  promptAnalysis: UserPromptAnalysisResult,
  claimAnalysis: LlmOutputClaimAnalysisResult,
  verificationResult: VerificationEngineResult,
  rubricResult: RubricEngineResult,
  claimSupportResult: ClaimSupportAnalysisResult,
  rootCauseResult: RootCauseAnalysisResult,
  severityScoringResult: SeverityAndScoringResult,
  recommendationResult: RecommendationEngineResult,
  userPrompt: string = '',
  llmOutput: string = ''
): Promise<FinalEvaluationResult> {
  return runFinalVerdictEngine(
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
}
