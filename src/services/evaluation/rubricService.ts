import {
  AtomicConstraint,
  ExtractedProduct,
  VerificationEngineResult,
  RubricEngineResult,
} from '../../types/evaluation';
import { generateAndEvaluateRubrics } from './rubricGenerator';

/**
 * Service to execute dynamic rubric generation and hard-gate calculation.
 */
export async function runRubricEvaluation(
  constraints: AtomicConstraint[],
  products: ExtractedProduct[],
  verificationResult: VerificationEngineResult
): Promise<RubricEngineResult> {
  return generateAndEvaluateRubrics(constraints, products, verificationResult);
}
