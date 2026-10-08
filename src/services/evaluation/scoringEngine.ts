import {
  ExtractedProduct,
  ProductConstraintVerification,
  ProductRubricEvaluation,
  ProductEvaluationScore,
  ProductSeverityResult,
  SeverityRating,
  ClaimSupportRecord,
} from '../../types/evaluation';

/**
 * Computes transparent, multidimensional evaluation metrics and deterministic
 * Evaluated Evidence Score for a single product.
 *
 * CRITICAL PRINCIPLES:
 * 1. Hard-gate state remains strictly authoritative; numeric score CANNOT override hard gate.
 * 2. UNKNOWN is treated as insufficient evidence, NEVER penalized as confirmed FAIL.
 * 3. UNVERIFIED external claims are tracked as verification context, NEVER scored as false.
 */
export function computeProductEvaluationScore(
  product: ExtractedProduct,
  productVerifications: ProductConstraintVerification[],
  productRubric: ProductRubricEvaluation | undefined,
  productSeverity: ProductSeverityResult,
  productClaims: ClaimSupportRecord[]
): ProductEvaluationScore {
  const pId = product.id;
  const pName = product.name;

  // A. Hard Requirement Satisfaction & Decomposition
  const hardVerifications = productVerifications.filter((v) => v.constraintType === 'hard');
  const passedHard = hardVerifications.filter((v) => v.status === 'PASS').length;
  const failedHard = hardVerifications.filter((v) => v.status === 'FAIL').length;
  const unknownHard = hardVerifications.filter((v) => v.status === 'UNKNOWN').length;
  const totalHard = hardVerifications.length;

  const confirmedHardSatisfactionPercent = totalHard > 0
    ? Math.round((passedHard / totalHard) * 100)
    : 100;

  const confirmedHardFailurePercent = totalHard > 0
    ? Math.round((failedHard / totalHard) * 100)
    : 0;

  const hardUnknownPercent = totalHard > 0
    ? Math.max(0, 100 - confirmedHardSatisfactionPercent - confirmedHardFailurePercent)
    : 0;

  const hardEvidenceCoveragePercent = totalHard > 0
    ? Math.round(((passedHard + failedHard) / totalHard) * 100)
    : 100;

  const hardSatisfactionRate = confirmedHardSatisfactionPercent;

  // B. Soft Preference Satisfaction
  const softSummary = productRubric?.softPreferenceSummary;
  const softSatisfaction = {
    state: softSummary?.state || 'NOT_APPLICABLE',
    passedSoft: softSummary?.softPassCount || 0,
    failedSoft: softSummary?.softFailCount || 0,
    unknownSoft: softSummary?.softUnknownCount || 0,
    totalSoft: softSummary?.totalSoftCriteria || 0,
    softPreferenceScorePercent: softSummary?.softPreferenceScore ?? null,
  };

  // C. Evidence Completeness
  const totalCriteria = productRubric?.criteria?.length || productVerifications.length;
  const addressedCriteria = productRubric
    ? productRubric.criteria.filter((c) => c.verificationStatus === 'PASS' || c.verificationStatus === 'FAIL').length
    : productVerifications.filter((v) => v.status === 'PASS' || v.status === 'FAIL').length;
  const missingCriteria = totalCriteria - addressedCriteria;

  const evidenceCompletenessPercent = totalCriteria > 0
    ? Math.round((addressedCriteria / totalCriteria) * 100)
    : 100;

  // D. Diagnostic Severity
  const diagnosticSeverity = {
    severity: productSeverity.severity,
    severityDrivers: productSeverity.severityDrivers,
    hasConfirmedHardFailure: failedHard > 0,
  };

  // E. External Verification Context
  const unverifiedMaterialClaimsCount = productClaims.filter(
    (c) => c.externalTruthStatus === 'UNVERIFIED' && c.verificationPriority === 'HIGH'
  ).length;

  const externalVerificationContext = {
    unverifiedMaterialClaimsCount,
    label: 'EXTERNAL_VERIFICATION_PENDING' as const,
    note: 'Independent external factual verification has not been performed in this context; UNVERIFIED factual claims are not assumed false.',
  };

  // Evaluated Evidence Score Calculation
  let evaluatedEvidenceScore: number | null = null;
  let scoreStatus: 'CALCULATED' | 'NOT_ENOUGH_EVIDENCE' | 'HARD_GATE_FAILED' = 'CALCULATED';
  let scoreFormulaDescription = '';

  const isHardGateFail = productRubric?.hardGateState === 'HARD_GATE_FAIL' || failedHard > 0;
  const hasZeroHardEvidence = totalHard > 0 && passedHard === 0 && failedHard === 0;

  if (hasZeroHardEvidence) {
    evaluatedEvidenceScore = null;
    scoreStatus = 'NOT_ENOUGH_EVIDENCE';
    scoreFormulaDescription = 'NOT ENOUGH EVIDENCE: 0% hard requirement coverage available in assistant response. All hard requirements remain UNKNOWN. UNKNOWN is not counted as failure.';
  } else if (isHardGateFail) {
    // Hard gate failure is authoritative; numeric score is NOT capped with an arbitrary 45 cap/multiplier.
    evaluatedEvidenceScore = confirmedHardSatisfactionPercent;
    scoreStatus = 'HARD_GATE_FAILED';
    const failWord = failedHard === 1 ? '1 requirement is confirmed FAIL' : `${failedHard} requirements are confirmed FAIL`;
    const unkWord = unknownHard === 1 ? '1 remains UNKNOWN' : `${unknownHard} remain UNKNOWN`;
    scoreFormulaDescription = `EVALUATED EVIDENCE SCORE: ${evaluatedEvidenceScore}/100 based on confirmed satisfaction of ${passedHard} of ${totalHard} hard requirements. ${failWord} and ${unkWord}. HARD_GATE_FAIL remains authoritative regardless of numeric score.`;
  } else if (unknownHard > 0) {
    evaluatedEvidenceScore = confirmedHardSatisfactionPercent;
    scoreStatus = 'CALCULATED';
    const unkWord = unknownHard === 1 ? '1 remains UNKNOWN' : `${unknownHard} remain UNKNOWN`;
    scoreFormulaDescription = `EVALUATED EVIDENCE SCORE: ${evaluatedEvidenceScore}/100 based on confirmed satisfaction of ${passedHard} of ${totalHard} hard requirements. Of the remaining requirements, ${failedHard} are confirmed failures and ${unkWord}. UNKNOWN is not treated as FAIL.`;
  } else {
    evaluatedEvidenceScore = confirmedHardSatisfactionPercent;
    scoreStatus = 'CALCULATED';
    scoreFormulaDescription = `EVALUATED EVIDENCE SCORE: 100% Hard Requirement Satisfaction (${passedHard}/${totalHard} verified pass = ${evaluatedEvidenceScore}/100). All stated hard requirements were evaluated and satisfied.`;
  }

  return {
    productId: pId,
    productName: pName,
    hardSatisfaction: {
      passedHard,
      failedHard,
      unknownHard,
      totalHard,
      confirmedHardSatisfactionPercent,
      hardSatisfactionRate,
      hardEvidenceCoveragePercent,
      confirmedHardFailurePercent,
      hardUnknownPercent,
    },
    softSatisfaction,
    evidenceCompleteness: {
      addressedCriteria,
      missingCriteria,
      totalCriteria,
      evidenceCompletenessPercent,
    },
    diagnosticSeverity,
    externalVerificationContext,
    evaluatedEvidenceScore,
    scoreStatus,
    scoreFormulaDescription,
  };
}

/**
 * Computes scores across all recommended products.
 */
export function computeAllProductEvaluationScores(
  products: ExtractedProduct[],
  productVerifications: ProductConstraintVerification[],
  productRubrics: Record<string, ProductRubricEvaluation>,
  productSeverities: Record<string, ProductSeverityResult>,
  claimSupportRecords: ClaimSupportRecord[]
): Record<string, ProductEvaluationScore> {
  const scores: Record<string, ProductEvaluationScore> = {};

  products.forEach((p) => {
    const pVerifs = productVerifications.filter(
      (v) =>
        v.productId === p.id ||
        (v.productName && p.name && v.productName.toLowerCase() === p.name.toLowerCase()) ||
        (products.length === 1 && (!v.productId || v.productId === 'P1'))
    );
    const pRubric = productRubrics[p.id] || productRubrics[p.name];
    const pSeverity = productSeverities[p.id] || {
      productId: p.id,
      productName: p.name,
      severity: 'NONE' as SeverityRating,
      severityDrivers: [],
      driverCodes: [],
      confirmedFailureCount: 0,
      indeterminateIssueCount: 0,
      informationalIssueCount: 0,
      explanation: 'No severity evaluated.',
      confidence: 1.0,
    };
    const pClaims = claimSupportRecords.filter(
      (c) =>
        c.productId === p.id ||
        (c.productName && p.name && c.productName.toLowerCase() === p.name.toLowerCase()) ||
        (products.length === 1 && (!c.productId || c.productId === 'P1'))
    );

    scores[p.id] = computeProductEvaluationScore(p, pVerifs, pRubric, pSeverity, pClaims);
  });

  return scores;
}

export class DefaultScoringEngine {
  computeScore = computeProductEvaluationScore;
  computeAllScores = computeAllProductEvaluationScores;
}

export const defaultScoringEngine = new DefaultScoringEngine();
