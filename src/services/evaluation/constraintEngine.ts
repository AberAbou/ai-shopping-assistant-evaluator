import { AtomicConstraint, HardConstraintItem } from '../../types/evaluation';
import { extractConstraintsFromPrompt } from './promptAnalysisService';

/**
 * Internal Module: Constraint Extraction & Matrix Generation
 * Dissects user prompt for hard and soft constraints (price bounds, dimensions, brands, negative filters)
 * and evaluates satisfaction against LLM output.
 * NOT exposed as user input; purely automated.
 */
export interface ConstraintEngineModule {
  extractConstraints(userPrompt: string): Promise<AtomicConstraint[]>;
  evaluateConstraints(constraints: HardConstraintItem[], llmOutput: string): Promise<HardConstraintItem[]>;
}

export class DefaultConstraintEngine implements ConstraintEngineModule {
  async extractConstraints(userPrompt: string): Promise<AtomicConstraint[]> {
    return extractConstraintsFromPrompt(userPrompt);
  }

  async evaluateConstraints(_constraints: HardConstraintItem[], _llmOutput: string): Promise<HardConstraintItem[]> {
    // LLM output evaluation will be implemented in future checkpoint
    throw new Error('LLM output constraint evaluation is deferred to later checkpoint');
  }
}

export const defaultConstraintEngine = new DefaultConstraintEngine();
