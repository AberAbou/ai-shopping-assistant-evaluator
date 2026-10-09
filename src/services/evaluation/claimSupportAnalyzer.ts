import {
  ExtractedClaim,
  ExtractedProduct,
  ClaimSupportRecord,
  ProductClaimSupportSummary,
  ClaimSupportAnalysisResult,
  VerificationPriority,
  InternalConsistencyStatus,
} from '../../types/evaluation';
import { featureAssertions } from './featurePolarity';

/**
 * Internal contradiction detection across extracted claims.
 * Identifies incompatible claims asserting opposing facts for the same product.
 */
function findContradictingClaims(
  claim: ExtractedClaim,
  allClaims: ExtractedClaim[]
): { isContradicted: boolean; conflictingIds: string[]; conflictingEvidence: string[] } {
  const pId = claim.productId;
  const sameProductClaims = allClaims.filter(
    (c) => c.productId === pId || (!claim.productId && !c.productId)
  );

  // Coordinated feature negation must also agree with verification conflicts.
  const ownFeatures = featureAssertions(claim.sourceText).filter(a => a.attribute === claim.attribute.replace(/_negated$/, ''));
  for (const own of ownFeatures) {
    const conflicting = sameProductClaims.filter(c => c.id !== claim.id && c.attribute.replace(/_negated$/, '') === own.attribute && featureAssertions(c.sourceText).some(a => a.value === own.value && a.negative !== own.negative));
    if (conflicting.length) return { isContradicted: true, conflictingIds: conflicting.map(c => c.id), conflictingEvidence: conflicting.map(c => c.sourceText) };
  }

  // Check 1: Waterproof vs Not Waterproof
  if (claim.attribute === 'water_resistance' || claim.attribute === 'water_resistance_negated') {
    const positive = sameProductClaims.find(
      (c) => c.attribute === 'water_resistance' && /\bwaterproof\b/i.test(c.sourceText) && !/\bnot waterproof\b/i.test(c.sourceText)
    );
    const negative = sameProductClaims.find(
      (c) => c.attribute === 'water_resistance_negated' || /\b(?:not waterproof|unwaterproof|non-waterproof)\b/i.test(c.sourceText)
    );

    if (positive && negative && positive.id !== negative.id) {
      if (claim.id === positive.id) {
        return { isContradicted: true, conflictingIds: [negative.id], conflictingEvidence: [negative.sourceText] };
      }
      if (claim.id === negative.id) {
        return { isContradicted: true, conflictingIds: [positive.id], conflictingEvidence: [positive.sourceText] };
      }
    }
  }

  return { isContradicted: false, conflictingIds: [], conflictingEvidence: [] };
}

/**
 * Assigns structured verification priority based on the potential impact of an unverified claim.
 */
function assignVerificationPriority(
  claim: ExtractedClaim,
  isContradicted: boolean
): VerificationPriority {
  if (isContradicted) {
    return 'HIGH';
  }

  if (claim.nature === 'subjective') {
    return 'LOW';
  }

  const type = claim.claimType;
  const attr = claim.attribute.toLowerCase();
  const val = String(claim.value).toLowerCase();

  // HIGH PRIORITY: Safety, Medical/Sensitivity, Composition/Ingredients, Warranty, Certification, Price
  if (
    type === 'safety' ||
    type === 'sensitivity' ||
    type === 'composition' ||
    type === 'warranty' ||
    type === 'certification' ||
    type === 'price' ||
    attr === 'skin_type' ||
    attr === 'hypoallergenic' ||
    attr === 'warranty' ||
    attr === 'price' ||
    val.includes('hypoallergenic') ||
    val.includes('lavender') ||
    val.includes('warranty')
  ) {
    return 'HIGH';
  }

  // MEDIUM PRIORITY: Performance Specs, Ratings/Reviews, Material Specifications, Availability
  if (
    type === 'performance' ||
    type === 'rating' ||
    type === 'review_count' ||
    type === 'material' ||
    type === 'availability' ||
    attr === 'weight' ||
    attr === 'customer_rating'
  ) {
    return 'MEDIUM';
  }

  // LOW PRIORITY: General descriptive features, color, standard attributes
  return 'LOW';
}

/**
 * Claim Support & Hallucination-Risk Analyzer
 * Distinguishes response support, internal consistency, and external truth status.
 */
export function analyzeClaimSupport(
  claims: ExtractedClaim[],
  products: ExtractedProduct[],
  _llmOutput: string
): ClaimSupportAnalysisResult {
  const records: ClaimSupportRecord[] = [];
  const productSummaries: Record<string, ProductClaimSupportSummary> = {};

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

  // Initialize product summaries
  for (const p of effectiveProducts) {
    productSummaries[p.id] = {
      productId: p.id,
      productName: p.name,
      totalClaims: 0,
      factualClaims: 0,
      subjectiveClaims: 0,
      internallyContradictedClaims: 0,
      externallyUnverifiedClaims: 0,
      highPriorityClaims: 0,
      mediumPriorityClaims: 0,
      lowPriorityClaims: 0,
    };
  }

  // Evaluate each claim
  for (const claim of claims) {
    const pId = claim.productId || (effectiveProducts.length === 1 ? effectiveProducts[0].id : null);
    const pName = claim.productName || (pId && productSummaries[pId] ? productSummaries[pId].productName : null);

    const isSubjective = claim.nature === 'subjective';
    const contradictionCheck = findContradictingClaims(claim, claims);
    const isContradicted = contradictionCheck.isContradicted;

    let internalConsistency: InternalConsistencyStatus = 'CONSISTENT';
    if (isContradicted) {
      internalConsistency = 'CONTRADICTED';
    }

    const priority = assignVerificationPriority(claim, isContradicted);

    let reason = '';
    if (isSubjective) {
      reason = 'Subjective or evaluative assertion; not objectively verifiable as written. Not treated as a factual hallucination.';
    } else if (isContradicted) {
      reason = `Internally contradicted by conflicting assertion in assistant output ("${contradictionCheck.conflictingEvidence.join('", "')}"). External truth status is UNVERIFIED.`;
    } else {
      reason = 'The assistant explicitly states this claim, but no independent product source is available in this evaluator context. External truth status is UNVERIFIED.';
    }

    const record: ClaimSupportRecord = {
      claimId: claim.id,
      productId: pId,
      productName: pName,
      claimType: claim.claimType,
      nature: claim.nature,
      attribute: claim.attribute,
      statement: String(claim.value),
      sourceEvidence: claim.sourceText,
      responseSupport: 'SUPPORTED',
      externalTruthStatus: isSubjective ? 'NOT_APPLICABLE' : 'UNVERIFIED',
      internalConsistency,
      verificationPriority: priority,
      reason,
      contradictingClaimIds: isContradicted ? contradictionCheck.conflictingIds : undefined,
    };

    records.push(record);

    // Update product summary if linked
    if (pId && productSummaries[pId]) {
      const pSum = productSummaries[pId];
      pSum.totalClaims++;
      if (isSubjective) {
        pSum.subjectiveClaims++;
      } else {
        pSum.factualClaims++;
        pSum.externallyUnverifiedClaims++;
      }
      if (isContradicted) {
        pSum.internallyContradictedClaims++;
      }
      if (priority === 'HIGH') pSum.highPriorityClaims++;
      else if (priority === 'MEDIUM') pSum.mediumPriorityClaims++;
      else pSum.lowPriorityClaims++;
    }
  }

  // Aggregate overall summary
  const totalClaims = records.length;
  const factualClaims = records.filter((r) => r.nature === 'factual').length;
  const subjectiveClaims = records.filter((r) => r.nature === 'subjective').length;
  const internallyContradictedClaims = records.filter((r) => r.internalConsistency === 'CONTRADICTED').length;
  const externallyUnverifiedClaims = records.filter((r) => r.externalTruthStatus === 'UNVERIFIED').length;
  const highPriorityClaims = records.filter((r) => r.verificationPriority === 'HIGH').length;
  const mediumPriorityClaims = records.filter((r) => r.verificationPriority === 'MEDIUM').length;
  const lowPriorityClaims = records.filter((r) => r.verificationPriority === 'LOW').length;

  return {
    state: 'CLAIM_SUPPORT_ANALYSIS_COMPLETE_EXTERNAL_TRUTH_NOT_PERFORMED',
    analyzedAt: new Date().toISOString(),
    records,
    productSummaries,
    overallSummary: {
      totalClaims,
      factualClaims,
      subjectiveClaims,
      internallyContradictedClaims,
      externallyUnverifiedClaims,
      highPriorityClaims,
      mediumPriorityClaims,
      lowPriorityClaims,
    },
    rawJson: {
      records,
      productSummaries,
      metadata: {
        engine: 'claim-support-hallucination-risk-v1',
        totalRecords: records.length,
        externalTruthVerificationConducted: false,
      },
    },
  };
}
