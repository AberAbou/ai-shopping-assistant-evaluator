import {
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  VerificationEngineResult,
  RubricEngineResult,
  ClaimSupportAnalysisResult,
  RootCauseRecord,
  ProductRootCauseSummary,
  RootCauseAnalysisResult,
  RootCauseCode,
  RootCauseCategory,
} from '../../types/evaluation';

/**
 * Root-Cause / Failure Mode Diagnostic Analyzer
 * Analyzes observable evidence from Checkpoints 2–6 to classify diagnostic failure causes.
 * Strictly adheres to empirical observations without speculating on model internals.
 */
export function analyzeRootCauses(
  promptAnalysis: UserPromptAnalysisResult,
  claimAnalysis: LlmOutputClaimAnalysisResult,
  verificationResult: VerificationEngineResult,
  rubricResult: RubricEngineResult,
  claimSupportResult: ClaimSupportAnalysisResult,
  _userPrompt: string,
  _llmOutput: string
): RootCauseAnalysisResult {
  const records: RootCauseRecord[] = [];
  const productSummaries: Record<string, ProductRootCauseSummary> = {};
  const productsList: ProductRootCauseSummary[] = [];

  let recordCounter = 1;
  const generateCauseId = () => `RC${recordCounter++}`;

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

  for (const product of products) {
    const pId = product.id;
    const pName = product.name;

    const pRecords: RootCauseRecord[] = [];

    // Retrieve relevant product-level artifacts with robust fallback matching
    const productVerifications = verificationResult.records.filter(
      (v) =>
        v.productId === pId ||
        (v.productName && pName && v.productName.toLowerCase() === pName.toLowerCase()) ||
        (products.length === 1 && (!v.productId || v.productId === 'P1'))
    );

    const productRubric =
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

    const productClaims = claimSupportResult.records.filter(
      (c) =>
        c.productId === pId ||
        (c.productName && pName && c.productName.toLowerCase() === pName.toLowerCase()) ||
        (products.length === 1 && (!c.productId || c.productId === 'P1'))
    );

    // 1. Check for Internal Factual Contradictions (FAC-01)
    const contradictedClaims = productClaims.filter((c) => c.internalConsistency === 'CONTRADICTED');
    if (contradictedClaims.length > 0) {
      const allConflictingEvidence = Array.from(new Set(contradictedClaims.map((c) => c.sourceEvidence)));
      const linkedVerification = productVerifications.find((v) => v.conflictDetected);

      pRecords.push({
        causeId: generateCauseId(),
        code: 'FAC-01',
        category: 'INTERNAL_FACTUAL_CONTRADICTION',
        role: linkedVerification && linkedVerification.constraintType === 'hard' ? 'primary' : 'contributing',
        productId: pId,
        productName: pName,
        constraintIds: linkedVerification ? [linkedVerification.constraintId] : [],
        claimIds: contradictedClaims.map((c) => c.claimId),
        verificationIds: linkedVerification ? [linkedVerification.id] : [],
        rubricCriterionIds: linkedVerification ? [`R${linkedVerification.constraintId.replace('C', '')}`] : [],
        shopperEvidence: linkedVerification ? [linkedVerification.constraintEvidence] : [],
        assistantEvidence: allConflictingEvidence,
        explanation: `The assistant output contains mutually contradictory assertions for ${pName}: conflicting evidence detected across stated attributes ("${allConflictingEvidence.join('", "')}").`,
        confidence: 0.99,
      });
    }

    // 2. Check for Hard Constraint Failures (NC-01 vs INT-01 vs HC-01)
    const failedVerifications = productVerifications.filter((v) => v.status === 'FAIL');

    for (const failV of failedVerifications) {
      const constraint = promptAnalysis.constraints.find((c) => c.id === failV.constraintId);
      const isNegative = constraint?.polarity === 'negative' || failV.polarity === 'negative';
      const attr = failV.constraintAttribute.toLowerCase();

      // Case A: Confirmed Safety / Allergen Conflict (SAF-01)
      const isSafetyConflict =
        (attr === 'safety' || attr === 'allergen' || constraint?.attribute === 'safety' || constraint?.attribute === 'allergen') ||
        (failV.conflictDetected && (attr.includes('allergen') || attr.includes('safe')));

      if (isSafetyConflict) {
        pRecords.push({
          causeId: generateCauseId(),
          code: 'SAF-01',
          category: 'SAFETY_OR_SENSITIVITY_RISK',
          role: 'primary',
          productId: pId,
          productName: pName,
          constraintIds: [failV.constraintId],
          claimIds: productClaims.filter((c) => failV.claimEvidence.includes(c.sourceEvidence)).map((c) => c.claimId),
          verificationIds: [failV.id],
          rubricCriterionIds: [`R${failV.constraintId.replace('C', '')}`],
          shopperEvidence: [failV.constraintEvidence],
          assistantEvidence: failV.claimEvidence,
          explanation: `The recommended product explicitly conflicts with the shopper's stated safety or allergen requirement ("${failV.constraintEvidence}"): product specifies ${failV.claimEvidence.join(', ')}.`,
          confidence: failV.confidence,
        });
      }
      // Case B: Negative Constraint / Exclusion Violation (NC-01)
      else if (isNegative) {
        pRecords.push({
          causeId: generateCauseId(),
          code: 'NC-01',
          category: 'NEGATIVE_CONSTRAINT_VIOLATION',
          role: 'primary',
          productId: pId,
          productName: pName,
          constraintIds: [failV.constraintId],
          claimIds: productClaims.filter((c) => failV.claimEvidence.includes(c.sourceEvidence)).map((c) => c.claimId),
          verificationIds: [failV.id],
          rubricCriterionIds: [`R${failV.constraintId.replace('C', '')}`],
          shopperEvidence: [failV.constraintEvidence],
          assistantEvidence: failV.claimEvidence,
          explanation: `The recommended product violates the shopper's explicit negative exclusion ("${failV.constraintEvidence}"): product specifies ${failV.claimEvidence.join(', ')}.`,
          confidence: failV.confidence,
        });
      }
      // Case C: Intent / Environmental / Seasonal / Activity Mismatch (INT-01)
      else if (attr === 'season' || attr === 'use_case' || attr === 'climate' || failV.reason.toLowerCase().includes('contradict')) {
        pRecords.push({
          causeId: generateCauseId(),
          code: 'INT-01',
          category: 'INTENT_MISMATCH',
          role: 'primary',
          productId: pId,
          productName: pName,
          constraintIds: [failV.constraintId],
          claimIds: productClaims.filter((c) => failV.claimEvidence.includes(c.sourceEvidence)).map((c) => c.claimId),
          verificationIds: [failV.id],
          rubricCriterionIds: [`R${failV.constraintId.replace('C', '')}`],
          shopperEvidence: [failV.constraintEvidence],
          assistantEvidence: failV.claimEvidence,
          explanation: `The recommended product conflicts with the shopper's intended season, activity, or core use case ("${failV.constraintEvidence}"): product specifies ${failV.claimEvidence.join(', ')}.`,
          confidence: failV.confidence,
        });
      }
      // Case D: Standard Hard Constraint Violation (HC-01 e.g. price ceiling)
      else {
        pRecords.push({
          causeId: generateCauseId(),
          code: 'HC-01',
          category: 'HARD_CONSTRAINT_VIOLATION',
          role: 'primary',
          productId: pId,
          productName: pName,
          constraintIds: [failV.constraintId],
          claimIds: productClaims.filter((c) => failV.claimEvidence.includes(c.sourceEvidence)).map((c) => c.claimId),
          verificationIds: [failV.id],
          rubricCriterionIds: [`R${failV.constraintId.replace('C', '')}`],
          shopperEvidence: [failV.constraintEvidence],
          assistantEvidence: failV.claimEvidence,
          explanation: `The recommendation violates the shopper's stated non-negotiable requirement ("${failV.constraintEvidence}"): ${failV.reason}`,
          confidence: failV.confidence,
        });
      }
    }

    // 3. Check for Missing Evidence (RET-01 vs DAT-01)
    const unknownHardVerifications = productVerifications.filter(
      (v) => v.status === 'UNKNOWN' && v.constraintType === 'hard' && !v.conflictDetected
    );

    // If multiple hard constraints are unknown and no hard failure occurred, RET-01 is primary
    if (unknownHardVerifications.length >= 2 && failedVerifications.length === 0 && contradictedClaims.length === 0) {
      const missingAttributes = unknownHardVerifications.map((v) => v.constraintAttribute);
      pRecords.push({
        causeId: generateCauseId(),
        code: 'RET-01',
        category: 'INSUFFICIENT_REQUIREMENT_EVIDENCE',
        role: 'primary',
        productId: pId,
        productName: pName,
        constraintIds: unknownHardVerifications.map((v) => v.constraintId),
        claimIds: [],
        verificationIds: unknownHardVerifications.map((v) => v.id),
        rubricCriterionIds: unknownHardVerifications.map((v) => `R${v.constraintId.replace('C', '')}`),
        shopperEvidence: unknownHardVerifications.map((v) => v.constraintEvidence),
        assistantEvidence: [],
        explanation: `The assistant recommends ${pName} but does not provide sufficient evidence to establish whether multiple required shopper attributes (${missingAttributes.join(', ')}) are satisfied.`,
        confidence: 0.95,
      });
    }

    // Add individual DAT-01 records for missing evidence
    for (const unkV of unknownHardVerifications) {
      pRecords.push({
        causeId: generateCauseId(),
        code: 'DAT-01',
        category: 'MISSING_EVIDENCE',
        role: 'contributing',
        productId: pId,
        productName: pName,
        constraintIds: [unkV.constraintId],
        claimIds: [],
        verificationIds: [unkV.id],
        rubricCriterionIds: [`R${unkV.constraintId.replace('C', '')}`],
        shopperEvidence: [unkV.constraintEvidence],
        assistantEvidence: [],
        explanation: `Evidence needed to evaluate the shopper's requirement ("${unkV.constraintEvidence}") is absent from the assistant output.`,
        confidence: 0.95,
      });
    }

    // 5. Check for No Observed Failure State (NO_FAILURE)
    const hasPrimaryFailures = pRecords.some((r) => r.role === 'primary' && r.code !== 'NO_FAILURE');
    const noFailedVerifications = failedVerifications.length === 0;
    const noUnknownHard = unknownHardVerifications.length === 0;
    const noContradictions = contradictedClaims.length === 0;

    const isHardGatePass =
      productRubric?.hardGateState === 'HARD_GATE_PASS' ||
      (noFailedVerifications &&
        noUnknownHard &&
        (productVerifications.length > 0 || promptAnalysis.constraints.length > 0));

    if (!hasPrimaryFailures && isHardGatePass && noFailedVerifications && noUnknownHard && noContradictions) {
      const rubricIds = productRubric?.criteria?.map((c) => c.criterionId) ||
        promptAnalysis.constraints.map((c) => `R${c.id.replace('C', '')}`);

      pRecords.push({
        causeId: generateCauseId(),
        code: 'NO_FAILURE',
        category: 'NO_OBSERVED_FAILURE',
        role: 'primary',
        productId: pId,
        productName: pName,
        constraintIds: promptAnalysis.constraints.map((c) => c.id),
        claimIds: productClaims.map((c) => c.claimId),
        verificationIds: productVerifications.map((v) => v.id),
        rubricCriterionIds: rubricIds,
        shopperEvidence: promptAnalysis.constraints.map((c) => c.sourceText),
        assistantEvidence: productClaims.map((c) => c.sourceEvidence),
        explanation: `All stated shopper requirements were evaluated and satisfied based on affirmative evidence in the assistant response. No requirement failures or omissions were observed. Independent external factual verification has not been performed.`,
        confidence: 1.0,
      });
    }

    // 7. Unverified Material Factual Claims (UFC-01, formerly HAL-01)
    // Surface UFC-01 for high-priority material claims (price, warranty, sensitive ingredients)
    // Coexists independently with NO_FAILURE; external truth is UNVERIFIED, which does NOT mean false.
    const materialClaims = productClaims.filter(
      (c) =>
        c.externalTruthStatus === 'UNVERIFIED' &&
        c.verificationPriority === 'HIGH' &&
        !c.attribute.includes('hypoallergenic') // avoid duplicate with SAF-01
    );

    if (materialClaims.length > 0) {
      pRecords.push({
        causeId: generateCauseId(),
        code: 'UFC-01',
        category: 'UNVERIFIED_FACTUAL_CLAIM',
        role: 'contributing',
        productId: pId,
        productName: pName,
        constraintIds: [],
        claimIds: materialClaims.map((c) => c.claimId),
        verificationIds: [],
        rubricCriterionIds: [],
        shopperEvidence: [],
        assistantEvidence: materialClaims.map((c) => `"${c.attribute}: ${c.sourceEvidence}"`),
        explanation: `The response makes material factual claims (${materialClaims.map((c) => c.attribute).join(', ')}) that lack independent verification in the current evaluator context. Note: External truth status is UNVERIFIED; independent external factual verification has not been performed, and this does not mean the claims are false.`,
        confidence: 0.95,
      });
    }

    const primaryCauses = pRecords.filter((r) => r.role === 'primary');
    const contributingCauses = pRecords.filter((r) => r.role === 'contributing');

    const summary: ProductRootCauseSummary = {
      productId: pId,
      productName: pName,
      primaryCauses,
      contributingCauses,
      observedHardFailures: failedVerifications.length,
      observedUnknownRequirements: unknownHardVerifications.length,
      unsupportedMaterialClaims: materialClaims.length,
      internalContradictions: contradictedClaims.length,
      safetyRelevantIssues: pRecords.filter((r) => r.code === 'SAF-01').length,
      diagnosticConfidence: 0.96,
      hasObservedFailure: failedVerifications.length > 0 || unknownHardVerifications.length > 0 || contradictedClaims.length > 0,
    };

    records.push(...pRecords);
    productSummaries[pId] = summary;
    productsList.push(summary);
  }

  // 7. Ranking / Selection Failure Check (Response-Level RNK-01)
  // Only triggered if multiple products exist AND assistant explicitly promotes/favors a worse option
  if (products.length >= 2) {
    // Check if the response text contains explicit favoring language ("I recommend Option A over Option B", "Option A is superior")
    const favorsMatch = _llmOutput.match(/(?:recommend|prefer|choose)\s+([A-Za-z0-9\s-]+?)\s+(?:over|instead of|rather than)\s+([A-Za-z0-9\s-]+)/i);
    if (favorsMatch) {
      const favoredName = favorsMatch[1].trim();
      const disfavoredName = favorsMatch[2].trim();
      const pFavored = productsList.find((p) => p.productName.toLowerCase().includes(favoredName.toLowerCase()));
      const pDisfavored = productsList.find((p) => p.productName.toLowerCase().includes(disfavoredName.toLowerCase()));

      if (pFavored && pDisfavored && pFavored.observedHardFailures > pDisfavored.observedHardFailures) {
        records.push({
          causeId: generateCauseId(),
          code: 'RNK-01',
          category: 'RANKING_OR_SELECTION_FAILURE',
          role: 'primary',
          productId: pFavored.productId,
          productName: pFavored.productName,
          constraintIds: [],
          claimIds: [],
          verificationIds: [],
          rubricCriterionIds: [],
          shopperEvidence: [],
          assistantEvidence: [favorsMatch[0]],
          explanation: `The response explicitly favored ${pFavored.productName} over ${pDisfavored.productName}, despite ${pFavored.productName} failing more shopper hard requirements based on observable evidence.`,
          confidence: 0.90,
        });
      }
    }
  }

  // Aggregate Overall Summary
  const primaryIssuesCount = records.filter((r) => r.role === 'primary').length;
  const contributingIssuesCount = records.filter((r) => r.role === 'contributing').length;
  const productsWithFailures = productsList.filter((p) => p.observedHardFailures > 0).length;
  const productsIndeterminate = productsList.filter((p) => p.observedHardFailures === 0 && (p.observedUnknownRequirements > 0 || p.internalContradictions > 0)).length;
  const productsWithNoObservedFailure = productsList.filter((p) => !p.hasObservedFailure).length;
  const totalContradictions = records.filter((r) => r.code === 'FAC-01').length;
  const totalSafetyRisks = records.filter((r) => r.code === 'SAF-01').length;

  return {
    state: 'ROOT_CAUSE_ANALYSIS_COMPLETE_RECOMMENDATIONS_NOT_YET_GENERATED',
    analyzedAt: new Date().toISOString(),
    records,
    productSummaries,
    productsList,
    overallSummary: {
      totalDiagnosedIssues: records.length,
      primaryIssuesCount,
      contributingIssuesCount,
      productsWithFailures,
      productsIndeterminate,
      productsWithNoObservedFailure,
      totalContradictions,
      totalSafetyRisks,
    },
    rawJson: {
      records,
      productSummaries,
      metadata: {
        engine: 'root-cause-failure-classifier-v1',
        totalDiagnoses: records.length,
      },
    },
  };
}

export const defaultRootCauseAnalyzer = {
  analyzeRootCauses,
};
