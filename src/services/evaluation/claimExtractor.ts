import { ExtractedProduct, ExtractedClaim } from '../../types/evaluation';
import { extractProductsFromOutput, extractClaimsFromOutput } from './claimAnalysisService';

/**
 * Internal Module: Claim Extraction & Analysis
 * Deconstructs the LLM output into recommended products and verifiable factual & subjective claims.
 * NOT exposed as user input; purely automated from LLM Output.
 */
export interface ClaimExtractorModule {
  extractProducts(llmOutput: string): Promise<ExtractedProduct[]>;
  extractClaims(llmOutput: string): Promise<ExtractedClaim[]>;
  verifyClaims(claims: ExtractedClaim[], context: { userPrompt: string }): Promise<ExtractedClaim[]>;
}

export class DefaultClaimExtractor implements ClaimExtractorModule {
  async extractProducts(llmOutput: string): Promise<ExtractedProduct[]> {
    return extractProductsFromOutput(llmOutput);
  }

  async extractClaims(llmOutput: string): Promise<ExtractedClaim[]> {
    return extractClaimsFromOutput(llmOutput);
  }

  async verifyClaims(claims: ExtractedClaim[], _context: { userPrompt: string }): Promise<ExtractedClaim[]> {
    // Verification against user prompt constraints will be implemented in subsequent checkpoints
    return claims;
  }
}

export const defaultClaimExtractor = new DefaultClaimExtractor();
