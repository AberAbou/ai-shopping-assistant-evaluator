import {
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  VerificationEngineResult,
  RubricEngineResult,
  ClaimSupportAnalysisResult,
  RootCauseAnalysisResult,
  SeverityAndScoringResult,
  RecommendationEngineResult,
} from '../../types/evaluation';
import { runRecommendationEngine } from './recommendationEngine';

/**
 * Service to execute Checkpoint 9: Actionable Recommendations & Remediation.
 * Generates traceable, evidence-bound recommendations derived strictly from
 * observed evaluation findings.
 */
export async function runRecommendationAnalysis(
  promptAnalysis: UserPromptAnalysisResult,
  claimAnalysis: LlmOutputClaimAnalysisResult,
  verificationResult: VerificationEngineResult,
  rubricResult: RubricEngineResult,
  claimSupportResult: ClaimSupportAnalysisResult,
  rootCauseResult: RootCauseAnalysisResult,
  severityResult: SeverityAndScoringResult
): Promise<RecommendationEngineResult> {
  return runRecommendationEngine(
    promptAnalysis,
    claimAnalysis,
    verificationResult,
    rubricResult,
    claimSupportResult,
    rootCauseResult,
    severityResult
  );
}
