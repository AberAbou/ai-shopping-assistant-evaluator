import {
  ExtractedProduct,
  ProductConstraintVerification,
  ProductRubricEvaluation,
  RootCauseRecord,
  SeverityRating,
  ProductSeverityResult,
  ResponseSeveritySummary,
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  RootCauseCode,
} from '../../types/evaluation';

/**
 * Severity ranking weights for deterministic comparison.
 */
const SEVERITY_WEIGHT: Record<SeverityRating, number> = {
  CRITICAL: 6,
  HIGH: 5,
  MEDIUM: 4,
  LOW: 3,
  INDETERMINATE: 2,
  INFORMATIONAL: 1,
  NONE: 0,
};

/**
 * Determines whether a given root cause is a safety conflict with confirmed violation.
 */
function isSafetyConfirmedFailure(
  rc: RootCauseRecord,
  productVerifications: ProductConstraintVerification[]
): boolean {
  if (rc.code === 'SAF-01' || rc.category === 'SAFETY_OR_SENSITIVITY_RISK') {
    // Must be an actual confirmed requirement failure, not merely an unverified assertion
    const linkedVerification = productVerifications.find((v) =>
      rc.verificationIds.includes(v.id) || rc.constraintIds.includes(v.constraintId)
    );
    return Boolean(linkedVerification && linkedVerification.status === 'FAIL');
  }
  return false;
}

/**
 * Classifies deterministic severity for a single recommended product.
 * Grounded exclusively in observable evidence from Checkpoints 2–7.
 */
export function classifyProductSeverity(
  product: ExtractedProduct,
  productVerifications: ProductConstraintVerification[],
  productRubric: ProductRubricEvaluation | undefined,
  productCauses: RootCauseRecord[],
  promptAnalysis: UserPromptAnalysisResult
): ProductSeverityResult {
  const pId = product.id;
  const pName = product.name;

  // Normalize legacy codes if present
  const normalizedCauses = productCauses.map((c) => ({
    ...c,
    code: (c.code === 'HAL-01' ? 'UFC-01' : c.code) as RootCauseCode,
  }));

  const failedVerifications = productVerifications.filter((v) => v.status === 'FAIL');
  const unknownHardVerifications = productVerifications.filter(
    (v) => v.status === 'UNKNOWN' && v.constraintType === 'hard'
  );

  const primaryCauses = normalizedCauses.filter((c) => c.role === 'primary');
  const contributingCauses = normalizedCauses.filter((c) => c.role === 'contributing');

  // Count issues by category
  const confirmedFailureCount = failedVerifications.length;
  const indeterminateIssueCount = unknownHardVerifications.length;
  const informationalIssueCount = normalizedCauses.filter(
    (c) => c.code === 'UFC-01' || c.code === 'HAL-01'
  ).length;

  const severityDrivers: string[] = [];
  const driverCodes: RootCauseCode[] = [];
  let severity: SeverityRating = 'NONE';
  let explanation = '';
  let confidence = 0.98;

  // RULE 1: CRITICAL
  // Explicit high-impact safety/sensitivity constraint directly contradicted with confirmed failure.
  const criticalCause = normalizedCauses.find((c) => isSafetyConfirmedFailure(c, productVerifications));
  if (criticalCause) {
    severity = 'CRITICAL';
    severityDrivers.push(criticalCause.causeId);
    driverCodes.push(criticalCause.code);
    explanation = `Critical safety risk: the assistant's explicit claims directly contradict a stated safety, allergen, or sensitivity requirement ("${criticalCause.shopperEvidence.join(', ')}").`;
    confidence = criticalCause.confidence;
    return {
      productId: pId,
      productName: pName,
      severity,
      severityDrivers,
      driverCodes,
      confirmedFailureCount,
      indeterminateIssueCount,
      informationalIssueCount,
      explanation,
      confidence,
    };
  }

  // RULE 2: HIGH
  // Confirmed hard-constraint violation (HC-01), negative-constraint violation (NC-01),
  // or major intent/seasonal mismatch directly violating a hard requirement (INT-01 on hard).
  const highCauses = normalizedCauses.filter((c) => {
    if (c.code === 'HC-01' || c.code === 'NC-01') return true;
    if (c.code === 'INT-01' && c.role === 'primary') {
      const linked = productVerifications.find((v) => c.verificationIds.includes(v.id) || c.constraintIds.includes(v.constraintId));
      return linked ? linked.status === 'FAIL' : true;
    }
    return false;
  });

  if (highCauses.length > 0) {
    severity = 'HIGH';
    highCauses.forEach((c) => {
      severityDrivers.push(c.causeId);
      driverCodes.push(c.code);
    });
    const violationDescriptions = highCauses.map((c) => c.explanation).join(' ');
    explanation = `High severity failure: confirmed violation of mandatory shopper requirement(s). ${violationDescriptions}`;
    confidence = Math.min(...highCauses.map((c) => c.confidence));
    return {
      productId: pId,
      productName: pName,
      severity,
      severityDrivers,
      driverCodes,
      confirmedFailureCount,
      indeterminateIssueCount,
      informationalIssueCount,
      explanation,
      confidence,
    };
  }

  // RULE 3: MEDIUM
  // Major insufficient evidence (RET-01), internal contradiction (FAC-01),
  // ranking failure (RNK-01), or category mismatch (CAT-01).
  const mediumCauses = normalizedCauses.filter(
    (c) =>
      c.code === 'RET-01' ||
      c.code === 'FAC-01' ||
      c.code === 'RNK-01' ||
      c.code === 'CAT-01'
  );

  if (mediumCauses.length > 0) {
    severity = 'MEDIUM';
    mediumCauses.forEach((c) => {
      severityDrivers.push(c.causeId);
      driverCodes.push(c.code);
    });
    const causeDescriptions = mediumCauses.map((c) => c.explanation).join(' ');
    explanation = `Medium severity: significant evaluability gap or internal inconsistency. ${causeDescriptions}`;
    confidence = Math.min(...mediumCauses.map((c) => c.confidence));
    return {
      productId: pId,
      productName: pName,
      severity,
      severityDrivers,
      driverCodes,
      confirmedFailureCount,
      indeterminateIssueCount,
      informationalIssueCount,
      explanation,
      confidence,
    };
  }

  // RULE 4: LOW
  // Isolated missing evidence (DAT-01), soft-preference failure, format failure (FMT-01).
  const lowCauses = normalizedCauses.filter(
    (c) => c.code === 'DAT-01' || c.code === 'FMT-01'
  );
  const hasSoftFail = productRubric ? productRubric.softPreferenceSummary.softFailCount > 0 : false;

  if (lowCauses.length > 0 || hasSoftFail) {
    severity = 'LOW';
    lowCauses.forEach((c) => {
      severityDrivers.push(c.causeId);
      driverCodes.push(c.code);
    });
    explanation = hasSoftFail
      ? 'Low severity: product satisfies hard requirements but does not fulfill an optional soft preference.'
      : 'Low severity: minor missing evidence on an individual attribute without confirmed requirement failure.';
    confidence = 0.95;
    return {
      productId: pId,
      productName: pName,
      severity,
      severityDrivers,
      driverCodes,
      confirmedFailureCount,
      indeterminateIssueCount,
      informationalIssueCount,
      explanation,
      confidence,
    };
  }

  // RULE 5: NONE (NO_OBSERVED_FAILURE)
  // When all stated shopper requirements are evaluated and satisfied.
  const hasNoFailureRecord = normalizedCauses.some((c) => c.code === 'NO_FAILURE');
  const isHardGatePass = productRubric
    ? productRubric.hardGateState === 'HARD_GATE_PASS'
    : (failedVerifications.length === 0 && unknownHardVerifications.length === 0 && promptAnalysis.constraints.length > 0);

  if (hasNoFailureRecord || (isHardGatePass && failedVerifications.length === 0 && unknownHardVerifications.length === 0)) {
    severity = 'NONE';
    const noFailRecord = normalizedCauses.find((c) => c.code === 'NO_FAILURE');
    if (noFailRecord) {
      severityDrivers.push(noFailRecord.causeId);
      driverCodes.push(noFailRecord.code);
    }
    explanation = 'No observed requirement failures: all stated shopper requirements were evaluated and satisfied based on evidence in the assistant response.';
    confidence = 1.0;
    return {
      productId: pId,
      productName: pName,
      severity,
      severityDrivers,
      driverCodes,
      confirmedFailureCount,
      indeterminateIssueCount,
      informationalIssueCount,
      explanation,
      confidence,
    };
  }

  // RULE 6: INFORMATIONAL ONLY
  // Only informational unverified factual claims exist (UFC-01) with no other issues.
  const hasInformationalOnly = normalizedCauses.every((c) => c.code === 'UFC-01' || c.code === 'HAL-01');
  if (hasInformationalOnly && normalizedCauses.length > 0) {
    severity = 'INFORMATIONAL';
    normalizedCauses.forEach((c) => {
      severityDrivers.push(c.causeId);
      driverCodes.push(c.code);
    });
    explanation = 'Informational context: response contains material factual claims that remain externally unverified; no requirement violation or contradiction was observed.';
    confidence = 0.95;
    return {
      productId: pId,
      productName: pName,
      severity,
      severityDrivers,
      driverCodes,
      confirmedFailureCount,
      indeterminateIssueCount,
      informationalIssueCount,
      explanation,
      confidence,
    };
  }

  // RULE 7: INDETERMINATE (Default Fallback)
  severity = 'INDETERMINATE';
  explanation = 'Indeterminate: available evidence is insufficient to establish requirement compliance or violation.';
  confidence = 0.85;

  return {
    productId: pId,
    productName: pName,
    severity,
    severityDrivers,
    driverCodes,
    confirmedFailureCount,
    indeterminateIssueCount,
    informationalIssueCount,
    explanation,
    confidence,
  };
}

/**
 * Aggregates response-level severity across all recommended products.
 */
export function classifyResponseSeverity(
  productSeverities: Record<string, ProductSeverityResult>,
  productsList: ExtractedProduct[]
): ResponseSeveritySummary {
  const severities = Object.values(productSeverities);

  let criticalProducts = 0;
  let highProducts = 0;
  let mediumProducts = 0;
  let lowProducts = 0;
  let informationalProducts = 0;
  let noneProducts = 0;
  let indeterminateProducts = 0;

  severities.forEach((s) => {
    switch (s.severity) {
      case 'CRITICAL':
        criticalProducts++;
        break;
      case 'HIGH':
        highProducts++;
        break;
      case 'MEDIUM':
        mediumProducts++;
        break;
      case 'LOW':
        lowProducts++;
        break;
      case 'INFORMATIONAL':
        informationalProducts++;
        break;
      case 'NONE':
        noneProducts++;
        break;
      case 'INDETERMINATE':
      default:
        indeterminateProducts++;
        break;
    }
  });

  // Overall response severity reflects the strongest observed problem across isolated products
  let overallSeverity: SeverityRating = 'NONE';
  let maxWeight = -1;

  for (const s of severities) {
    const weight = SEVERITY_WEIGHT[s.severity];
    if (weight > maxWeight) {
      maxWeight = weight;
      overallSeverity = s.severity;
    }
  }

  const primaryExplanation = severities.length === 1
    ? severities[0].explanation
    : `Response contains ${severities.length} product(s) evaluated independently. Strongest observed diagnostic severity is ${overallSeverity} (${highProducts + criticalProducts} confirmed failure(s), ${mediumProducts + indeterminateProducts} indeterminate/missing).`;

  return {
    overallSeverity,
    criticalProducts,
    highProducts,
    mediumProducts,
    lowProducts,
    informationalProducts,
    noneProducts,
    indeterminateProducts,
    severityDistribution: {
      CRITICAL: criticalProducts,
      HIGH: highProducts,
      MEDIUM: mediumProducts,
      LOW: lowProducts,
      INFORMATIONAL: informationalProducts,
      NONE: noneProducts,
      INDETERMINATE: indeterminateProducts,
    },
    primaryExplanation,
  };
}

export class DefaultSeverityClassifier {
  classifyProduct = classifyProductSeverity;
  classifyResponse = classifyResponseSeverity;
}

export const defaultSeverityClassifier = new DefaultSeverityClassifier();
