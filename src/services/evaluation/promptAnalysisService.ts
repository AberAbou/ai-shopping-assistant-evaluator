import { UserPromptAnalysisResult, ExtractedIntent, AtomicConstraint } from '../../types/evaluation';
import { analyzeUserPromptDeterministically } from './fallbackPromptAnalyzer';
import { reconcilePromptCart } from './shoppingCartSemantics';

/**
 * Service to execute automatic analysis of the shopper's User Prompt.
 * Communicates with server-side Gemini API with structured output and normalizer,
 * with deterministic fallback for resilient offline execution.
 */
export async function analyzeUserPrompt(userPrompt: string): Promise<UserPromptAnalysisResult> {
  const cleanPrompt = userPrompt.trim();
  if (!cleanPrompt) {
    throw new Error('User Prompt cannot be empty');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('/api/analyze-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userPrompt: cleanPrompt }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.intent && Array.isArray(data.constraints)) {
        return reconcilePromptCart(data as UserPromptAnalysisResult, cleanPrompt);
      }
    }
  } catch (_err) {
    // If server endpoint is unreachable or in client-only preview or timed out,
    // fall through to deterministic semantic analysis.
  }

  // Resilient deterministic fallback
  return analyzeUserPromptDeterministically(cleanPrompt);
}

/**
 * Intent extractor implementation satisfying the intentExtractor module interface.
 */
export async function extractIntentFromPrompt(userPrompt: string): Promise<ExtractedIntent> {
  const result = await analyzeUserPrompt(userPrompt);
  return result.intent;
}

/**
 * Constraint extractor implementation satisfying the constraintEngine module interface.
 */
export async function extractConstraintsFromPrompt(userPrompt: string): Promise<AtomicConstraint[]> {
  const result = await analyzeUserPrompt(userPrompt);
  return result.constraints;
}
