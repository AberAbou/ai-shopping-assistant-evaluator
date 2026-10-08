import { EvaluatorInput, EvaluationResult } from '../../types/evaluation';
import { defaultIntentExtractor } from './intentExtractor';
import { defaultConstraintEngine } from './constraintEngine';
import { defaultClaimExtractor } from './claimExtractor';
import { defaultRubricGenerator } from './rubricGenerator';
import { defaultVerificationEngine } from './verificationEngine';
import { defaultScoringEngine } from './scoringEngine';
import { defaultSeverityClassifier } from './severityClassifier';
import { defaultRootCauseAnalyzer } from './rootCauseAnalyzer';
import { defaultRecommendationEngine } from './recommendationEngine';

/**
 * Pipeline orchestrator interface.
 * 
 * STRICT ARCHITECTURAL INVARIANT:
 * The evaluation engine takes ONLY `EvaluatorInput` (userPrompt and llmOutput).
 * All downstream artifacts (intent, constraints, claims, rubric, verification,
 * scores, severity, root cause, recommendations) are derived internally.
 */
export interface EvaluationPipeline {
  evaluate(input: EvaluatorInput): Promise<EvaluationResult>;
}

export class EvaluationEngineService implements EvaluationPipeline {
  constructor(
    private readonly intentExtractor = defaultIntentExtractor,
    private readonly constraintEngine = defaultConstraintEngine,
    private readonly claimExtractor = defaultClaimExtractor,
    private readonly rubricGenerator = defaultRubricGenerator,
    private readonly verificationEngine = defaultVerificationEngine,
    private readonly scoringEngine = defaultScoringEngine,
    private readonly severityClassifier = defaultSeverityClassifier,
    private readonly rootCauseAnalyzer = defaultRootCauseAnalyzer,
    private readonly recommendationEngine = defaultRecommendationEngine
  ) {}

  async evaluate(_input: EvaluatorInput): Promise<EvaluationResult> {
    // In this first build, real AI evaluation is deferred to the next phase.
    // The engine structure is in place for future integration.
    throw new Error('Evaluation engine execution is deferred in this initial GUI shell build.');
  }
}

export * from './severityClassifier';
export * from './scoringEngine';
export * from './severityScoringService';
export * from './recommendationEngine';
export * from './recommendationService';
export * from './finalVerdictEngine';
export * from './finalVerdictService';
export const evaluationPipeline = new EvaluationEngineService();
