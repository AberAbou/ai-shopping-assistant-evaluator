import {
  ExtractedClaim,
  ExtractedProduct,
  ClaimSupportAnalysisResult,
} from '../../types/evaluation';
import { analyzeClaimSupport } from './claimSupportAnalyzer';

/**
 * Service to execute claim support and hallucination-risk analysis.
 */
export async function runClaimSupportAnalysis(
  claims: ExtractedClaim[],
  products: ExtractedProduct[],
  llmOutput: string
): Promise<ClaimSupportAnalysisResult> {
  return analyzeClaimSupport(claims, products, llmOutput);
}
