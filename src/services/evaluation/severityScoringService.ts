import {
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  VerificationEngineResult,
  RubricEngineResult,
  ClaimSupportAnalysisResult,
  RootCauseAnalysisResult,
  SeverityAndScoringResult,
  ProductSeverityResult,
  ProductEvaluationScore,
  ExtractedProduct,
  SeverityRating,
} from '../../types/evaluation';
import {
  classifyProductSeverity,
  classifyResponseSeverity,
} from './severityClassifier';
import {
  computeAllProductEvaluationScores,
} from './scoringEngine';

/**
 * Service to execute Checkpoint 8: Severity Classification & Transparent Product Scoring.
 * Evaluates risk severity and transparent multidimensional evidence scores without allowing
 * numeric metrics to override authoritative hard requirements.
 */
export async function runSeverityAndScoringAnalysis(
  promptAnalysis: UserPromptAnalysisResult,
  claimAnalysis: LlmOutputClaimAnalysisResult,
  verificationResult: VerificationEngineResult,
  rubricResult: RubricEngineResult,
  claimSupportResult: ClaimSupportAnalysisResult,
  rootCauseResult: RootCauseAnalysisResult
): Promise<SeverityAndScoringResult> {
  const products: ExtractedProduct[] = claimAnalysis.products.length > 0
    ? claimAnalysis.products
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

  const productSeverities: Record<string, ProductSeverityResult> = {};
  const productsList: {
    productId: string;
    productName: string;
    severity: ProductSeverityResult;
    score: ProductEvaluationScore;
  }[] = [];

  // Step 1: Compute product-level severities
  for (const product of products) {
    const pId = product.id;
    const pName = product.name;

    const pVerifs = verificationResult.records.filter(
      (v) =>
        v.productId === pId ||
        (v.productName && pName && v.productName.toLowerCase() === pName.toLowerCase()) ||
        (products.length === 1 && (!v.productId || v.productId === 'P1'))
    );

    const pRubric =
      rubricResult.productEvaluations[pId] ||
      rubricResult.productEvaluations[pName] ||
      rubricResult.productsList.find(
        (p) => p.productId === pId || (p.productName && pName && p.productName.toLowerCase() === pName.toLowerCase())
      );

    const pCauses = rootCauseResult.records.filter(
      (rc) => rc.productId === pId || (products.length === 1 && !rc.productId)
    );

    const severityResult = classifyProductSeverity(
      product,
      pVerifs,
      pRubric,
      pCauses,
      promptAnalysis
    );

    productSeverities[pId] = severityResult;
  }

  // Step 2: Compute response-level severity summary
  const responseSeverity = classifyResponseSeverity(productSeverities, products);

  // Step 3: Compute multidimensional product scores
  const productScores = computeAllProductEvaluationScores(
    products,
    verificationResult.records,
    rubricResult.productEvaluations,
    productSeverities,
    claimSupportResult.records
  );

  // Build unified list
  for (const product of products) {
    const pId = product.id;
    productsList.push({
      productId: pId,
      productName: product.name,
      severity: productSeverities[pId],
      score: productScores[pId],
    });
  }

  // Average evaluated evidence score across products (ignoring nulls)
  const validScores = Object.values(productScores)
    .map((s) => s.evaluatedEvidenceScore)
    .filter((s): s is number => s !== null);

  const evaluatedEvidenceScore = validScores.length > 0
    ? Math.round(validScores.reduce((acc, v) => acc + v, 0) / validScores.length)
    : null;

  const overallSeverity = responseSeverity.overallSeverity;

  return {
    state: 'SEVERITY_AND_SCORING_COMPLETE_RECOMMENDATIONS_NOT_YET_GENERATED',
    analyzedAt: new Date().toISOString(),
    responseSeverity,
    productSeverities,
    productScores,
    productsList,
    overallSummary: {
      overallSeverity,
      evaluatedEvidenceScore,
      totalProducts: products.length,
      criticalCount: responseSeverity.criticalProducts,
      highCount: responseSeverity.highProducts,
      mediumCount: responseSeverity.mediumProducts,
      lowCount: responseSeverity.lowProducts,
      informationalCount: responseSeverity.informationalProducts,
      noneCount: responseSeverity.noneProducts,
      indeterminateCount: responseSeverity.indeterminateProducts,
    },
    rawJson: {
      responseSeverity,
      productSeverities,
      productScores,
      metadata: {
        engine: 'checkpoint-8-severity-scoring-v1',
        totalProductsEvaluated: products.length,
        hardGateAuthoritative: true,
        recommendationsGenerated: false,
      },
    },
  };
}
