import {
  AtomicConstraint,
  ExtractedProduct,
  ExtractedClaim,
  VerificationEngineResult,
} from '../../types/evaluation';
import { verifyProductConstraintsDeterministically } from './fallbackVerificationEngine';

/**
 * Service to execute constraint-vs-claim verification.
 * Compares each product's extracted claims against the shopper's constraints.
 */
export async function runConstraintVerification(
  constraints: AtomicConstraint[],
  products: ExtractedProduct[],
  claims: ExtractedClaim[]
): Promise<VerificationEngineResult> {
  // Deterministic and semantic verification executes hermetically
  return verifyProductConstraintsDeterministically(constraints, products, claims);
}
