import {
  ActionableRecommendation,
  ClaimSupportAnalysisResult,
  ExtractedProduct,
  LlmOutputClaimAnalysisResult,
  ProductRecommendationSummary,
  RecommendationEngineResult,
  RecommendationPriority,
  RecommendationResponseSummary,
  RecommendationType,
  RootCauseAnalysisResult,
  RubricEngineResult,
  SeverityAndScoringResult,
  UserPromptAnalysisResult,
  VerificationEngineResult,
} from '../../types/evaluation';

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  INFORMATIONAL: 5,
  NONE: 6,
};

const TYPE_RANK: Record<RecommendationType, number> = {
  ADDRESS_SAFETY_SENSITIVITY: 1,
  HONOR_NEGATIVE_CONSTRAINT: 2,
  CORRECT_OR_REPLACE: 3,
  IMPROVE_INTENT_ALIGNMENT: 4,
  RESOLVE_CONTRADICTION: 5,
  IMPROVE_PRODUCT_SELECTION: 6,
  IMPROVE_RANKING: 7,
  PROVIDE_OR_OBTAIN_EVIDENCE: 8,
  IMPROVE_RESPONSE_FORMAT: 9,
  VERIFY_EXTERNAL_FACT: 10,
  NO_REMEDIATION_REQUIRED: 11,
};

/** Preserve the actual numeric boundary; never silently turn a strict limit inclusive. */
export function describePriceBoundary(operator: string | undefined, sourceText: string, amount: string) {
  const source = sourceText.trim();
  const strictUpper = /\b(?:under|below|less than|fewer than)\b/i.test(source);
  const inclusiveUpper = /\b(?:at most|up to|no more than|maximum(?: of)?|or less)\b/i.test(source);
  const strictLower = /\b(?:over|above|greater than|more than)\b/i.test(source);
  const inclusiveLower = /\b(?:at least|minimum(?: of)?|no less than|or more)\b/i.test(source);
  // Explicit shopper wording takes precedence if a legacy extractor mislabels it.
  if (strictUpper) return `strictly below ${amount}`;
  if (inclusiveUpper) return `at or below ${amount}`;
  if (strictLower) return `strictly above ${amount}`;
  if (inclusiveLower) return `at or above ${amount}`;
  if (operator === 'less_than' || operator === '<') return `strictly below ${amount}`;
  if (operator === 'less_than_or_equal' || operator === '<=') return `at or below ${amount}`;
  if (operator === 'greater_than' || operator === '>') return `strictly above ${amount}`;
  if (operator === 'greater_than_or_equal' || operator === '>=') return `at or above ${amount}`;
  return null;
}

/**
 * Deterministically generates actionable, evidence-bound recommendations for a single product.
 */
export function generateProductRecommendations(
  product: ExtractedProduct,
  promptAnalysis: UserPromptAnalysisResult,
  _claimAnalysis: LlmOutputClaimAnalysisResult,
  verificationResult: VerificationEngineResult,
  rubricResult: RubricEngineResult,
  claimSupportResult: ClaimSupportAnalysisResult,
  rootCauseResult: RootCauseAnalysisResult,
  severityResult: SeverityAndScoringResult
): ActionableRecommendation[] {
  const pId = product.id;
  const pName = product.name;

  const verifications = verificationResult.records.filter(
    (v) =>
      v.productId === pId ||
      (v.productName && pName && v.productName.toLowerCase() === pName.toLowerCase()) ||
      (!v.productId && verificationResult.records.length === 1)
  );

  const productRubric =
    rubricResult.productEvaluations[pId] ||
    rubricResult.productEvaluations[pName] ||
    rubricResult.productsList.find((p) => p.productId === pId);

  const rootCauses = rootCauseResult.records.filter(
    (rc) => rc.productId === pId || (!rc.productId && rc.productName !== 'Shopping Cart' && rootCauseResult.records.length === 1)
  );

  const claims = claimSupportResult.records.filter(
    (c) =>
      c.productId === pId ||
      (c.productName && pName && c.productName.toLowerCase() === pName.toLowerCase()) ||
      (!c.productId && claimSupportResult.records.length === 1)
  );

  const productSeverity = severityResult.productSeverities[pId];
  const recommendations: ActionableRecommendation[] = [];

  // Track constraints that have already produced a failure or missing recommendation to avoid duplicates
  const processedConstraintIds = new Set<string>();

  // ==========================================================================
  // 1. CONFIRMED FAILURES (CORRECT_OR_REPLACE, HONOR_NEGATIVE_CONSTRAINT, etc.)
  // ==========================================================================
  const failedVerifications = verifications.filter((v) => v.status === 'FAIL');

  for (const v of failedVerifications) {
    const cId = v.constraintId;
    processedConstraintIds.add(cId);

    const linkedConstraint = promptAnalysis.constraints.find((c) => c.id === cId);
    const linkedRootCauses = rootCauses.filter(
      (rc) => rc.verificationIds.includes(v.id) || rc.constraintIds.includes(cId)
    );
    const linkedRootCause = linkedRootCauses[0];
    const linkedRubricCriterion = productRubric?.criteria.find((cr) => cr.sourceConstraintId === cId);

    const shopperEvidence = v.constraintEvidence ? [v.constraintEvidence] : linkedConstraint ? [linkedConstraint.sourceText] : [];
    const assistantEvidence = v.claimEvidence && v.claimEvidence.length > 0 ? v.claimEvidence : [];

    const isNegative = linkedConstraint?.polarity === 'negative' || linkedRootCause?.code === 'NC-01';
    const isSafety =
      (v.constraintAttribute === 'safety' ||
        v.constraintAttribute === 'allergen' ||
        linkedConstraint?.attribute === 'safety' ||
        linkedConstraint?.attribute === 'allergen') &&
      (v.polarity === 'negative' || linkedConstraint?.polarity === 'negative' || linkedRootCause?.code === 'SAF-01');
    const isIntentMismatch = linkedRootCause?.code === 'INT-01';
    const isPrice =
      linkedConstraint?.attribute === 'price' ||
      linkedConstraint?.attribute === 'budget' ||
      (v.constraintAttribute && v.constraintAttribute.toLowerCase().includes('price'));

    let type: RecommendationType = 'CORRECT_OR_REPLACE';
    let priority: RecommendationPriority = 'HIGH';
    let title = '';
    let action = '';
    let reason = '';

    if (isSafety) {
      type = 'ADDRESS_SAFETY_SENSITIVITY';
      priority = 'CRITICAL';
      title = `Address safety/sensitivity requirement ("${linkedConstraint?.sourceText || v.constraintAttribute}")`;
      action = `Replace this recommendation with a product verified to comply with the stated safety and allergen requirement, or remove the conflicting recommendation.`;
      reason = `The assistant's stated claims directly contradict an explicit shopper safety or sensitivity requirement ("${shopperEvidence.join(', ')}").`;
    } else if (isNegative) {
      type = 'HONOR_NEGATIVE_CONSTRAINT';
      priority = 'HIGH';
      title = `Honor negative exclusion requirement ("${linkedConstraint?.sourceText || v.constraintAttribute}")`;
      const excludedMaterial = linkedConstraint?.expectedValue || linkedConstraint?.attribute || 'excluded material';
      action = `Replace this recommendation with a product whose stated materials and specifications satisfy the shopper's no-${excludedMaterial} requirement.`;
      reason = `The assistant explicitly states "${assistantEvidence.join(', ')}", which violates the shopper's mandatory exclusion ("${shopperEvidence.join(', ')}").`;
    } else if (isIntentMismatch) {
      type = 'IMPROVE_INTENT_ALIGNMENT';
      priority = productSeverity?.severity === 'HIGH' ? 'HIGH' : 'MEDIUM';
      title = `Improve use-case and intent alignment ("${linkedConstraint?.sourceText || v.constraintAttribute}")`;
      action = `Replace or deprioritize this product because the assistant's own description conflicts with the shopper's stated use case. Recommend a product whose stated characteristics align with ${linkedConstraint?.sourceText || 'the requested purpose'}.`;
      reason = `The assistant recommends a product described as "${assistantEvidence.join(', ')}", which directly contradicts the shopper's requirement "${shopperEvidence.join(', ')}".`;
    } else if (isPrice) {
      type = 'CORRECT_OR_REPLACE';
      priority = 'HIGH';
      const ceilingStr = linkedConstraint?.expectedValue ? `$${linkedConstraint.expectedValue}` : 'stated ceiling';
      title = `Correct price ceiling violation (${shopperEvidence.join(', ') || `under ${ceilingStr}`})`;
      const boundary = describePriceBoundary(linkedConstraint?.operator, linkedConstraint?.sourceText || v.constraintEvidence || '', ceilingStr);
      action = boundary
        ? `Replace this recommendation with a product priced ${boundary}, or correct the stated price if inaccurate.`
        : `Replace this recommendation with a product satisfying the shopper's stated price requirement (${shopperEvidence.join(', ') || 'price constraint'}), or correct the stated price if inaccurate.`;
      reason = `The assistant states a price of ${assistantEvidence.join(', ') || 'an exceeding amount'} while the shopper specified a maximum limit of ${ceilingStr}.`;
    } else {
      type = 'CORRECT_OR_REPLACE';
      priority = 'HIGH';
      title = `Correct mandatory requirement violation ("${linkedConstraint?.sourceText || v.constraintAttribute}")`;
      action = `Replace this recommendation with an option meeting the requirement "${linkedConstraint?.sourceText || v.constraintAttribute}", or correct the assistant's claim if inaccurate.`;
      reason = `The assistant's response establishes that the product fails the shopper's stated requirement "${shopperEvidence.join(', ')}".`;
    }

    recommendations.push({
      recommendationId: '', // Assigned later during response ordering
      productId: pId,
      productName: pName,
      type,
      priority,
      title,
      action,
      reason,
      shopperEvidence,
      assistantEvidence,
      constraintIds: cId ? [cId] : [],
      claimIds: linkedRootCause?.claimIds || [],
      verificationIds: [v.id],
      rubricCriterionIds: linkedRubricCriterion ? [linkedRubricCriterion.criterionId] : [],
      rootCauseIds: linkedRootCauses.map((rc) => rc.causeId),
      confidence: 1.0,
    });
  }

  // ==========================================================================
  // 2. INTERNAL FACTUAL CONTRADICTIONS (RESOLVE_CONTRADICTION)
  // ==========================================================================
  const contradictionCauses = rootCauses.filter((rc) => rc.code === 'FAC-01');
  for (const rc of contradictionCauses) {
    const assistantEv = rc.assistantEvidence.length > 0 ? rc.assistantEvidence : ['conflicting statements in response'];
    recommendations.push({
      recommendationId: '',
      productId: pId,
      productName: pName,
      type: 'RESOLVE_CONTRADICTION',
      priority: 'MEDIUM',
      title: `Resolve internal factual contradiction regarding ${rc.explanation ? rc.explanation.split(':')[0] : 'product attributes'}`,
      action: `The response contains conflicting statements about whether the product satisfies the requirement. Resolve the contradiction and provide one consistent, evidence-supported description before presenting the product.`,
      reason: `The assistant makes contradictory statements ("${assistantEv.join('" vs "')}") regarding the same product attribute. Neither statement is arbitrarily assumed true.`,
      shopperEvidence: rc.shopperEvidence,
      assistantEvidence: assistantEv,
      constraintIds: rc.constraintIds,
      claimIds: rc.claimIds,
      verificationIds: rc.verificationIds,
      rubricCriterionIds: rc.rubricCriterionIds,
      rootCauseIds: [rc.causeId],
      confidence: 0.95,
    });
  }

  // ==========================================================================
  // 2b. SAFETY & SENSITIVITY VIOLATIONS FROM ROOT CAUSES (only on confirmed failure)
  // ==========================================================================
  const confirmedSafetyCauses = rootCauses.filter(
    (rc) =>
      rc.code === 'SAF-01' &&
      verifications.some(
        (v) =>
          (rc.verificationIds.includes(v.id) || rc.constraintIds.includes(v.constraintId)) &&
          v.status === 'FAIL'
      ) &&
      !recommendations.some((r) => r.type === 'ADDRESS_SAFETY_SENSITIVITY')
  );
  for (const rc of confirmedSafetyCauses) {
    recommendations.push({
      recommendationId: '',
      productId: pId,
      productName: pName,
      type: 'ADDRESS_SAFETY_SENSITIVITY',
      priority: 'CRITICAL',
      title: `Address safety/sensitivity requirement ("${rc.shopperEvidence.join(', ') || 'allergen/safety'}")`,
      action: `Replace this recommendation with a product verified to comply with the stated safety and allergen requirement, or remove the conflicting recommendation.`,
      reason: rc.explanation || `The assistant's stated claims conflict with an explicit shopper safety or allergen sensitivity requirement.`,
      shopperEvidence: rc.shopperEvidence,
      assistantEvidence: rc.assistantEvidence,
      constraintIds: rc.constraintIds,
      claimIds: rc.claimIds,
      verificationIds: rc.verificationIds,
      rubricCriterionIds: rc.rubricCriterionIds,
      rootCauseIds: [rc.causeId],
      confidence: 1.0,
    });
  }

  // ==========================================================================
  // 3. UNKNOWN / MISSING EVIDENCE (PROVIDE_OR_OBTAIN_EVIDENCE)
  // ==========================================================================
  // Generate actionable recommendations at the specific attribute granularity (hiking, size 10, waterproof)
  const unknownVerifications = verifications.filter(
    (v) => v.status === 'UNKNOWN' && !processedConstraintIds.has(v.constraintId)
  );

  for (const v of unknownVerifications) {
    const cId = v.constraintId;
    processedConstraintIds.add(cId);

    const linkedConstraint = promptAnalysis.constraints.find((c) => c.id === cId);
    const isHard = v.constraintType === 'hard';
    const attr = linkedConstraint?.attribute || v.constraintAttribute || 'requested';
    const expectedVal = linkedConstraint?.expectedValue || '';
    const shopperText = linkedConstraint?.sourceText || v.constraintEvidence || attr;

    let actionText = '';
    if (attr === 'size') {
      actionText = `Provide evidence that the recommended product is available in size ${expectedVal || 'requested'}. If that cannot be established, do not present it as satisfying the size requirement.`;
    } else if (attr === 'hiking' || attr === 'use_case' || attr === 'activity') {
      actionText = `Provide evidence that the recommended product is suitable for ${expectedVal || shopperText}. If that cannot be established, do not present it as satisfying this use case.`;
    } else if (attr === 'waterproof' || attr === 'weather_protection') {
      actionText = `Provide evidence that the recommended product provides waterproof protection. If that cannot be established, do not present it as satisfying the waterproof requirement.`;
    } else if (attr === 'fragrance' || attr === 'fragrance_free') {
      actionText = `Provide evidence that the recommended product is fragrance-free. If that cannot be established, do not present it as satisfying this requirement.`;
    } else if (attr === 'organic') {
      actionText = `Provide evidence that the recommended product is certified organic. If that cannot be established, do not present it as satisfying the organic requirement.`;
    } else if (attr === 'skin_type' || attr === 'sensitive_skin') {
      actionText = `Provide evidence that the recommended product is suitable for sensitive skin. If that cannot be established, do not present it as satisfying this suitability requirement.`;
    } else {
      actionText = `Provide evidence that the recommended product satisfies the "${shopperText}" requirement. If that cannot be established, do not present it as satisfying this requirement.`;
    }

    const linkedRootCauses = rootCauses.filter(
      (rc) => rc.constraintIds.includes(cId) || rc.verificationIds.includes(v.id)
    );
    const linkedRubricCriterion = productRubric?.criteria.find((cr) => cr.sourceConstraintId === cId);

    recommendations.push({
      recommendationId: '',
      productId: pId,
      productName: pName,
      type: 'PROVIDE_OR_OBTAIN_EVIDENCE',
      priority: isHard ? 'MEDIUM' : 'LOW',
      title: `Provide evidence for ${attr} requirement ("${shopperText}")`,
      action: actionText,
      reason: `The shopper requested "${shopperText}", but the assistant response did not provide affirmative evidence addressing this attribute. UNKNOWN is not counted as a failure.`,
      shopperEvidence: [shopperText],
      assistantEvidence: ['Missing from assistant response'],
      constraintIds: [cId],
      claimIds: [],
      verificationIds: [v.id],
      rubricCriterionIds: linkedRubricCriterion ? [linkedRubricCriterion.criterionId] : [],
      rootCauseIds: linkedRootCauses.map((rc) => rc.causeId),
      confidence: 0.95,
    });
  }

  // ==========================================================================
  // 4. CATEGORY MISMATCH (IMPROVE_PRODUCT_SELECTION)
  // ==========================================================================
  const catMismatchCauses = rootCauses.filter((rc) => rc.code === 'CAT-01');
  for (const rc of catMismatchCauses) {
    recommendations.push({
      recommendationId: '',
      productId: pId,
      productName: pName,
      type: 'IMPROVE_PRODUCT_SELECTION',
      priority: 'MEDIUM',
      title: `Align product category with requested category`,
      action: `Select a product from the requested category rather than an alternative product category.`,
      reason: rc.explanation || 'The recommended product is outside the shopper’s target category.',
      shopperEvidence: rc.shopperEvidence,
      assistantEvidence: rc.assistantEvidence,
      constraintIds: rc.constraintIds,
      claimIds: rc.claimIds,
      verificationIds: rc.verificationIds,
      rubricCriterionIds: rc.rubricCriterionIds,
      rootCauseIds: [rc.causeId],
      confidence: 0.95,
    });
  }

  // ==========================================================================
  // 5. NO OBSERVED REQUIREMENT FAILURE (NO_REMEDIATION_REQUIRED)
  // ==========================================================================
  const hasNoFailureCause = rootCauses.some((rc) => rc.code === 'NO_FAILURE');
  const hasZeroFailures = failedVerifications.length === 0;
  const hasZeroHardUnknown = verifications.filter((v) => v.status === 'UNKNOWN' && v.constraintType === 'hard').length === 0;

  if (hasNoFailureCause || (hasZeroFailures && hasZeroHardUnknown && promptAnalysis.constraints.length > 0)) {
    const noFailRc = rootCauses.find((rc) => rc.code === 'NO_FAILURE');
    recommendations.push({
      recommendationId: '',
      productId: pId,
      productName: pName,
      type: 'NO_REMEDIATION_REQUIRED',
      priority: 'NONE',
      title: `No Requirement Remediation Required`,
      action: `No requirement-level remediation is required based on the evidence currently present in the assistant response.`,
      reason: `All stated shopper requirements were evaluated and satisfied based on affirmative evidence in the assistant response. No requirement failures or omissions were observed.`,
      shopperEvidence: noFailRc?.shopperEvidence || promptAnalysis.constraints.map((c) => c.sourceText),
      assistantEvidence: noFailRc?.assistantEvidence || ['Requirements affirmatively supported'],
      constraintIds: noFailRc?.constraintIds || promptAnalysis.constraints.map((c) => c.id),
      claimIds: noFailRc?.claimIds || [],
      verificationIds: noFailRc?.verificationIds || verifications.map((v) => v.id),
      rubricCriterionIds: noFailRc?.rubricCriterionIds || [],
      rootCauseIds: noFailRc ? [noFailRc.causeId] : [],
      confidence: 1.0,
    });
  }

  // ==========================================================================
  // 6. EXTERNALLY UNVERIFIED FACTUAL CLAIMS (VERIFY_EXTERNAL_FACT)
  // ==========================================================================
  // Independent verification recommendations coexist informatively with requirement findings
  const materialClaims = claims.filter(
    (c) => c.nature === 'factual' && c.externalTruthStatus === 'UNVERIFIED'
  );

  // Group or take highest priority material claims (e.g., price or key specifications)
  const highPriorityClaims = materialClaims.filter((c) => c.verificationPriority === 'HIGH');
  const claimsToVerify = highPriorityClaims.length > 0 ? highPriorityClaims : materialClaims.slice(0, 2);

  for (const claim of claimsToVerify) {
    recommendations.push({
      recommendationId: '',
      productId: pId,
      productName: pName,
      type: 'VERIFY_EXTERNAL_FACT',
      priority: 'INFORMATIONAL',
      title: `Verify external claim (${claim.attribute}: "${claim.statement}")`,
      action: `Verify the stated ${claim.attribute} ("${claim.statement}") against an authoritative current product source before treating the claim as independently confirmed.`,
      reason: `The assistant asserts "${claim.statement}", which is material to evaluation but has not undergone external catalog verification. UNVERIFIED claims are not assumed false.`,
      shopperEvidence: [],
      assistantEvidence: [claim.sourceEvidence || claim.statement],
      constraintIds: [],
      claimIds: [claim.claimId],
      verificationIds: [],
      rubricCriterionIds: [],
      rootCauseIds: rootCauses.filter((rc) => rc.code === 'UFC-01' || rc.code === 'HAL-01').map((rc) => rc.causeId),
      confidence: 0.95,
    });
  }

  return recommendations;
}

/**
 * Executes Checkpoint 9 Recommendation Analysis across all products in the response.
 */
export function runRecommendationEngine(
  promptAnalysis: UserPromptAnalysisResult,
  claimAnalysis: LlmOutputClaimAnalysisResult,
  verificationResult: VerificationEngineResult,
  rubricResult: RubricEngineResult,
  claimSupportResult: ClaimSupportAnalysisResult,
  rootCauseResult: RootCauseAnalysisResult,
  severityResult: SeverityAndScoringResult
): RecommendationEngineResult {
  const products: ExtractedProduct[] =
    claimAnalysis.products.length > 0
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

  const allProductRecommendations: Record<string, ActionableRecommendation[]> = {};
  const unindexedRecommendations: ActionableRecommendation[] = [];

  for (const product of products) {
    const productRecs = generateProductRecommendations(
      product,
      promptAnalysis,
      claimAnalysis,
      verificationResult,
      rubricResult,
      claimSupportResult,
      rootCauseResult,
      severityResult
    );
    allProductRecommendations[product.id] = productRecs;
    unindexedRecommendations.push(...productRecs);
  }

  // Deterministic Ordering:
  // 1. Priority (CRITICAL -> HIGH -> MEDIUM -> LOW -> INFORMATIONAL -> NONE)
  // 2. Type Rank (Failures before missing evidence before external verification)
  // 3. Product ID order
  // 4. Stable title order
  unindexedRecommendations.sort((a, b) => {
    const pRankA = PRIORITY_RANK[a.priority];
    const pRankB = PRIORITY_RANK[b.priority];
    if (pRankA !== pRankB) return pRankA - pRankB;

    const tRankA = TYPE_RANK[a.type] || 99;
    const tRankB = TYPE_RANK[b.type] || 99;
    if (tRankA !== tRankB) return tRankA - tRankB;

    const prodA = a.productId || '';
    const prodB = b.productId || '';
    if (prodA !== prodB) return prodA.localeCompare(prodB);

    return a.title.localeCompare(b.title);
  });

  // Assign sequential recommendation IDs: REC1, REC2, REC3...
  const finalRecommendations: ActionableRecommendation[] = unindexedRecommendations.map((r, index) => ({
    ...r,
    recommendationId: `REC${index + 1}`,
  }));

  // Build product-level summaries
  const productSummaries: Record<string, ProductRecommendationSummary> = {};
  const productsList: ProductRecommendationSummary[] = [];

  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let informationalCount = 0;
  let noneCount = 0;

  let productsRequiringCorrection = 0;
  let productsRequiringMoreEvidence = 0;
  let productsWithNoRequirementRemediation = 0;

  for (const product of products) {
    const pId = product.id;
    const pRecs = finalRecommendations.filter((r) => r.productId === pId);

    const pCrit = pRecs.filter((r) => r.priority === 'CRITICAL').length;
    const pHigh = pRecs.filter((r) => r.priority === 'HIGH').length;
    const pMed = pRecs.filter((r) => r.priority === 'MEDIUM').length;
    const pLow = pRecs.filter((r) => r.priority === 'LOW').length;
    const pInfo = pRecs.filter((r) => r.priority === 'INFORMATIONAL').length;
    const pNone = pRecs.filter((r) => r.priority === 'NONE').length;

    const requiresCorrection = pRecs.some(
      (r) =>
        r.type === 'CORRECT_OR_REPLACE' ||
        r.type === 'HONOR_NEGATIVE_CONSTRAINT' ||
        r.type === 'ADDRESS_SAFETY_SENSITIVITY' ||
        r.type === 'IMPROVE_INTENT_ALIGNMENT'
    );
    const requiresMoreEvidence = pRecs.some(
      (r) => r.type === 'PROVIDE_OR_OBTAIN_EVIDENCE' || r.type === 'RESOLVE_CONTRADICTION'
    );
    const requiresExternalVerification = pRecs.some((r) => r.type === 'VERIFY_EXTERNAL_FACT');
    const hasNoRequirementRemediation =
      pRecs.some((r) => r.type === 'NO_REMEDIATION_REQUIRED') && !requiresCorrection && !requiresMoreEvidence;

    if (requiresCorrection) productsRequiringCorrection++;
    if (requiresMoreEvidence) productsRequiringMoreEvidence++;
    if (hasNoRequirementRemediation) productsWithNoRequirementRemediation++;

    const summary: ProductRecommendationSummary = {
      productId: pId,
      productName: product.name,
      recommendations: pRecs,
      totalRecommendations: pRecs.length,
      criticalCount: pCrit,
      highCount: pHigh,
      mediumCount: pMed,
      lowCount: pLow,
      informationalCount: pInfo,
      noneCount: pNone,
      requiresCorrection,
      requiresMoreEvidence,
      requiresExternalVerification,
      hasNoRequirementRemediation,
    };

    productSummaries[pId] = summary;
    productsList.push(summary);
  }

  // Cart-Wide Recommendations (Checkpoint 14C.1)
  if (verificationResult.cartEvaluation && verificationResult.cartEvaluation.cartHardGateState !== 'HARD_GATE_PASS') {
    const cartEval = verificationResult.cartEvaluation;
    finalRecommendations.unshift({
      recommendationId: `REC_CART_1`,
      productId: null,
      productName: 'Shopping Cart',
      type: cartEval.hasCartFailure ? 'CORRECT_OR_REPLACE' : 'PROVIDE_OR_OBTAIN_EVIDENCE',
      priority: cartEval.hasCartFailure ? 'CRITICAL' : 'HIGH',
      title: cartEval.hasCartFailure ? 'Correct Shopping Cart Requirements' : 'Clarify Shopping Cart Evidence',
      action: cartEval.hasCartFailure ? 'Revise item selection, requested quantities, or unit prices to satisfy every mandatory cart requirement. Do not reduce quantities below the shopper\'s request.' : 'Provide explicit quantities and unit prices, include every requested category, and reconcile conflicting stated totals before approving the cart.',
      reason: cartEval.rationale,
      shopperEvidence: cartEval.verifications.map((v) => v.constraintEvidence),
      assistantEvidence: cartEval.cartItems.map((it) => `${it.quantity ?? 'Unknown'}x ${it.productName} ($${it.lineTotal ?? '?'})`),
      constraintIds: cartEval.verifications.map((v) => v.constraintId),
      claimIds: [],
      verificationIds: cartEval.verifications.map((v) => v.id),
      rubricCriterionIds: [],
      rootCauseIds: rootCauseResult.records.filter(r => r.productName === 'Shopping Cart').map(r => r.causeId),
      confidence: 1.0,
    });
  }

  finalRecommendations.forEach((r) => {
    switch (r.priority) {
      case 'CRITICAL':
        criticalCount++;
        break;
      case 'HIGH':
        highCount++;
        break;
      case 'MEDIUM':
        mediumCount++;
        break;
      case 'LOW':
        lowCount++;
        break;
      case 'INFORMATIONAL':
        informationalCount++;
        break;
      case 'NONE':
        noneCount++;
        break;
    }
  });

  const overallSummary: RecommendationResponseSummary = {
    totalRecommendations: finalRecommendations.length,
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    low: lowCount,
    informational: informationalCount,
    none: noneCount,
    productsRequiringCorrection,
    productsRequiringMoreEvidence,
    productsWithNoRequirementRemediation,
  };

  return {
    state: 'RECOMMENDATIONS_COMPLETE_FINAL_EVALUATION_NOT_YET_GENERATED',
    analyzedAt: new Date().toISOString(),
    recommendations: finalRecommendations,
    productSummaries,
    productsList,
    overallSummary,
    rawJson: {
      recommendations: finalRecommendations,
      overallSummary,
      metadata: {
        engine: 'checkpoint-9-recommendation-engine-v1',
        totalProductsEvaluated: products.length,
        hardGateAuthoritative: true,
        finalEvaluationGenerated: false,
      },
    },
  };
}

export class DefaultRecommendationEngine {
  generateRecommendations = runRecommendationEngine;
}

export const defaultRecommendationEngine = new DefaultRecommendationEngine();
