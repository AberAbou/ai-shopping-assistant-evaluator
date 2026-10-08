import {
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  VerificationEngineResult,
  RubricEngineResult,
  ClaimSupportAnalysisResult,
  RootCauseAnalysisResult,
} from '../../types/evaluation';
import { analyzeRootCauses } from './rootCauseAnalyzer';

/**
 * Service to execute root-cause and failure-mode diagnostic analysis.
 */
export async function runRootCauseAnalysis(
  promptAnalysis: UserPromptAnalysisResult,
  claimAnalysis: LlmOutputClaimAnalysisResult,
  verificationResult: VerificationEngineResult,
  rubricResult: RubricEngineResult,
  claimSupportResult: ClaimSupportAnalysisResult,
  userPrompt: string,
  llmOutput: string
): Promise<RootCauseAnalysisResult> {
  return analyzeRootCauses(
    promptAnalysis,
    claimAnalysis,
    verificationResult,
    rubricResult,
    claimSupportResult,
    userPrompt,
    llmOutput
  );
}
