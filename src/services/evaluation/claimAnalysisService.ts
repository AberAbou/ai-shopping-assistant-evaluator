import { LlmOutputClaimAnalysisResult, ExtractedProduct, ExtractedClaim } from '../../types/evaluation';
import { analyzeLlmOutputDeterministically } from './fallbackClaimAnalyzer';
import { reconcileClaimCart } from './shoppingCartSemantics';

/**
 * Service to execute automatic analysis of the shopping assistant's LLM Output.
 * Communicates with server-side Gemini API with structured output and normalizer,
 * with deterministic fallback for resilient offline execution.
 */
export async function analyzeLlmOutput(llmOutput: string): Promise<LlmOutputClaimAnalysisResult> {
  const cleanOutput = llmOutput.trim();
  if (!cleanOutput) {
    throw new Error('LLM Output cannot be empty');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('/api/analyze-claims', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ llmOutput: cleanOutput }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.products) && Array.isArray(data.claims)) {
        return reconcileClaimCart(data as LlmOutputClaimAnalysisResult, cleanOutput);
      }
    }
  } catch (_err) {
    // If server endpoint is unreachable or times out, fall through to deterministic analysis.
  }

  // Resilient deterministic fallback
  return analyzeLlmOutputDeterministically(cleanOutput);
}

/**
 * Product extractor implementation satisfying the claimExtractor module.
 */
export async function extractProductsFromOutput(llmOutput: string): Promise<ExtractedProduct[]> {
  const result = await analyzeLlmOutput(llmOutput);
  return result.products;
}

/**
 * Claim extractor implementation satisfying the claimExtractor module.
 */
export async function extractClaimsFromOutput(llmOutput: string): Promise<ExtractedClaim[]> {
  const result = await analyzeLlmOutput(llmOutput);
  return result.claims;
}
