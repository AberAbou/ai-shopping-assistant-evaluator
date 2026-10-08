import {
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  VerificationEngineResult,
  RubricEngineResult,
  ClaimSupportAnalysisResult,
  RootCauseAnalysisResult,
  SeverityAndScoringResult,
  RecommendationEngineResult,
  FinalEvaluationResult,
  FinalEvaluationSummary,
  FinalVerdictState,
  ProductFinalVerdict,
  RequirementCoverageItem,
  ClaimContextSummary,
  TraceabilityReferenceItem,
  ActionableRecommendation,
  SeverityRating,
} from '../../types/evaluation';

/**
 * Priority weighting for deterministic sorting of recommendations.
 */
const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 6,
  HIGH: 5,
  MEDIUM: 4,
  LOW: 3,
  INFORMATIONAL: 2,
  NONE: 1,
};

/**
 * CHECKPOINT 10: Final Integrated Evaluation & Verdict Engine
 * Consumes authoritative artifacts from Checkpoints 2–9.
 * Does NOT re-evaluate constraints, invent claims, or assume external truth.
 */
export function runFinalVerdictEngine(
  promptAnalysis: UserPromptAnalysisResult,
  claimAnalysis: LlmOutputClaimAnalysisResult,
  verificationResult: VerificationEngineResult,
  rubricResult: RubricEngineResult,
  claimSupportResult: ClaimSupportAnalysisResult,
  rootCauseResult: RootCauseAnalysisResult,
  severityScoringResult: SeverityAndScoringResult,
  recommendationResult: RecommendationEngineResult,
  _userPrompt: string,
  _llmOutput: string
): FinalEvaluationResult {
  const products = claimAnalysis.products.length > 0
    ? claimAnalysis.products
    : [
        {
          id: 'P1',
          name: 'Recommended Item',
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

  const productVerdicts: ProductFinalVerdict[] = [];
  const traceabilityList: TraceabilityReferenceItem[] = [];

  // ==========================================================================
  // 1. PRODUCT-LEVEL EVALUATION & VERDICT (Preserving Product Isolation)
  // ==========================================================================
  for (const product of products) {
    const pId = product.id;
    const pName = product.name;

    const pVerifications = verificationResult.records.filter(
      (v) =>
        v.productId === pId ||
        (v.productName && pName && v.productName.toLowerCase() === pName.toLowerCase()) ||
        (products.length === 1 && (!v.productId || v.productId === 'P1'))
    );

    const pRubric =
      rubricResult?.productEvaluations?.[pId] ||
      rubricResult?.productEvaluations?.[pName] ||
      rubricResult?.productsList?.find(
        (p) => p.productId === pId || (p.productName && pName && p.productName.toLowerCase() === pName.toLowerCase())
      ) ||
      (rubricResult?.productEvaluations
        ? Object.values(rubricResult.productEvaluations).find(
            (p) => p.productId === pId || (p.productName && pName && p.productName.toLowerCase() === pName.toLowerCase())
          )
        : undefined);

    const pSeverity = severityScoringResult.productSeverities[pId] || {
      productId: pId,
      productName: pName,
      severity: 'NONE' as SeverityRating,
      severityDrivers: [],
      driverCodes: [],
      confirmedFailureCount: 0,
      indeterminateIssueCount: 0,
      informationalIssueCount: 0,
      explanation: 'No severity drivers observed.',
      confidence: 1.0,
    };

    const pScore = severityScoringResult.productScores[pId] || {
      productId: pId,
      productName: pName,
      evaluatedEvidenceScore: null,
      scoreStatus: 'NOT_ENOUGH_EVIDENCE' as const,
      hardSatisfaction: {
        confirmedHardSatisfactionPercent: 0,
        confirmedHardFailurePercent: 0,
        hardUnknownPercent: 100,
        passedHard: 0,
        failedHard: 0,
        unknownHard: pVerifications.filter((v) => v.constraintType === 'hard').length,
        totalHard: pVerifications.filter((v) => v.constraintType === 'hard').length,
        hardEvidenceCoveragePercent: 0,
      },
      softSatisfaction: {
        softPreferenceScorePercent: null,
        passedSoft: 0,
        failedSoft: 0,
        unknownSoft: 0,
        totalSoft: 0,
        state: 'NO_SOFT_CONSTRAINTS' as const,
      },
      evidenceCompleteness: {
        evidenceCompletenessPercent: 0,
        addressedCriteria: 0,
        totalCriteria: 0,
        missingCriteria: 0,
      },
      scoreFormulaDescription: 'No score computed.',
      isHardGatePass: false,
    };

    const pCauses = rootCauseResult.records.filter(
      (rc) =>
        rc.productId === pId ||
        (rc.productName && pName && rc.productName.toLowerCase() === pName.toLowerCase()) ||
        (products.length === 1 && (!rc.productId || rc.productId === 'P1'))
    );

    const pRecs = recommendationResult.recommendations.filter(
      (r) =>
        r.productId === pId ||
        (r.productName && pName && r.productName.toLowerCase() === pName.toLowerCase()) ||
        (products.length === 1 && (!r.productId || r.productId === 'P1'))
    );

    // Hard requirements decomposition
    const hardVerifs = pVerifications.filter((v) => v.constraintType === 'hard');
    const passedHardCount = hardVerifs.filter((v) => v.status === 'PASS').length;
    const failedHardCount = hardVerifs.filter((v) => v.status === 'FAIL').length;
    const unknownHardCount = hardVerifs.filter((v) => v.status === 'UNKNOWN').length;
    const totalHardCount = hardVerifs.length;
    const confirmedHardSatisfactionPercent =
      totalHardCount > 0 ? Math.round((passedHardCount / totalHardCount) * 100) : 0;

    const hardGateState = pRubric?.hardGateState || (failedHardCount > 0 ? 'HARD_GATE_FAIL' : unknownHardCount > 0 ? 'HARD_GATE_INDETERMINATE' : 'HARD_GATE_PASS');

    // Deterministic Product Verdict
    let verdict: FinalVerdictState = 'INDETERMINATE';
    let rationale = '';

    const hasConfirmedHardFail = hardGateState === 'HARD_GATE_FAIL' || failedHardCount > 0;
    const hasNegativeViolation = pCauses.some((rc) => rc.code === 'NC-01') || hardVerifs.some((v) => v.polarity === 'negative' && v.status === 'FAIL');
    const isCleanHardPass = (hardGateState === 'HARD_GATE_PASS' || (failedHardCount === 0 && unknownHardCount === 0 && totalHardCount > 0)) && failedHardCount === 0 && unknownHardCount === 0;

    if (hasConfirmedHardFail || hasNegativeViolation) {
      verdict = 'FAIL';
      const failedItems = hardVerifs.filter((v) => v.status === 'FAIL');
      const failDescriptions = failedItems.map((f) => {
        const c = promptAnalysis.constraints.find((cn) => cn.id === f.constraintId);
        const isPrice = f.constraintAttribute.toLowerCase().includes('price') || Boolean(c?.attribute?.toLowerCase().includes('price'));
        const shopperVal = isPrice && c?.expectedValue ? `maximum of $${c.expectedValue}` : (f.constraintEvidence || c?.sourceText || 'requirement');
        const statedVal = f.claimEvidence.length > 0 ? f.claimEvidence.join(', ') : 'stated value';
        return `The stated ${f.constraintAttribute} of "${statedVal}" violates the shopper's requirement ("${shopperVal}")`;
      });

      const failDetails = failDescriptions.length > 0 ? failDescriptions.join('. ') + '.' : '1 mandatory requirement has a confirmed violation.';
      const unknownNote = unknownHardCount > 0
        ? ` ${unknownHardCount} additional mandatory requirement(s) remain UNKNOWN and are not counted as failures.`
        : '';
      const unverifiedNote = ' Externally unverified factual claims are informational and do not soften or override the confirmed failure.';

      rationale = `Product verdict: FAIL because ${failedHardCount || 1} mandatory requirement has a confirmed violation. ${failDetails}${unknownNote}${unverifiedNote}`;
    } else if (isCleanHardPass) {
      verdict = 'PASS';
      rationale = `Product verdict: PASS because all mandatory requirements (${passedHardCount} of ${totalHardCount}) are affirmatively satisfied by the assistant response. Some factual product claims may remain externally UNVERIFIED; UNVERIFIED claims are not assumed false and do not override the satisfied hard gate.`;
    } else {
      verdict = 'INDETERMINATE';
      const contradictionCause = pCauses.find((rc) => rc.code === 'FAC-01');
      if (contradictionCause) {
        rationale = `Product verdict: INDETERMINATE because an internal factual contradiction exists regarding "${contradictionCause.shopperEvidence.join(', ')}". Neither conflicting statement is arbitrarily assumed true. No mandatory requirement has a confirmed failure, but requirements remain UNKNOWN. UNKNOWN requirements are not counted as failures.`;
      } else {
        const passedText = passedHardCount > 0 ? `${passedHardCount} confirmed PASS, ` : '';
        rationale = `Product verdict: INDETERMINATE because no mandatory requirement has a confirmed failure, but ${unknownHardCount} of ${totalHardCount} mandatory requirements remain UNKNOWN (${passedText}0 confirmed FAIL). UNKNOWN requirements are not counted as failures. Evaluated evidence score reflects confirmed coverage, not product defect.`;
      }
    }

    const keyRootCauseCodes = Array.from(new Set(pCauses.map((rc) => rc.code)));
    const keyRootCauseIds = pCauses.map((rc) => rc.causeId);

    // Remediation summary
    let remediationSummary = 'No requirement-level remediation required.';
    if (pRecs.length > 0) {
      const highestRec = pRecs[0];
      remediationSummary = `${highestRec.priority}: ${highestRec.action}`;
    }

    productVerdicts.push({
      productId: pId,
      productName: pName,
      verdict,
      hardGateState,
      severity: pSeverity.severity,
      evaluatedEvidenceScore: pScore.evaluatedEvidenceScore,
      evaluatedEvidenceStatus: pScore.scoreStatus,
      passedHardCount,
      failedHardCount,
      unknownHardCount,
      totalHardCount,
      confirmedHardSatisfactionPercent,
      rationale,
      keyRootCauseCodes,
      keyRootCauseIds,
      remediationSummary,
      recommendationCount: pRecs.length,
      topRecommendationIds: pRecs.slice(0, 3).map((r) => r.recommendationId),
    });

    // Traceability item
    const linkedConstraintIds = Array.from(new Set(pVerifications.map((v) => v.constraintId)));
    const linkedClaimIds = Array.from(new Set(pCauses.flatMap((rc) => rc.claimIds || [])));
    const linkedVerificationIds = pVerifications.map((v) => v.id);
    const linkedRubricCriterionIds = pRubric?.criteria?.map((c) => c.criterionId) || [];
    const linkedRootCauseIds = pCauses.map((rc) => rc.causeId);
    const linkedRecommendationIds = pRecs.map((r) => r.recommendationId);

    traceabilityList.push({
      productId: pId,
      productName: pName,
      constraintIds: linkedConstraintIds,
      claimIds: linkedClaimIds,
      verificationIds: linkedVerificationIds,
      rubricCriterionIds: linkedRubricCriterionIds,
      rootCauseIds: linkedRootCauseIds,
      recommendationIds: linkedRecommendationIds,
    });
  }

  // ==========================================================================
  // 2. RESPONSE-LEVEL FINAL VERDICT (Deterministic Rules)
  // ==========================================================================
  // Rule 1: FAIL if at least one recommended product has an authoritative HARD_GATE_FAIL
  // Rule 2: INDETERMINATE if no HARD_GATE_FAIL, but at least one product is HARD_GATE_INDETERMINATE
  // Rule 3: PASS only if EVERY evaluated recommended product is HARD_GATE_PASS
  const hasAnyFailProduct = productVerdicts.some((pv) => pv.verdict === 'FAIL' || pv.hardGateState === 'HARD_GATE_FAIL');
  const hasAnyIndeterminateProduct = productVerdicts.some((pv) => pv.verdict === 'INDETERMINATE' || pv.hardGateState === 'HARD_GATE_INDETERMINATE');
  const allPassProducts = productVerdicts.length > 0 && productVerdicts.every((pv) => pv.verdict === 'PASS' && pv.hardGateState === 'HARD_GATE_PASS');

  let finalVerdict: FinalVerdictState = 'INDETERMINATE';
  let verdictRationale = '';

  if (hasAnyFailProduct) {
    finalVerdict = 'FAIL';
    const failingProducts = productVerdicts.filter((pv) => pv.verdict === 'FAIL');
    if (productVerdicts.length === 1) {
      verdictRationale = failingProducts[0].rationale.replace('Product verdict:', 'Final verdict:');
    } else {
      const failNames = failingProducts.map((p) => p.productName).join(', ');
      const passingProducts = productVerdicts.filter((pv) => pv.verdict === 'PASS');
      const passingNote = passingProducts.length > 0
        ? ` Product isolation is preserved; ${passingProducts.map((p) => p.productName).join(', ')} retains its independent evaluation.`
        : '';
      verdictRationale = `Final verdict: FAIL because ${failingProducts.length} of ${productVerdicts.length} evaluated products (${failNames}) has an authoritative hard-gate failure.${passingNote} Stated non-negotiable requirements were violated.`;
    }
  } else if (allPassProducts) {
    finalVerdict = 'PASS';
    if (productVerdicts.length === 1) {
      verdictRationale = productVerdicts[0].rationale.replace('Product verdict:', 'Final verdict:');
    } else {
      verdictRationale = `Final verdict: PASS because all ${productVerdicts.length} evaluated recommended products affirmatively satisfy their mandatory requirements. Some factual product claims remain externally UNVERIFIED; UNVERIFIED claims are not assumed false and do not override the satisfied hard gates.`;
    }
  } else if (hasAnyIndeterminateProduct || productVerdicts.length === 0) {
    finalVerdict = 'INDETERMINATE';
    if (productVerdicts.length === 1) {
      verdictRationale = productVerdicts[0].rationale.replace('Product verdict:', 'Final verdict:');
    } else {
      verdictRationale = `Final verdict: INDETERMINATE because no evaluated product has a confirmed mandatory failure, but one or more mandatory requirements remain UNKNOWN across the evaluated options. UNKNOWN requirements are not counted as failures.`;
    }
  }

  // ==========================================================================
  // 3. REQUIREMENT COVERAGE SUMMARY
  // ==========================================================================
  const confirmedSatisfied: RequirementCoverageItem[] = [];
  const confirmedFailed: RequirementCoverageItem[] = [];
  const unknownRequirements: RequirementCoverageItem[] = [];

  for (const v of verificationResult.records) {
    const linkedConstraint = promptAnalysis.constraints.find((c) => c.id === v.constraintId);
    const item: RequirementCoverageItem = {
      constraintId: v.constraintId,
      sourceText: v.constraintEvidence || linkedConstraint?.sourceText || v.constraintAttribute,
      attribute: v.constraintAttribute,
      polarity: v.polarity,
      type: v.constraintType,
      status: v.status,
      evidenceInOutput: v.claimEvidence,
      productName: v.productName || 'Recommended Item',
    };

    if (v.status === 'PASS') {
      confirmedSatisfied.push(item);
    } else if (v.status === 'FAIL') {
      confirmedFailed.push(item);
    } else {
      unknownRequirements.push(item);
    }
  }

  // ==========================================================================
  // 4. CLAIM / EVIDENCE CONTEXT
  // ==========================================================================
  const totalExtractedClaims = claimAnalysis.claims.length;
  const internallySupportedClaims = claimSupportResult.records.filter((c) => c.responseSupport === 'SUPPORTED').length;
  const internallyContradictedClaims = claimSupportResult.records.filter((c) => c.internalConsistency === 'CONTRADICTED').length;
  const externallyUnverifiedFactualClaims = claimSupportResult.records.filter(
    (c) => c.nature === 'factual' && c.externalTruthStatus === 'UNVERIFIED'
  ).length;

  const claimContext: ClaimContextSummary = {
    totalExtractedClaims,
    internallySupportedClaims,
    internallyContradictedClaims,
    externallyUnverifiedFactualClaims,
    externalVerificationExplicitNote: 'UNVERIFIED claims are not assumed false.',
  };

  // ==========================================================================
  // 5. ROOT-CAUSE SUMMARY
  // ==========================================================================
  const primaryCauses = rootCauseResult.records.filter((rc) => rc.role === 'primary');
  const contributingCauses = rootCauseResult.records.filter((rc) => rc.role === 'contributing');

  // ==========================================================================
  // 6. PRIORITIZED NEXT ACTIONS (From Checkpoint 9)
  // ==========================================================================
  // Deterministic sorting strictly by priority weight
  const prioritizedNextActions = [...recommendationResult.recommendations].sort((a, b) => {
    const weightA = PRIORITY_ORDER[a.priority] || 0;
    const weightB = PRIORITY_ORDER[b.priority] || 0;
    return weightB - weightA;
  });

  // ==========================================================================
  // 7. RESPONSE-LEVEL SUMMARY
  // ==========================================================================
  const hardGateDistribution = {
    pass: productVerdicts.filter((pv) => pv.hardGateState === 'HARD_GATE_PASS').length,
    fail: productVerdicts.filter((pv) => pv.hardGateState === 'HARD_GATE_FAIL').length,
    indeterminate: productVerdicts.filter((pv) => pv.hardGateState === 'HARD_GATE_INDETERMINATE').length,
  };

  const validScores = productVerdicts
    .map((pv) => pv.evaluatedEvidenceScore)
    .filter((s): s is number => s !== null);
  const averageEvaluatedEvidenceScore =
    validScores.length > 0
      ? Math.round(validScores.reduce((acc, curr) => acc + curr, 0) / validScores.length)
      : null;

  const totalConfirmedFailures = confirmedFailed.length;
  const totalUnresolvedUnknown = unknownRequirements.length;

  const summary: FinalEvaluationSummary = {
    finalVerdict,
    verdictRationale,
    totalProductsEvaluated: productVerdicts.length,
    hardGateDistribution,
    overallSeverity: severityScoringResult.responseSeverity.overallSeverity,
    averageEvaluatedEvidenceScore,
    totalConfirmedFailures,
    totalUnresolvedUnknown,
    totalUnverifiedFactualClaims: externallyUnverifiedFactualClaims,
    unknownExplicitNote: 'UNKNOWN requirements are not counted as failures.',
  };

  return {
    state: 'FINAL_INTEGRATED_EVALUATION_COMPLETE',
    evaluatedAt: new Date().toISOString(),
    finalVerdict,
    verdictRationale,
    hardGateAuthoritative: true,
    summary,
    productVerdicts,
    requirementCoverage: {
      confirmedSatisfied,
      confirmedFailed,
      unknownRequirements,
      disclaimer: 'UNKNOWN requirements are not counted as failures.',
    },
    claimContext,
    rootCauseSummary: {
      primaryCauses,
      contributingCauses,
      allCauses: rootCauseResult.records,
    },
    prioritizedNextActions,
    traceability: traceabilityList,
    rawJson: {
      finalVerdict,
      summary,
      productVerdicts,
      requirementCoverage: {
        confirmedSatisfiedCount: confirmedSatisfied.length,
        confirmedFailedCount: confirmedFailed.length,
        unknownRequirementsCount: unknownRequirements.length,
      },
      claimContext,
      prioritizedNextActionsCount: prioritizedNextActions.length,
      traceabilityCount: traceabilityList.length,
    },
  };
}
