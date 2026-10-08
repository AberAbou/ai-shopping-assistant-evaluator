import { ExtractedIntent } from '../../types/evaluation';
import { extractIntentFromPrompt } from './promptAnalysisService';

/**
 * Internal Module: Intent Extraction
 * Extracts the shopper's primary intent, product category, constraints, and implicit goals.
 * NOT exposed as user input; purely automated from User Prompt.
 */
export interface IntentExtractorModule {
  extractIntent(userPrompt: string): Promise<ExtractedIntent>;
}

export class DefaultIntentExtractor implements IntentExtractorModule {
  async extractIntent(userPrompt: string): Promise<ExtractedIntent> {
    return extractIntentFromPrompt(userPrompt);
  }
}

export const defaultIntentExtractor = new DefaultIntentExtractor();
