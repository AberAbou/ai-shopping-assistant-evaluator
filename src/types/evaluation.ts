/**
 * Core type definitions for the AI Shopping Assistant Evaluator.
 * 
 * CRITICAL PRODUCT REQUIREMENT:
 * The default single-prompt workflow provides two inputs:
 * 1. userPrompt
 * 2. llmOutput
 * 
 * Conversation mode preserves ordered pairs of those inputs and their provenance.
 * Other types represent internal representations and automated outputs.
 */

export interface EvaluatorInput {
  userPrompt: string;
  llmOutput: string;
  conversation?: ConversationContext;
}

export interface ConversationTurn { id: string; userPrompt: string; llmOutput: string }
export interface ConversationChange { turnId: string; action: string; sourceText: string }
export interface ConversationContext {
  turns: ConversationTurn[];
  evaluatedTurnId: string;
  responsePolicy: 'complete_snapshot';
  changes: ConversationChange[];
  unresolved: Array<{ turnId: string; sourceText: string; reason: string }>;
}

// ============================================================================
// CHECKPOINT 2: USER PROMPT ANALYSIS TYPES
// ============================================================================

export type ConstraintType = 'hard' | 'soft';
export type ConstraintPolarity = 'positive' | 'negative';

export type ConstraintOperator =
  | 'equals'
  | 'not_equals'
  | 'less_than'
  | 'less_than_or_equal'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'contains'
  | 'excludes'
  | 'suitable_for'
  | 'required'
  | 'prohibited'
  | '<='
  | '<'
  | '>='
  | '>'
  | '=='
  | '!=';

/**
 * Atomic constraint extracted from the User Prompt.
 * Retains strict source traceability, confidence, and polarity.
 */
export interface AtomicConstraint {
  id: string;
  sourceTurnId?: string;
  attribute: string; // e.g. "price", "category", "weight", "breathability", "material", "color", "size", "cart_total_price"
  operator: ConstraintOperator;
  expectedValue: string | number | boolean;
  constraintType: ConstraintType; // 'hard' vs 'soft'
  polarity: ConstraintPolarity; // 'positive' vs 'negative'
  sourceText: string; // exact substring in User Prompt for auditability
  confidence: number; // 0.0 to 1.0
  reasoning?: string; // why this was classified as hard/soft/negative
  scope?: 'product' | 'cart'; // 'product' vs 'cart'
  targetProductCategory?: string | null; // specific category target if applicable
}

export interface BudgetConstraint {
  maxAmount: number | null;
  minAmount: number | null;
  currency: string;
  sourceText: string;
}

/**
 * Structured intent representation.
 * Fields not stated or reasonably implied are represented as null or empty arrays.
 */
export interface ExtractedIntent {
  targetCategory: string | null;
  useCaseOrActivity: string | null;
  intendedUser: string | null;
  seasonOrClimate: string | null;
  budget: BudgetConstraint | null;
  quantity: number | string | null;
  size: string | null;
  color: string | null;
  material: string | null;
  brandRequirements: {
    included: string[];
    excluded: string[];
  } | null;
  desiredAttributes: string[];
  explicitExclusions: string[];
  safetyOrSensitivity: string | null;
  otherContext: string | null;
  evidenceMap: Record<string, string>; // Maps each extracted intent key to source snippet
}

export interface PromptAnalysisSummary {
  totalConstraints: number;
  hardCount: number;
  softCount: number;
  negativeCount: number;
  extractedCategories: string[];
  confidenceScore: number;
}

export interface UserPromptAnalysisResult {
  state: 'PROMPT_ANALYSIS_COMPLETE' | 'PROMPT_ANALYSIS_COMPLETE_FULL_EVALUATION_NOT_YET_RUN';
  analyzedAt: string;
  userPrompt: string;
  intent: ExtractedIntent;
  constraints: AtomicConstraint[];
  summary: PromptAnalysisSummary;
  rawJson?: Record<string, unknown>;
}

// ============================================================================
// CHECKPOINT 3: LLM OUTPUT CLAIM EXTRACTION TYPES
// ============================================================================

export type ClaimCategory =
  | 'identity'
  | 'brand'
  | 'category'
  | 'price'
  | 'color'
  | 'size'
  | 'quantity'
  | 'material'
  | 'feature'
  | 'suitability'
  | 'performance'
  | 'safety'
  | 'sensitivity'
  | 'composition'
  | 'availability'
  | 'rating'
  | 'review_count'
  | 'shipping'
  | 'delivery'
  | 'warranty'
  | 'return_policy'
  | 'certification'
  | 'sustainability'
  | 'comparative'
  | 'subjective_assessment'
  | 'other';

export type ClaimNature = 'factual' | 'subjective';

export interface ExtractedProduct {
  id: string; // "P1", "P2", etc.
  name: string;
  brand: string | null;
  category: string | null;
  price: {
    amount: number | null;
    currency: string;
    sourceText: string | null;
  } | null;
  quantity: string | null;
  size: string | null;
  colors: string[];
  materials: string[];
  attributes: string[];
  suitability: string[];
  safetyOrSensitivity: string[];
  availability: string | null;
  rating: {
    score: number | null;
    maxScore: number | null;
    reviewCount: number | null;
    sourceText: string | null;
  } | null;
  shippingOrDelivery: string | null;
  warrantyOrReturns: string | null;
  evidenceMap: Record<string, string>;
  parsedQuantity?: number | null;
  unitPrice?: {
    amount: number | null;
    currency: string;
    sourceText: string | null;
  } | null;
  lineTotal?: {
    amount: number | null;
    currency: string;
  } | null;
}

// ============================================================================
// CHECKPOINT 14C.1: MULTI-PRODUCT & SHOPPING CART EVALUATION TYPES
// ============================================================================

export interface CartItemEvaluation {
  productId: string;
  productName: string;
  category: string | null;
  quantity: number | null;
  quantitySourceText: string | null;
  unitPrice: number | null;
  unitPriceSourceText: string | null;
  lineTotal: number | null;
  isMissingQuantity: boolean;
  isMissingUnitPrice: boolean;
}

export interface CartConstraintVerification {
  id: string; // e.g. "CV1"
  constraintId: string;
  constraintAttribute: string; // e.g. "cart_total_price"
  constraintType: 'hard' | 'soft';
  polarity: 'positive' | 'negative';
  status: VerificationStatus;
  operator: ConstraintOperator;
  expectedValue: number | string;
  actualCartTotal: number | null;
  items: CartItemEvaluation[];
  constraintEvidence: string;
  claimEvidence: string[];
  reason: string;
  method: VerificationMethod;
  confidence: number;
}

export interface CartEvaluationResult {
  hasCartEvaluation: boolean;
  cartItems: CartItemEvaluation[];
  calculatedCartTotal: number | null;
  statedCartTotal: number | null;
  effectiveCartTotal: number | null;
  isCartTotalComplete: boolean;
  totalDisagreement?: boolean;
  ambiguousStatedTotal?: boolean;
  verifications: CartConstraintVerification[];
  cartHardGateState: HardGateState;
  hasCartFailure: boolean;
  rationale: string;
}

export interface ExtractedClaim {
  id: string; // "CL1", "CL2", etc.
  sourceTurnId?: string;
  productId: string | null; // "P1", "P2", or null for response-level claims
  productName?: string | null; // Name of linked product
  claimType: ClaimCategory;
  nature: ClaimNature; // 'factual' vs 'subjective'
  attribute: string; // e.g. "price", "material", "rating", "comfort", "spf"
  operator: string; // e.g. "equals", "contains", "excludes", "suitable_for"
  value: string | number | boolean;
  unit?: string | null; // e.g. "USD", "oz", "SPF", "stars"
  sourceText: string; // exact substring in LLM Output
  confidence: number; // 0.0 to 1.0
  reasoning?: string;
}

export interface ClaimAnalysisSummary {
  totalProducts: number;
  totalClaims: number;
  factualCount: number;
  subjectiveCount: number;
  claimsPerProduct: Record<string, number>;
}

export interface LlmOutputClaimAnalysisResult {
  state: 'CLAIM_ANALYSIS_COMPLETE';
  analyzedAt: string;
  llmOutput: string;
  products: ExtractedProduct[];
  claims: ExtractedClaim[];
  summary: ClaimAnalysisSummary;
  rawJson?: Record<string, unknown>;
}

// ============================================================================
// CHECKPOINT 4: CONSTRAINT-VS-CLAIM VERIFICATION TYPES
// ============================================================================

export type VerificationStatus = 'PASS' | 'FAIL' | 'UNKNOWN';
export type VerificationMethod = 'deterministic' | 'semantic';

export interface ProductConstraintVerification {
  id: string; // e.g. "V1", "V2"
  productId: string; // "P1", "P2"
  productName: string; // "TrailAir Shell"
  constraintId: string; // "C1", "C2"
  constraintAttribute: string; // "price", "weight", "season", etc.
  constraintType: 'hard' | 'soft';
  polarity: 'positive' | 'negative';
  status: VerificationStatus;
  constraintEvidence: string; // e.g. "under $25"
  claimEvidence: string[]; // e.g. ["for $32"]
  reason: string;
  method: VerificationMethod;
  confidence: number;
  conflictDetected?: boolean;
}

export interface ProductVerificationSummary {
  productId: string;
  productName: string;
  totalConstraintsChecked: number;
  hardConstraintsPassed: number;
  hardConstraintsFailed: number;
  hardConstraintsUnknown: number;
  softConstraintsPassed: number;
  softConstraintsFailed: number;
  softConstraintsUnknown: number;
  negativeConstraintsPassed: number;
  negativeConstraintsFailed: number;
  negativeConstraintsUnknown: number;
}

export interface VerificationEngineResult {
  state: 'CONSTRAINT_VERIFICATION_COMPLETE';
  analyzedAt: string;
  records: ProductConstraintVerification[];
  productSummaries: Record<string, ProductVerificationSummary>;
  overallSummary: {
    totalProducts: number;
    totalVerifications: number;
    totalPass: number;
    totalFail: number;
    totalUnknown: number;
    hardPass: number;
    hardFail: number;
    hardUnknown: number;
    softPass: number;
    softFail: number;
    softUnknown: number;
    conflictsCount: number;
  };
  cartEvaluation?: CartEvaluationResult;
  rawJson?: Record<string, unknown>;
}

// ============================================================================
// CHECKPOINT 5: DYNAMIC RUBRIC & HARD-GATE TYPES
// ============================================================================

export type HardGateState = 'HARD_GATE_PASS' | 'HARD_GATE_FAIL' | 'HARD_GATE_INDETERMINATE';
export type SoftPreferenceState = 'EVALUATED' | 'NOT_APPLICABLE' | 'INDETERMINATE';

export interface DynamicRubricCriterion {
  criterionId: string; // e.g. "R1", "R2"
  sourceConstraintId: string; // e.g. "C1", "C2"
  title: string; // e.g. "Price Ceiling", "No Leather Material", "Suitable for Running"
  description: string;
  requirementType: 'hard' | 'soft';
  polarity: 'positive' | 'negative';
  expectedCondition: string; // e.g. "<= $120", "excludes leather", "equals 10"
  sourceEvidence: string; // snippet from User Prompt
  weight: number; // default 1.0
  verificationStatus: VerificationStatus;
  verificationEvidence: string[]; // snippets from LLM Output
  confidence: number;
  reasoning: string;
  conflictDetected?: boolean;
}

export interface HardRequirementSummary {
  totalHardCriteria: number;
  hardPassCount: number;
  hardFailCount: number;
  hardUnknownCount: number;
  hardEvaluatedCoverage: number; // percentage (evaluated / total) * 100
}

export interface SoftPreferenceSummary {
  state: SoftPreferenceState;
  totalSoftCriteria: number;
  softPassCount: number;
  softFailCount: number;
  softUnknownCount: number;
  evaluatedSoftWeight: number;
  unknownSoftWeight: number;
  softPreferenceScore: number | null; // percentage e.g. 100 or null if N/A
}

export interface ProductRubricEvaluation {
  productId: string;
  productName: string;
  criteria: DynamicRubricCriterion[];
  hardGateState: HardGateState;
  hardRequirementSummary: HardRequirementSummary;
  softPreferenceSummary: SoftPreferenceSummary;
  conflicts: {
    criterionId: string;
    attribute: string;
    evidence: string[];
  }[];
  evidenceCompleteness: number; // percentage of criteria with definitive evidence
}

export interface RubricEngineResult {
  state: 'RUBRIC_AND_HARD_GATE_EVALUATION_COMPLETE';
  analyzedAt: string;
  productEvaluations: Record<string, ProductRubricEvaluation>;
  productsList: ProductRubricEvaluation[];
  overallSummary: {
    totalProducts: number;
    productsPassingHardGate: number;
    productsFailingHardGate: number;
    productsIndeterminateHardGate: number;
  };
  rawJson?: Record<string, unknown>;
}

// ============================================================================
// CHECKPOINT 6: CLAIM SUPPORT & HALLUCINATION-RISK TYPES
// ============================================================================

export type ResponseSupportStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'NOT_APPLICABLE';
export type ExternalTruthStatus = 'UNVERIFIED' | 'NOT_APPLICABLE';
export type InternalConsistencyStatus = 'CONSISTENT' | 'CONTRADICTED' | 'NOT_APPLICABLE';
export type VerificationPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ClaimSupportRecord {
  claimId: string; // "CL1", "CL2", etc.
  productId: string | null; // "P1", "P2", etc.
  productName: string | null;
  claimType: ClaimCategory;
  nature: ClaimNature; // 'factual' | 'subjective'
  attribute: string;
  statement: string; // value or formatted statement
  sourceEvidence: string;
  responseSupport: ResponseSupportStatus;
  externalTruthStatus: ExternalTruthStatus;
  internalConsistency: InternalConsistencyStatus;
  verificationPriority: VerificationPriority;
  reason: string;
  contradictingClaimIds?: string[];
}

export interface ProductClaimSupportSummary {
  productId: string;
  productName: string;
  totalClaims: number;
  factualClaims: number;
  subjectiveClaims: number;
  internallyContradictedClaims: number;
  externallyUnverifiedClaims: number;
  highPriorityClaims: number;
  mediumPriorityClaims: number;
  lowPriorityClaims: number;
}

export interface ClaimSupportAnalysisResult {
  state: 'CLAIM_SUPPORT_ANALYSIS_COMPLETE_EXTERNAL_TRUTH_NOT_PERFORMED';
  analyzedAt: string;
  records: ClaimSupportRecord[];
  productSummaries: Record<string, ProductClaimSupportSummary>;
  overallSummary: {
    totalClaims: number;
    factualClaims: number;
    subjectiveClaims: number;
    internallyContradictedClaims: number;
    externallyUnverifiedClaims: number;
    highPriorityClaims: number;
    mediumPriorityClaims: number;
    lowPriorityClaims: number;
  };
  rawJson?: Record<string, unknown>;
}

// ============================================================================
// CHECKPOINT 7: ROOT-CAUSE / FAILURE CLASSIFICATION TYPES
// ============================================================================

export type RootCauseCode =
  | 'HC-01' // HARD_CONSTRAINT_VIOLATION
  | 'NC-01' // NEGATIVE_CONSTRAINT_VIOLATION
  | 'CAT-01' // CATEGORY_MISMATCH
  | 'INT-01' // INTENT_MISMATCH
  | 'RET-01' // INSUFFICIENT_REQUIREMENT_EVIDENCE
  | 'RNK-01' // RANKING_OR_SELECTION_FAILURE
  | 'UFC-01' // UNVERIFIED_FACTUAL_CLAIM (Canonical Checkpoint 8)
  | 'HAL-01' // Legacy alias for UNVERIFIED_FACTUAL_CLAIM
  | 'FAC-01' // INTERNAL_FACTUAL_CONTRADICTION
  | 'DAT-01' // MISSING_EVIDENCE
  | 'SAF-01' // SAFETY_OR_SENSITIVITY_RISK
  | 'FMT-01' // RESPONSE_FORMAT_FAILURE
  | 'NO_FAILURE'; // NO_OBSERVED_FAILURE

export type RootCauseCategory =
  | 'HARD_CONSTRAINT_VIOLATION'
  | 'NEGATIVE_CONSTRAINT_VIOLATION'
  | 'CATEGORY_MISMATCH'
  | 'INTENT_MISMATCH'
  | 'INSUFFICIENT_REQUIREMENT_EVIDENCE'
  | 'RANKING_OR_SELECTION_FAILURE'
  | 'UNVERIFIED_FACTUAL_CLAIM'
  | 'UNSUPPORTED_FACTUAL_CLAIM' // Legacy alias
  | 'INTERNAL_FACTUAL_CONTRADICTION'
  | 'MISSING_EVIDENCE'
  | 'SAFETY_OR_SENSITIVITY_RISK'
  | 'RESPONSE_FORMAT_FAILURE'
  | 'NO_OBSERVED_FAILURE';

export type RootCauseRole = 'primary' | 'contributing';

export interface RootCauseRecord {
  causeId: string; // e.g. "RC1", "RC2"
  code: RootCauseCode;
  category: RootCauseCategory;
  role: RootCauseRole;
  productId: string | null;
  productName: string | null;
  constraintIds: string[];
  claimIds: string[];
  verificationIds: string[];
  rubricCriterionIds: string[];
  shopperEvidence: string[];
  assistantEvidence: string[];
  explanation: string;
  confidence: number;
}

export interface ProductRootCauseSummary {
  productId: string;
  productName: string;
  primaryCauses: RootCauseRecord[];
  contributingCauses: RootCauseRecord[];
  observedHardFailures: number;
  observedUnknownRequirements: number;
  unsupportedMaterialClaims: number;
  internalContradictions: number;
  safetyRelevantIssues: number;
  diagnosticConfidence: number;
  hasObservedFailure: boolean;
}

export interface RootCauseAnalysisResult {
  state: 'ROOT_CAUSE_ANALYSIS_COMPLETE_RECOMMENDATIONS_NOT_YET_GENERATED';
  analyzedAt: string;
  records: RootCauseRecord[];
  productSummaries: Record<string, ProductRootCauseSummary>;
  productsList: ProductRootCauseSummary[];
  overallSummary: {
    totalDiagnosedIssues: number;
    primaryIssuesCount: number;
    contributingIssuesCount: number;
    productsWithFailures: number;
    productsIndeterminate: number;
    productsWithNoObservedFailure: number;
    totalContradictions: number;
    totalSafetyRisks: number;
  };
  rawJson?: Record<string, unknown>;
}

// ============================================================================
// CHECKPOINT 8: SEVERITY CLASSIFICATION & TRANSPARENT SCORING TYPES
// ============================================================================

export type SeverityRating =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'INFORMATIONAL'
  | 'NONE'
  | 'INDETERMINATE';

export interface ProductSeverityResult {
  productId: string;
  productName: string;
  severity: SeverityRating;
  severityDrivers: string[]; // e.g. ["RC1", "RC2"]
  driverCodes: RootCauseCode[];
  confirmedFailureCount: number;
  indeterminateIssueCount: number;
  informationalIssueCount: number;
  explanation: string;
  confidence: number;
}

export interface ResponseSeveritySummary {
  overallSeverity: SeverityRating;
  criticalProducts: number;
  highProducts: number;
  mediumProducts: number;
  lowProducts: number;
  informationalProducts: number;
  noneProducts: number;
  indeterminateProducts: number;
  severityDistribution: Record<SeverityRating, number>;
  primaryExplanation: string;
}

export interface ProductEvaluationScore {
  productId: string;
  productName: string;

  // A. Hard Requirement Satisfaction & Decomposition
  hardSatisfaction: {
    passedHard: number;
    failedHard: number;
    unknownHard: number;
    totalHard: number;
    confirmedHardSatisfactionPercent: number; // passedHard / totalHard * 100
    hardSatisfactionRate: number; // alias for confirmedHardSatisfactionPercent
    hardEvidenceCoveragePercent: number; // (passedHard + failedHard) / totalHard * 100
    confirmedHardFailurePercent: number; // failedHard / totalHard * 100
    hardUnknownPercent: number; // unknownHard / totalHard * 100
  };

  // B. Soft Preference Satisfaction
  softSatisfaction: {
    state: SoftPreferenceState;
    passedSoft: number;
    failedSoft: number;
    unknownSoft: number;
    totalSoft: number;
    softPreferenceScorePercent: number | null;
  };

  // C. Evidence Completeness
  evidenceCompleteness: {
    addressedCriteria: number;
    missingCriteria: number;
    totalCriteria: number;
    evidenceCompletenessPercent: number;
  };

  // D. Diagnostic Severity
  diagnosticSeverity: {
    severity: SeverityRating;
    severityDrivers: string[];
    hasConfirmedHardFailure: boolean;
  };

  // E. External Verification Context
  externalVerificationContext: {
    unverifiedMaterialClaimsCount: number;
    label: 'EXTERNAL_VERIFICATION_PENDING';
    note: string;
  };

  // Composite Evaluated Evidence Score (0–100 or null if not enough evidence)
  evaluatedEvidenceScore: number | null;
  scoreStatus: 'CALCULATED' | 'NOT_ENOUGH_EVIDENCE' | 'HARD_GATE_FAILED';
  scoreFormulaDescription: string;
}

export interface SeverityAndScoringResult {
  state: 'SEVERITY_AND_SCORING_COMPLETE_RECOMMENDATIONS_NOT_YET_GENERATED';
  analyzedAt: string;
  responseSeverity: ResponseSeveritySummary;
  productSeverities: Record<string, ProductSeverityResult>;
  productScores: Record<string, ProductEvaluationScore>;
  productsList: {
    productId: string;
    productName: string;
    severity: ProductSeverityResult;
    score: ProductEvaluationScore;
  }[];
  overallSummary: {
    overallSeverity: SeverityRating;
    evaluatedEvidenceScore: number | null;
    totalProducts: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    informationalCount: number;
    noneCount: number;
    indeterminateCount: number;
  };
  rawJson?: Record<string, unknown>;
}

// ============================================================================
// CHECKPOINT 9: ACTIONABLE RECOMMENDATIONS & REMEDIATION TYPES
// ============================================================================

export type RecommendationType =
  | 'CORRECT_OR_REPLACE'
  | 'PROVIDE_OR_OBTAIN_EVIDENCE'
  | 'VERIFY_EXTERNAL_FACT'
  | 'RESOLVE_CONTRADICTION'
  | 'IMPROVE_INTENT_ALIGNMENT'
  | 'HONOR_NEGATIVE_CONSTRAINT'
  | 'ADDRESS_SAFETY_SENSITIVITY'
  | 'IMPROVE_PRODUCT_SELECTION'
  | 'IMPROVE_RANKING'
  | 'IMPROVE_RESPONSE_FORMAT'
  | 'NO_REMEDIATION_REQUIRED';

export type RecommendationPriority =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'INFORMATIONAL'
  | 'NONE';

export interface ActionableRecommendation {
  recommendationId: string; // e.g. "REC1", "REC2"
  productId: string | null; // "P1", "P2" or null for response-level
  productName: string | null;

  type: RecommendationType;
  priority: RecommendationPriority;

  title: string;
  action: string;
  reason: string;

  shopperEvidence: string[];
  assistantEvidence: string[];

  constraintIds: string[];
  claimIds: string[];
  verificationIds: string[];
  rubricCriterionIds: string[];
  rootCauseIds: string[];

  confidence: number;
}

export interface ProductRecommendationSummary {
  productId: string;
  productName: string;
  recommendations: ActionableRecommendation[];
  totalRecommendations: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  informationalCount: number;
  noneCount: number;
  requiresCorrection: boolean;
  requiresMoreEvidence: boolean;
  requiresExternalVerification: boolean;
  hasNoRequirementRemediation: boolean;
}

export interface RecommendationResponseSummary {
  totalRecommendations: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  none: number;
  productsRequiringCorrection: number;
  productsRequiringMoreEvidence: number;
  productsWithNoRequirementRemediation: number;
}

export interface RecommendationEngineResult {
  state: 'RECOMMENDATIONS_COMPLETE_FINAL_EVALUATION_NOT_YET_GENERATED';
  analyzedAt: string;
  recommendations: ActionableRecommendation[];
  productSummaries: Record<string, ProductRecommendationSummary>;
  productsList: ProductRecommendationSummary[];
  overallSummary: RecommendationResponseSummary;
  rawJson?: Record<string, unknown>;
}

// ============================================================================
// CHECKPOINT 10: FINAL INTEGRATED EVALUATION & VERDICT TYPES
// ============================================================================

export type FinalVerdictState = 'PASS' | 'FAIL' | 'INDETERMINATE';

export type ResultTab =
  | 'overview'
  | 'constraints'
  | 'claims'
  | 'rubric'
  | 'root_cause'
  | 'severity_scoring'
  | 'recommendations'
  | 'final_evaluation'
  | 'raw_json'
  | 'report_export';

export interface ProductFinalVerdict {
  productId: string;
  productName: string;
  verdict: FinalVerdictState;
  hardGateState: HardGateState;
  severity: SeverityRating;
  evaluatedEvidenceScore: number | null;
  evaluatedEvidenceStatus: 'CALCULATED' | 'NOT_ENOUGH_EVIDENCE' | 'HARD_GATE_FAILED';
  passedHardCount: number;
  failedHardCount: number;
  unknownHardCount: number;
  totalHardCount: number;
  confirmedHardSatisfactionPercent: number;
  rationale: string;
  keyRootCauseCodes: RootCauseCode[];
  keyRootCauseIds: string[];
  remediationSummary: string;
  recommendationCount: number;
  topRecommendationIds: string[];
}

export interface RequirementCoverageItem {
  constraintId: string;
  sourceText: string;
  attribute: string;
  polarity: 'positive' | 'negative';
  type: 'hard' | 'soft';
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  evidenceInOutput: string[];
  productName: string;
}

export interface ClaimContextSummary {
  totalExtractedClaims: number;
  internallySupportedClaims: number;
  internallyContradictedClaims: number;
  externallyUnverifiedFactualClaims: number;
  externalVerificationExplicitNote: string; // "UNVERIFIED claims are not assumed false."
}

export interface FinalEvaluationSummary {
  finalVerdict: FinalVerdictState;
  verdictRationale: string;
  totalProductsEvaluated: number;
  hardGateDistribution: {
    pass: number;
    fail: number;
    indeterminate: number;
  };
  overallSeverity: SeverityRating;
  averageEvaluatedEvidenceScore: number | null;
  totalConfirmedFailures: number;
  totalUnresolvedUnknown: number;
  totalUnverifiedFactualClaims: number;
  unknownExplicitNote: string; // "UNKNOWN requirements are not counted as failures."
  cartHardGateState?: HardGateState;
  cartTotal?: number | null;
  cartBudgetLimit?: number | null;
}

export interface TraceabilityReferenceItem {
  productId: string;
  productName: string;
  constraintIds: string[];
  claimIds: string[];
  verificationIds: string[];
  rubricCriterionIds: string[];
  rootCauseIds: string[];
  recommendationIds: string[];
}

export interface FinalEvaluationResult {
  state: 'FINAL_INTEGRATED_EVALUATION_COMPLETE';
  evaluatedAt: string;
  finalVerdict: FinalVerdictState;
  verdictRationale: string;
  hardGateAuthoritative: boolean; // strictly true
  summary: FinalEvaluationSummary;
  productVerdicts: ProductFinalVerdict[];
  cartEvaluation?: CartEvaluationResult;
  requirementCoverage: {
    confirmedSatisfied: RequirementCoverageItem[];
    confirmedFailed: RequirementCoverageItem[];
    unknownRequirements: RequirementCoverageItem[];
    disclaimer: string; // "UNKNOWN requirements are not counted as failures."
  };
  claimContext: ClaimContextSummary;
  rootCauseSummary: {
    primaryCauses: RootCauseRecord[];
    contributingCauses: RootCauseRecord[];
    allCauses: RootCauseRecord[];
  };
  prioritizedNextActions: ActionableRecommendation[];
  traceability: TraceabilityReferenceItem[];
  rawJson?: Record<string, unknown>;
}

// ============================================================================
// AGGREGATE APPLICATION STATE (CHECKPOINTS 7, 8, 9 & 10)
// ============================================================================

export type ApplicationEvaluationState =
  | 'IDLE_AWAITING_INPUT'
  | 'PROMPT_ANALYSIS_COMPLETE_FULL_EVALUATION_NOT_YET_RUN'
  | 'PROMPT_AND_CLAIM_ANALYSIS_COMPLETE_FULL_EVALUATION_NOT_YET_RUN'
  | 'CONSTRAINT_VERIFICATION_COMPLETE_FINAL_SCORING_NOT_YET_RUN'
  | 'RUBRIC_AND_HARD_GATE_EVALUATION_COMPLETE_FULL_EVALUATION_NOT_YET_RUN'
  | 'CLAIM_SUPPORT_ANALYSIS_COMPLETE_EXTERNAL_TRUTH_NOT_PERFORMED_FULL_EVALUATION_NOT_YET_RUN'
  | 'ROOT_CAUSE_ANALYSIS_COMPLETE_RECOMMENDATIONS_NOT_YET_GENERATED_FULL_EVALUATION_NOT_YET_RUN'
  | 'SEVERITY_AND_SCORING_COMPLETE_RECOMMENDATIONS_NOT_YET_GENERATED'
  | 'RECOMMENDATIONS_COMPLETE_FINAL_EVALUATION_NOT_YET_GENERATED'
  | 'FINAL_INTEGRATED_EVALUATION_COMPLETE'
  | 'FULL_EVALUATION_COMPLETE'
  | 'ERROR';

export interface CombinedAnalysisResult {
  state: ApplicationEvaluationState;
  analyzedAt: string;
  userPrompt: string;
  llmOutput: string;
  promptAnalysis: UserPromptAnalysisResult;
  claimAnalysis: LlmOutputClaimAnalysisResult;
  verificationResult?: VerificationEngineResult;
  rubricResult?: RubricEngineResult;
  claimSupportResult?: ClaimSupportAnalysisResult;
  rootCauseResult?: RootCauseAnalysisResult;
  severityAndScoringResult?: SeverityAndScoringResult;
  recommendationResult?: RecommendationEngineResult;
  finalEvaluationResult?: FinalEvaluationResult;
}

// Backward compatibility types for legacy stubs
export type VerdictType = 'PASS' | 'CONDITIONAL_PASS' | 'FAIL' | 'CRITICAL_FAIL' | 'PENDING';
export type SeverityLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNEVALUATED';
export type ConstraintStatus = 'satisfied' | 'violated' | 'partially_satisfied' | 'unaddressed' | 'unknown' | 'pending_audit';
export type ClaimVerificationStatus = 'verified' | 'unverifiable' | 'contradicted' | 'exaggerated' | 'untested';

export interface HardConstraintItem {
  id: string;
  category: 'budget' | 'brand' | 'category' | 'attribute' | 'quantity' | 'shipping' | 'negative_constraint' | 'other';
  description: string;
  extractedFrom: 'user_prompt';
  targetValue?: string;
  status: ConstraintStatus;
  evidenceInOutput?: string;
  isHardRequirement: boolean;
}

export interface IntentAlignmentData {
  primaryGoal: string;
  shoppingContext: string;
  detectedCategories: string[];
  alignmentScore?: number;
  notes?: string;
}

export interface ClaimItem {
  id: string;
  claimText: string;
  claimType: 'product_attribute' | 'price' | 'availability' | 'performance' | 'compatibility' | 'policy';
  verificationStatus: ClaimVerificationStatus;
  confidence?: number;
  verificationSource?: string;
  flaggedIssue?: string;
}

export interface RubricCriterion {
  id: string;
  dimension: string;
  description: string;
  weight: number;
  maxScore: number;
  awardedScore?: number;
  evaluationNote?: string;
}

export interface RootCauseFactor {
  id: string;
  failureCategory: 'hallucination' | 'instruction_drift' | 'budget_overflow' | 'format_noncompliance' | 'overgeneralization' | 'unsupported_assumptions' | 'none';
  title: string;
  detail: string;
  impactLevel: 'minor' | 'moderate' | 'severe';
}

export interface RecommendationItem {
  id: string;
  category: 'prompt_engineering' | 'guardrail' | 'retrieval_filtering' | 'catalog_grounding' | 'response_formatting';
  priority: 'low' | 'medium' | 'high' | 'critical';
  actionableStep: string;
  rationale: string;
}

export interface EvaluationResult {
  evaluatedAt?: string;
  verdict: VerdictType;
  overallScore: number | null;
  severity: SeverityLevel;
  hardConstraintStatus: {
    total: number;
    satisfied: number;
    violated: number;
    unaddressed: number;
  };
  intentAlignment: IntentAlignmentData | null;
  constraints: HardConstraintItem[];
  claims: ClaimItem[];
  rubric: RubricCriterion[];
  rootCauses: RootCauseFactor[];
  recommendations: RecommendationItem[];
  rawJson?: Record<string, unknown> | null;
}
