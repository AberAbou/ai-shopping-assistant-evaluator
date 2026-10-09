import {
  AtomicConstraint,
  ExtractedProduct,
  ExtractedClaim,
  ProductConstraintVerification,
  ProductVerificationSummary,
  VerificationEngineResult,
  VerificationStatus,
  VerificationMethod,
  CartItemEvaluation,
  CartConstraintVerification,
  CartEvaluationResult,
  HardGateState,
} from '../../types/evaluation';
import { isCartConstraint, appliesToProduct } from './shoppingCartSemantics';
import { evaluateShoppingCart } from './shoppingCartEngine';
import { featureAssertions } from './featurePolarity';

/**
 * Deterministic and semantic verification engine.
 * Evaluates each recommended product independently against every shopper constraint
 * based ONLY on the evidence in the assistant's LLM Output.
 */
export function verifyProductConstraintsDeterministically(
  constraints: AtomicConstraint[],
  products: ExtractedProduct[],
  claims: ExtractedClaim[]
): VerificationEngineResult {
  const records: ProductConstraintVerification[] = [];
  const productSummaries: Record<string, ProductVerificationSummary> = {};

  let recordCounter = 1;
  const nextId = () => `V${recordCounter++}`;

  // If no products were explicitly detected, create a fallback general product scope
  const effectiveProducts: ExtractedProduct[] = products.length > 0
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

  // Helper to check for conflicting claims about a specific attribute on a product
  const checkContradictions = (
    productClaims: ExtractedClaim[],
    constraint: AtomicConstraint
  ): { hasConflict: boolean; conflictingEvidence: string[] } => {
    const attr = constraint.attribute.toLowerCase();

    // Check waterproof conflict: "waterproof" vs "not waterproof" / "outer fabric is not waterproof"
    if (attr === 'waterproof' || attr === 'water_resistance') {
      const positiveClaim = productClaims.find(
        (c) => /\bwaterproof\b/i.test(c.sourceText) && !/\bnot waterproof\b/i.test(c.sourceText)
      );
      const negativeClaim = productClaims.find(
        (c) => /\b(?:not waterproof|unwaterproof|non-waterproof)\b/i.test(c.sourceText)
      );

      if (positiveClaim && negativeClaim) {
        return {
          hasConflict: true,
          conflictingEvidence: [positiveClaim.sourceText, negativeClaim.sourceText],
        };
      }
    }

    return { hasConflict: false, conflictingEvidence: [] };
  };

  const cartConstraints = constraints.filter(isCartConstraint);
  const productConstraints = constraints.filter(c => !isCartConstraint(c));

  for (const product of effectiveProducts) {
    const pId = product.id;
    const pName = product.name;

    // Filter claims that belong strictly to this product (or general response claims if single product)
    const productClaims = claims.filter(
      (c) => c.productId === pId || (effectiveProducts.length === 1 && !c.productId)
    );

    const relevantProductConstraints = productConstraints.filter(c => appliesToProduct(c, product));

    const summary: ProductVerificationSummary = {
      productId: pId,
      productName: pName,
      totalConstraintsChecked: 0,
      hardConstraintsPassed: 0,
      hardConstraintsFailed: 0,
      hardConstraintsUnknown: 0,
      softConstraintsPassed: 0,
      softConstraintsFailed: 0,
      softConstraintsUnknown: 0,
      negativeConstraintsPassed: 0,
      negativeConstraintsFailed: 0,
      negativeConstraintsUnknown: 0,
    };

    for (const constraint of relevantProductConstraints) {
      summary.totalConstraintsChecked++;

      let status: VerificationStatus = 'UNKNOWN';
      let method: VerificationMethod = 'deterministic';
      let confidence = 0.95;
      let reason = '';
      let claimEvidence: string[] = [];
      let conflictDetected = false;

      // 1. Contradiction Detection
      const featureValue = String(constraint.expectedValue).toLowerCase();
      const feature = featureValue === 'waterproof' || featureValue === 'insulated';
      const featureEvidence = feature ? productClaims.flatMap(c => featureAssertions(c.sourceText).filter(a => a.value === featureValue)) : [];
      const positiveFeature = featureEvidence.find(a => !a.negative);
      const negativeFeature = featureEvidence.find(a => a.negative);
      const conflictCheck = feature ? { hasConflict: Boolean(positiveFeature && negativeFeature), conflictingEvidence: positiveFeature && negativeFeature ? [positiveFeature.sourceText, negativeFeature.sourceText] : [] } : checkContradictions(productClaims, constraint);
      if (conflictCheck.hasConflict) {
        status = 'UNKNOWN';
        conflictDetected = true;
        method = 'deterministic';
        confidence = 0.99;
        claimEvidence = conflictCheck.conflictingEvidence;
        reason = `Conflicting evidence detected in assistant output for ${constraint.expectedValue} on ${pName}.`;
      } else {
        // 2. Attribute-Specific Verification
        const attr = constraint.attribute.toLowerCase();
        const expectedVal = constraint.expectedValue;
        const op = constraint.operator;
        const isNegative = constraint.polarity === 'negative';

        // CASE A: PRICE CONSTRAINTS
        if (feature) {
          const evidence = positiveFeature ?? negativeFeature;
          if (evidence) {
            status = evidence.negative === isNegative ? 'PASS' : 'FAIL';
            claimEvidence = [evidence.sourceText];
            reason = `Product explicitly ${evidence.negative ? 'denies' : 'asserts'} ${featureValue}; this ${status === 'PASS' ? 'satisfies' : 'violates'} the shopper’s ${isNegative ? 'exclusion' : 'requirement'}.`;
          } else {
            reason = `No explicit evidence establishes presence or absence of ${featureValue} for ${pName}.`;
          }
        } else if (attr === 'conversation_issue') {
          status = 'UNKNOWN';
          reason = `Conversation clarification is required: ${constraint.reasoning ?? constraint.sourceText}`;
        } else if (attr === 'price' || attr === 'budget') {
          method = 'deterministic';
          if (product.price && product.price.amount !== null) {
            const statedPrice = product.price.amount;
            const maxAllowed = typeof expectedVal === 'number' ? expectedVal : parseFloat(String(expectedVal));
            claimEvidence = product.price.sourceText ? [product.price.sourceText] : [`$${statedPrice}`];

            if (product.price.currency !== 'USD') {
              status = 'UNKNOWN';
              reason = `The stated product currency '${product.price.currency || 'Unknown'}' cannot be compared with a USD price requirement without currency conversion.`;
            } else if (product.unitPrice === null) {
              status = 'UNKNOWN';
              reason = 'The product evidence does not establish an unambiguous USD unit price; price compliance remains UNKNOWN.';
            } else if (!isNaN(maxAllowed)) {
              const comparison: Record<string, { matches: boolean; boundary: string }> = {
                '<': { matches: statedPrice < maxAllowed, boundary: 'strictly below' },
                less_than: { matches: statedPrice < maxAllowed, boundary: 'strictly below' },
                '<=': { matches: statedPrice <= maxAllowed, boundary: 'at or below' },
                less_than_or_equal: { matches: statedPrice <= maxAllowed, boundary: 'at or below' },
                '>': { matches: statedPrice > maxAllowed, boundary: 'strictly above' },
                greater_than: { matches: statedPrice > maxAllowed, boundary: 'strictly above' },
                '>=': { matches: statedPrice >= maxAllowed, boundary: 'at or above' },
                greater_than_or_equal: { matches: statedPrice >= maxAllowed, boundary: 'at or above' },
                '==': { matches: statedPrice === maxAllowed, boundary: 'equal to' },
                equals: { matches: statedPrice === maxAllowed, boundary: 'equal to' },
              };
              const rule = comparison[op];
              if (!rule) {
                status = 'UNKNOWN';
                reason = `Unsupported price comparison operator '${op}'; cannot determine compliance.`;
              } else {
                status = rule.matches ? 'PASS' : 'FAIL';
                confidence = 1.0;
                reason = `The stated price of $${statedPrice} ${rule.matches ? 'satisfies' : 'violates'} the shopper's price requirement (${rule.boundary} $${maxAllowed}).`;
              }
            } else {
              status = 'UNKNOWN';
              reason = `Unable to parse numeric price bound from constraint '${expectedVal}'.`;
            }
          } else {
            status = 'UNKNOWN';
            confidence = 0.95;
            reason = `The assistant output does not state a retail price for ${pName}.`;
          }
        }

        // CASE B: MATERIAL EXCLUSIONS (e.g. "no leather")
        else if (isNegative && (attr === 'leather' || String(expectedVal).toLowerCase() === 'leather')) {
          method = 'deterministic';
          const leatherClaim = productClaims.find(
            (c) => c.claimType === 'material' &&
                   /\bleather\b/i.test(String(c.value)) &&
                   !/\b(?:no|non|synthetic)\s+leather\b/i.test(c.sourceText) &&
                   !/\b(?:leather-free|leather\s+free)\b/i.test(c.sourceText)
          );
          const productWideLeatherFreeClaim = productClaims.find(
            (c) => /\b(?:100%\s+leather-free|leather-free|100%\s+vegan)\b/i.test(c.sourceText) ||
                   /\b(?:100%\s+leather-free|leather-free|100%\s+vegan)\b/i.test(String(c.value))
          );
          const syntheticUpperClaim = productClaims.find(
            (c) => c.claimType === 'material' && /\b(?:synthetic mesh|synthetic upper|mesh|vegan)\b/i.test(String(c.value))
          );

          if (leatherClaim) {
            status = 'FAIL';
            confidence = 1.0;
            claimEvidence = [leatherClaim.sourceText];
            reason = `Product explicitly claims to use leather, violating the exclusion constraint.`;
          } else if (productWideLeatherFreeClaim) {
            status = 'PASS';
            confidence = 1.0;
            claimEvidence = [productWideLeatherFreeClaim.sourceText];
            reason = `Product is explicitly claimed to be ${productWideLeatherFreeClaim.sourceText}, providing affirmative evidence that animal leather is excluded across the entire shoe.`;
          } else if (syntheticUpperClaim) {
            status = 'UNKNOWN';
            confidence = 0.90;
            claimEvidence = [syntheticUpperClaim.sourceText];
            reason = `Product specifies a ${syntheticUpperClaim.value}, but evidence about the upper alone does not establish that the entire shoe contains no leather.`;
          } else {
            status = 'UNKNOWN';
            confidence = 0.90;
            reason = `The assistant output does not specify the construction material for ${pName}.`;
          }
        }

        // CASE C: FRAGRANCE-FREE EXCLUSION
        else if (isNegative && (attr === 'fragrance' || attr === 'fragrance_status' || String(expectedVal).toLowerCase().includes('fragrance'))) {
          const directFragranceFreeClaim = productClaims.find(
            (c) => /\bfragrance-free\b/i.test(c.sourceText) || String(c.value).toLowerCase() === 'fragrance-free'
          );
          const containsFragranceClaim = productClaims.find(
            (c) => /\b(?:contains fragrance|fragranced|scented)\b/i.test(c.sourceText)
          );
          const lavenderOilClaim = productClaims.find(
            (c) => /\blavender(?:\s+essential)?\s+oil\b/i.test(c.sourceText) || String(c.value).toLowerCase().includes('lavender')
          );

          if (directFragranceFreeClaim) {
            status = 'PASS';
            method = 'deterministic';
            confidence = 1.0;
            claimEvidence = [directFragranceFreeClaim.sourceText];
            reason = `Product is explicitly claimed to be fragrance-free.`;
          } else if (containsFragranceClaim) {
            status = 'FAIL';
            method = 'deterministic';
            confidence = 1.0;
            claimEvidence = [containsFragranceClaim.sourceText];
            reason = `Product explicitly states that it contains fragrance, violating the exclusion requirement.`;
          } else if (lavenderOilClaim) {
            // Carefully evaluated: does not conclusively establish fragrance status under evidence model
            status = 'UNKNOWN';
            method = 'semantic';
            confidence = 0.85;
            claimEvidence = [lavenderOilClaim.sourceText];
            reason = `Product claims '${lavenderOilClaim.sourceText}'. Without external formulation specifications, it is unknown whether this is formulated as an added fragrance or an active botanical ingredient.`;
          } else {
            status = 'UNKNOWN';
            method = 'deterministic';
            confidence = 0.90;
            reason = `The assistant output does not state whether ${pName} is fragrance-free.`;
          }
        }

        // CASE D: SENSITIVE SKIN SUITABILITY
        else if (attr === 'skin_type' || String(expectedVal).toLowerCase().includes('sensitive skin')) {
          const directSensitiveClaim = productClaims.find(
            (c) => /\b(?:suitable for|safe for|for)\s+sensitive skin\b/i.test(c.sourceText) ||
                   c.attribute === 'skin_type'
          );
          const hypoallergenicClaim = productClaims.find(
            (c) => /\bhypoallergenic\b/i.test(c.sourceText) || String(c.value).toLowerCase().includes('hypoallergenic')
          );

          if (directSensitiveClaim) {
            status = 'PASS';
            method = 'deterministic';
            confidence = 0.98;
            claimEvidence = [directSensitiveClaim.sourceText];
            reason = `Product explicitly states suitability for sensitive skin.`;
          } else if (hypoallergenicClaim) {
            // Hypoallergenic is not automatically equated with guaranteed sensitive-skin suitability
            status = 'UNKNOWN';
            method = 'semantic';
            confidence = 0.85;
            claimEvidence = [hypoallergenicClaim.sourceText];
            reason = `Product claims '${hypoallergenicClaim.sourceText}'. While hypoallergenic indicates reduced allergy risk, it does not conclusively guarantee formulated suitability for sensitive skin without assumption.`;
          } else {
            status = 'UNKNOWN';
            method = 'deterministic';
            confidence = 0.90;
            reason = `The assistant output does not state whether ${pName} is suitable for sensitive skin.`;
          }
        }

        // CASE E: SEASONAL SUITABILITY ("summer")
        else if (attr === 'season' || String(expectedVal).toLowerCase() === 'summer') {
          const directSummerClaim = productClaims.find(
            (c) => /\b(?:summer|warm weather)\b/i.test(c.sourceText)
          );
          const coldWinterClaims = productClaims.filter(
            (c) => /\b(?:freezing conditions|heavily insulated|sub-zero|winter parka|extreme cold)\b/i.test(c.sourceText)
          );

          if (directSummerClaim) {
            status = 'PASS';
            method = 'deterministic';
            confidence = 1.0;
            claimEvidence = [directSummerClaim.sourceText];
            reason = `Product is explicitly specified for summer/warm-weather use.`;
          } else if (coldWinterClaims.length > 0) {
            status = 'FAIL';
            method = 'semantic';
            confidence = 0.96;
            claimEvidence = coldWinterClaims.map((c) => c.sourceText);
            reason = `Product claims ${coldWinterClaims.map((c) => `'${c.sourceText}'`).join(' and ')}, which directly contradict the requested summer seasonal suitability.`;
          } else {
            status = 'UNKNOWN';
            method = 'semantic';
            confidence = 0.90;
            reason = `The assistant output does not state whether ${pName} is suitable for summer.`;
          }
        }

        // CASE F: ACTIVITY / USE-CASE SUITABILITY (trail running, running, hiking)
        else if (attr === 'use_case' || op === 'suitable_for') {
          const activityName = String(expectedVal).toLowerCase();
          const activityClaims = productClaims.filter(
            (c) => (c.claimType === 'suitability' || c.claimType === 'feature') &&
                   (!pName || c.sourceText.trim().toLowerCase() !== pName.trim().toLowerCase()) &&
                   new RegExp(`\\b${activityName}\\b`, 'i').test(c.attribute === 'use_case' ? String(c.value) : c.sourceText)
          );
          const deniesActivity = (c: ExtractedClaim) => c.operator === 'not_suitable_for' || (c.operator !== 'suitable_for' && /\b(?:not|never)\s+(?:specifically\s+)?(?:designed|built|engineered|crafted|made|intended|suitable|ideal|perfect|great)\b|\bunsuitable\b/i.test(c.sourceText));
          const negative = activityClaims.find(deniesActivity);
          const activityClaim = activityClaims.find(c => !deniesActivity(c));
          if (negative && activityClaim) {
            status = 'UNKNOWN';
            conflictDetected = true;
            claimEvidence = [activityClaim.sourceText, negative.sourceText];
            reason = `Conflicting activity suitability claims for ${pName}; suitability for ${activityName} remains UNKNOWN.`;
          } else if (negative) {
            status = 'FAIL';
            claimEvidence = [negative.sourceText];
            reason = `Product explicitly denies suitability for ${activityName}.`;
          } else if (activityClaim) {
            status = 'PASS';
            method = 'deterministic';
            confidence = 0.95;
            claimEvidence = [activityClaim.sourceText];
            reason = `Product explicitly claims suitability for ${activityName}.`;
          } else {
            status = 'UNKNOWN';
            method = 'deterministic';
            confidence = 0.95;
            reason = `The assistant output contains no explicit claim confirming suitability for ${activityName}. Suitability is not inferred from the product name.`;
          }
        }

        // CASE G: COLOR PREFERENCES (e.g. "preferably black")
        else if (attr === 'color' || String(expectedVal).toLowerCase() === 'black') {
          method = 'deterministic';
          const targetColor = String(expectedVal).toLowerCase();
          const matchingColorClaim = productClaims.find(
            (c) => c.claimType === 'color' && String(c.value).toLowerCase() === targetColor
          );

          if (matchingColorClaim) {
            status = 'PASS';
            confidence = 0.98;
            claimEvidence = [matchingColorClaim.sourceText];
            reason = `${targetColor.charAt(0).toUpperCase() + targetColor.slice(1)} is explicitly listed as an available color for ${pName}.`;
          } else {
            status = 'UNKNOWN';
            confidence = 0.90;
            reason = `The assistant output does not list ${targetColor} as an available color for ${pName}.`;
          }
        }

        // CASE H: SIZE CONSTRAINTS (e.g. size 10, size 8.5, size medium)
        else if (attr === 'size') {
          method = 'deterministic';
          const targetSizeStr = String(expectedVal).toLowerCase();
          const sizeClaim = productClaims.find(
            (c) => c.claimType === 'size' ||
                   (c.attribute === 'size' && String(c.value).toLowerCase() === targetSizeStr) ||
                   new RegExp(`\\bsize\\s+${targetSizeStr}\\b`, 'i').test(c.sourceText) ||
                   (product.size && product.size.toLowerCase() === targetSizeStr)
          );

          if (sizeClaim) {
            status = 'PASS';
            confidence = 0.98;
            claimEvidence = [sizeClaim.sourceText];
            reason = `Product explicitly claims availability in size ${expectedVal}.`;
          } else {
            status = 'UNKNOWN';
            confidence = 0.95;
            reason = `The assistant output provides no sizing or availability evidence for size ${expectedVal}.`;
          }
        }

        // CASE I: DESCRIPTIVE PHYSICAL ATTRIBUTES (lightweight, breathable, waterproof, organic)
        else {
          method = 'deterministic';
          const targetWord = String(expectedVal).toLowerCase();
          const attrClaim = productClaims.find(
            (c) => new RegExp(`\\b${targetWord}\\b`, 'i').test(String(c.value)) ||
                   new RegExp(`\\b${targetWord}\\b`, 'i').test(c.sourceText) ||
                   c.attribute.toLowerCase() === attr
          );

          if (attrClaim) {
            status = 'PASS';
            confidence = 0.96;
            claimEvidence = [attrClaim.sourceText];
            reason = `Product explicitly claims to feature ${targetWord}.`;
          } else {
            status = 'UNKNOWN';
            confidence = 0.95;
            reason = `The assistant output contains no claim addressing '${targetWord}' for ${pName}.`;
          }
        }
      }

      // Update Product Summary Counts
      const isHard = constraint.constraintType === 'hard';
      const isNegative = constraint.polarity === 'negative';

      if (isHard) {
        if (status === 'PASS') summary.hardConstraintsPassed++;
        else if (status === 'FAIL') summary.hardConstraintsFailed++;
        else summary.hardConstraintsUnknown++;
      } else {
        if (status === 'PASS') summary.softConstraintsPassed++;
        else if (status === 'FAIL') summary.softConstraintsFailed++;
        else summary.softConstraintsUnknown++;
      }

      if (isNegative) {
        if (status === 'PASS') summary.negativeConstraintsPassed++;
        else if (status === 'FAIL') summary.negativeConstraintsFailed++;
        else summary.negativeConstraintsUnknown++;
      }

      records.push({
        id: nextId(),
        productId: pId,
        productName: pName,
        constraintId: constraint.id,
        constraintAttribute: constraint.attribute,
        constraintType: constraint.constraintType,
        polarity: constraint.polarity,
        status,
        constraintEvidence: constraint.sourceText,
        claimEvidence,
        reason,
        method,
        confidence,
        conflictDetected: conflictDetected || undefined,
      });
    }

    productSummaries[pId] = summary;
  }

  const cartResult = evaluateShoppingCart(cartConstraints, products, claims, nextId);
  const cartEvaluation = cartResult.cartEvaluation;
  records.push(...cartResult.records);

  // Calculate Overall Summary
  const totalPass = records.filter((r) => r.status === 'PASS').length;
  const totalFail = records.filter((r) => r.status === 'FAIL').length;
  const totalUnknown = records.filter((r) => r.status === 'UNKNOWN').length;

  const hardPass = records.filter((r) => r.constraintType === 'hard' && r.status === 'PASS').length;
  const hardFail = records.filter((r) => r.constraintType === 'hard' && r.status === 'FAIL').length;
  const hardUnknown = records.filter((r) => r.constraintType === 'hard' && r.status === 'UNKNOWN').length;

  const softPass = records.filter((r) => r.constraintType === 'soft' && r.status === 'PASS').length;
  const softFail = records.filter((r) => r.constraintType === 'soft' && r.status === 'FAIL').length;
  const softUnknown = records.filter((r) => r.constraintType === 'soft' && r.status === 'UNKNOWN').length;

  const conflictsCount = records.filter((r) => r.conflictDetected).length;

  return {
    state: 'CONSTRAINT_VERIFICATION_COMPLETE',
    analyzedAt: new Date().toISOString(),
    records,
    productSummaries,
    overallSummary: {
      totalProducts: effectiveProducts.length,
      totalVerifications: records.length,
      totalPass,
      totalFail,
      totalUnknown,
      hardPass,
      hardFail,
      hardUnknown,
      softPass,
      softFail,
      softUnknown,
      conflictsCount,
    },
    cartEvaluation,
    rawJson: {
      records,
      productSummaries,
      cartEvaluation,
      metadata: {
        engine: 'deterministic-semantic-verifier-v1',
        totalRecords: records.length,
      },
    },
  };
}
