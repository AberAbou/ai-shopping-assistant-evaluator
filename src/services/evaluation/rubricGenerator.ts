import {
  AtomicConstraint,
  ExtractedProduct,
  ProductConstraintVerification,
  VerificationEngineResult,
  DynamicRubricCriterion,
  ProductRubricEvaluation,
  RubricEngineResult,
  HardGateState,
  SoftPreferenceState,
} from '../../types/evaluation';

/**
 * Generates an auditable, dynamic rubric criterion title and description from an atomic constraint.
 */
function createCriterionTemplate(
  constraint: AtomicConstraint,
  index: number
): Omit<DynamicRubricCriterion, 'verificationStatus' | 'verificationEvidence' | 'confidence' | 'reasoning' | 'conflictDetected'> {
  const attr = constraint.attribute.toLowerCase();
  const val = String(constraint.expectedValue);
  const isNegative = constraint.polarity === 'negative';

  let title = '';
  let description = '';

  if (attr === 'price' || attr === 'budget') {
    title = 'Price Ceiling';
    description = `Product purchase price must be ${constraint.operator} $${val} as requested ("${constraint.sourceText}").`;
  } else if (isNegative && (attr === 'leather' || val.toLowerCase() === 'leather')) {
    title = 'No Leather Material';
    description = `Product must strictly exclude animal leather ("${constraint.sourceText}").`;
  } else if (isNegative && (attr === 'fragrance' || val.toLowerCase().includes('fragrance'))) {
    title = 'Fragrance-Free Formulation';
    description = `Product must be free of added artificial or synthetic fragrances ("${constraint.sourceText}").`;
  } else if (attr === 'skin_type' || val.toLowerCase().includes('sensitive skin')) {
    title = 'Sensitive Skin Suitability';
    description = `Product must be formulated for and safe for sensitive skin ("${constraint.sourceText}").`;
  } else if (attr === 'formulation' || val.toLowerCase() === 'organic') {
    title = 'Organic Formulation';
    description = `Product must feature organic ingredients or certification ("${constraint.sourceText}").`;
  } else if (attr === 'size') {
    title = `Size ${val.toUpperCase()} Availability`;
    description = `Product must be available in requested size ${val} ("${constraint.sourceText}").`;
  } else if (attr === 'season' || val.toLowerCase() === 'summer') {
    title = `Suitable for ${val.charAt(0).toUpperCase() + val.slice(1)}`;
    description = `Product must be suitable for ${val} climate and weather conditions ("${constraint.sourceText}").`;
  } else if (attr === 'use_case' || constraint.operator === 'suitable_for') {
    title = `Suitable for ${val.charAt(0).toUpperCase() + val.slice(1)}`;
    description = `Product must be suitable for intended activity: ${val} ("${constraint.sourceText}").`;
  } else if (attr === 'weight' || val.toLowerCase() === 'lightweight') {
    title = 'Lightweight Construction';
    description = `Product must feature lightweight build ("${constraint.sourceText}").`;
  } else if (attr === 'breathability' || val.toLowerCase() === 'breathable') {
    title = 'Breathable Fabric';
    description = `Product must feature breathable material for ventilation ("${constraint.sourceText}").`;
  } else if (attr === 'water_resistance' || val.toLowerCase() === 'waterproof') {
    title = 'Waterproof Protection';
    description = `Product must offer waterproof barrier protection ("${constraint.sourceText}").`;
  } else if (attr === 'color') {
    title = `${val.charAt(0).toUpperCase() + val.slice(1)} Color Preference`;
    description = `Product should be available in requested color: ${val} ("${constraint.sourceText}").`;
  } else {
    title = `${attr.charAt(0).toUpperCase() + attr.slice(1)} Requirement`;
    description = `Product must satisfy ${attr} requirement: ${constraint.operator} ${val} ("${constraint.sourceText}").`;
  }

  return {
    criterionId: `R${index + 1}`,
    sourceConstraintId: constraint.id,
    title,
    description,
    requirementType: constraint.constraintType,
    polarity: constraint.polarity,
    expectedCondition: `${constraint.operator} ${val}`,
    sourceEvidence: constraint.sourceText,
    weight: 1.0,
  };
}

/**
 * Evaluates rubric criteria and calculates deterministic hard-gate and soft-preference outcomes for a single product.
 */
function evaluateProductRubric(
  product: ExtractedProduct,
  criterionTemplates: ReturnType<typeof createCriterionTemplate>[],
  verificationRecords: ProductConstraintVerification[]
): ProductRubricEvaluation {
  const pId = product.id;
  const pName = product.name;

  const productRecords = verificationRecords.filter((r) => r.productId === pId);

  const criteria: DynamicRubricCriterion[] = criterionTemplates.map((template) => {
    const record = productRecords.find((r) => r.constraintId === template.sourceConstraintId);

    if (!record) {
      return {
        ...template,
        verificationStatus: 'UNKNOWN',
        verificationEvidence: [],
        confidence: 0.5,
        reasoning: 'No verification record found for this constraint.',
      };
    }

    return {
      ...template,
      verificationStatus: record.status,
      verificationEvidence: record.claimEvidence,
      confidence: record.confidence,
      reasoning: record.reason,
      conflictDetected: record.conflictDetected,
    };
  });

  // 1. Hard-Gate Calculation (Strictly Deterministic)
  const hardCriteria = criteria.filter((c) => c.requirementType === 'hard');
  const hardPassCount = hardCriteria.filter((c) => c.verificationStatus === 'PASS').length;
  const hardFailCount = hardCriteria.filter((c) => c.verificationStatus === 'FAIL').length;
  const hardUnknownCount = hardCriteria.filter((c) => c.verificationStatus === 'UNKNOWN').length;

  let hardGateState: HardGateState = 'HARD_GATE_PASS';
  if (hardFailCount > 0) {
    hardGateState = 'HARD_GATE_FAIL';
  } else if (hardUnknownCount > 0) {
    hardGateState = 'HARD_GATE_INDETERMINATE';
  } else if (hardCriteria.length === 0) {
    hardGateState = 'HARD_GATE_PASS';
  }

  const hardEvaluatedCoverage = hardCriteria.length > 0
    ? Math.round(((hardPassCount + hardFailCount) / hardCriteria.length) * 100)
    : 100;

  // 2. Soft-Preference Scoring (Deterministic, separate from hard gate)
  const softCriteria = criteria.filter((c) => c.requirementType === 'soft');
  const softPassCount = softCriteria.filter((c) => c.verificationStatus === 'PASS').length;
  const softFailCount = softCriteria.filter((c) => c.verificationStatus === 'FAIL').length;
  const softUnknownCount = softCriteria.filter((c) => c.verificationStatus === 'UNKNOWN').length;

  let softState: SoftPreferenceState = 'NOT_APPLICABLE';
  let softPreferenceScore: number | null = null;
  const evaluatedSoftWeight = softPassCount + softFailCount;
  const unknownSoftWeight = softUnknownCount;

  if (softCriteria.length > 0) {
    if (evaluatedSoftWeight > 0) {
      softState = 'EVALUATED';
      softPreferenceScore = Math.round((softPassCount / evaluatedSoftWeight) * 100);
    } else {
      softState = 'INDETERMINATE';
      softPreferenceScore = null;
    }
  }

  // 3. Conflicts Preservation
  const conflicts = criteria
    .filter((c) => c.conflictDetected)
    .map((c) => ({
      criterionId: c.criterionId,
      attribute: c.title,
      evidence: c.verificationEvidence,
    }));

  // 4. Overall Evidence Completeness
  const evaluatedTotal = criteria.filter((c) => c.verificationStatus === 'PASS' || c.verificationStatus === 'FAIL').length;
  const evidenceCompleteness = criteria.length > 0
    ? Math.round((evaluatedTotal / criteria.length) * 100)
    : 100;

  return {
    productId: pId,
    productName: pName,
    criteria,
    hardGateState,
    hardRequirementSummary: {
      totalHardCriteria: hardCriteria.length,
      hardPassCount,
      hardFailCount,
      hardUnknownCount,
      hardEvaluatedCoverage,
    },
    softPreferenceSummary: {
      state: softState,
      totalSoftCriteria: softCriteria.length,
      softPassCount,
      softFailCount,
      softUnknownCount,
      evaluatedSoftWeight,
      unknownSoftWeight,
      softPreferenceScore,
    },
    conflicts,
    evidenceCompleteness,
  };
}

/**
 * Dynamic Rubric Engine:
 * Generates an evaluation rubric from shopper constraints and calculates product-specific rubric outcomes.
 */
export function generateAndEvaluateRubrics(
  constraints: AtomicConstraint[],
  products: ExtractedProduct[],
  verificationResult: VerificationEngineResult
): RubricEngineResult {
  // Generate the rubric criteria templates from shopper constraints
  const criterionTemplates = constraints.map((c, idx) => createCriterionTemplate(c, idx));

  const effectiveProducts = products.length > 0
    ? products
    : [
        {
          id: 'P1',
          name: 'General Recommendation',
          brand: null,
          category: null,
          price: null,
          quantity: null,
          size: null,
          colors: [],
          materials: [],
          attributes: [],
          suitability: [],
          safetyOrSensitivity: [],
          availability: null,
          rating: null,
          shippingOrDelivery: null,
          warrantyOrReturns: null,
          evidenceMap: {},
        },
      ];

  const productEvaluations: Record<string, ProductRubricEvaluation> = {};
  const productsList: ProductRubricEvaluation[] = [];

  let passGate = 0;
  let failGate = 0;
  let indetGate = 0;

  for (const product of effectiveProducts) {
    const evaluation = evaluateProductRubric(product, criterionTemplates, verificationResult.records);
    productEvaluations[product.id] = evaluation;
    productsList.push(evaluation);

    if (evaluation.hardGateState === 'HARD_GATE_PASS') passGate++;
    else if (evaluation.hardGateState === 'HARD_GATE_FAIL') failGate++;
    else indetGate++;
  }

  return {
    state: 'RUBRIC_AND_HARD_GATE_EVALUATION_COMPLETE',
    analyzedAt: new Date().toISOString(),
    productEvaluations,
    productsList,
    overallSummary: {
      totalProducts: effectiveProducts.length,
      productsPassingHardGate: passGate,
      productsFailingHardGate: failGate,
      productsIndeterminateHardGate: indetGate,
    },
    rawJson: {
      productEvaluations,
      metadata: {
        engine: 'dynamic-rubric-hard-gate-v1',
        totalProductsEvaluated: effectiveProducts.length,
      },
    },
  };
}

export const defaultRubricGenerator = {
  generateRubric: async (_userPrompt: string) => [],
  scoreRubric: async (_rubric: any[], _llmOutput: string) => [],
  generateAndEvaluateRubrics,
};

