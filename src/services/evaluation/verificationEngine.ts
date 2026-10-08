import {
  AtomicConstraint,
  ExtractedProduct,
  ExtractedClaim,
  VerificationEngineResult,
  HardConstraintItem,
  ClaimItem,
} from '../../types/evaluation';
import { runConstraintVerification } from './verificationService';

/**
 * Internal Module: Deterministic & Semantic Verification
 * Verifies each recommended product independently against every shopper constraint.
 * NOT exposed as user input; purely automated.
 */
export interface VerificationEngineModule {
  verifyConstraints(
    constraints: AtomicConstraint[],
    products: ExtractedProduct[],
    claims: ExtractedClaim[]
  ): Promise<VerificationEngineResult>;
  runDeterministicVerification(constraints: HardConstraintItem[], llmOutput: string): Promise<HardConstraintItem[]>;
  runSemanticVerification(claims: ClaimItem[], userPrompt: string): Promise<ClaimItem[]>;
}

export class DefaultVerificationEngine implements VerificationEngineModule {
  async verifyConstraints(
    constraints: AtomicConstraint[],
    products: ExtractedProduct[],
    claims: ExtractedClaim[]
  ): Promise<VerificationEngineResult> {
    return runConstraintVerification(constraints, products, claims);
  }

  async runDeterministicVerification(constraints: HardConstraintItem[], _llmOutput: string): Promise<HardConstraintItem[]> {
    return constraints;
  }

  async runSemanticVerification(claims: ClaimItem[], _userPrompt: string): Promise<ClaimItem[]> {
    return claims;
  }
}

export const defaultVerificationEngine = new DefaultVerificationEngine();
