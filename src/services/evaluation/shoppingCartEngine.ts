import type { AtomicConstraint, CartEvaluationResult, CartItemEvaluation, ExtractedClaim, ExtractedProduct, ProductConstraintVerification, VerificationStatus } from '../../types/evaluation';
import { parseQuantity, productCategory, type RequestedCartItem } from './shoppingCartSemantics';

export function evaluateShoppingCart(constraints: AtomicConstraint[], products: ExtractedProduct[], claims: ExtractedClaim[], nextId: () => string): { cartEvaluation?: CartEvaluationResult; records: ProductConstraintVerification[] } {
  if (constraints.length === 0) return { records: [] };
  const cartItems: CartItemEvaluation[] = products.map(p => {
    const quantity = p.quantity != null ? parseQuantity(p.quantity) : parseQuantity(p.parsedQuantity);
    const price = p.unitPrice === undefined ? p.price : p.unitPrice;
    const unitPrice = price?.currency === 'USD' && Number.isFinite(price.amount) && price.amount! >= 0 ? price.amount : null;
    return { productId: p.id, productName: p.name, category: p.category ?? productCategory(p.name), quantity,
      quantitySourceText: p.quantity, unitPrice, unitPriceSourceText: price?.sourceText ?? null,
      lineTotal: quantity != null && unitPrice != null ? Math.round(unitPrice * 100) * quantity / 100 : null,
      isMissingQuantity: quantity === null, isMissingUnitPrice: unitPrice === null };
  });
  const complete = cartItems.length > 0 && cartItems.every(i => i.lineTotal !== null);
  const calculatedCartTotal = complete ? cartItems.reduce((sum, i) => sum + Math.round(i.lineTotal! * 100), 0) / 100 : null;
  const statedAmounts = claims.filter(c => ['cart_total_price', 'total_price'].includes(c.attribute)).map(c => Number(c.value)).filter(v => Number.isFinite(v) && v >= 0);
  const statedCartTotal = statedAmounts[0] ?? null;
  const totalDisagreement = new Set(statedAmounts.map(v => Math.round(v * 100))).size > 1 || (calculatedCartTotal !== null && statedCartTotal !== null && Math.round(calculatedCartTotal * 100) !== Math.round(statedCartTotal * 100));
  // A stated total never hides missing line-item evidence or an arithmetic contradiction.
  const effectiveCartTotal = complete && !totalDisagreement ? calculatedCartTotal : null;
  const records: ProductConstraintVerification[] = [];
  const verifications = constraints.map(c => {
    let status: VerificationStatus = 'UNKNOWN';
    let reason = '';
    const expected = Number(c.expectedValue);
    if (c.attribute === 'cart_items') {
      let requested: RequestedCartItem[] = [];
      try { const parsed = JSON.parse(String(c.expectedValue)); if (Array.isArray(parsed)) requested = parsed; } catch { /* malformed metadata remains UNKNOWN */ }
      const missing = requested.filter(r => !cartItems.some(i => i.category === r.category));
      status = requested.length > 0 && !requested.some(r => r.hasInvalidQuantity) && missing.length === 0 && cartItems.every(i => !i.isMissingQuantity) && !totalDisagreement ? 'PASS' : 'UNKNOWN';
      reason = totalDisagreement ? 'Calculated and stated cart totals disagree; neither conflicting total is arbitrarily accepted.' : requested.some(r => r.hasInvalidQuantity) ? 'The requested quantity is invalid or ambiguous; clarification is required.' : missing.length ? `Missing recommendation evidence for requested categories: ${missing.map(r => r.category).join(', ')}.` : status === 'UNKNOWN' ? 'Required cart items or quantities are missing or ambiguous.' : 'All requested categories and explicit item quantities are represented.';
    } else if (c.attribute === 'quantity') {
      const matching = cartItems.filter(i => !c.targetProductCategory || i.category === c.targetProductCategory);
      if (matching.length > 0 && matching.every(i => i.quantity !== null) && Number.isSafeInteger(expected) && expected > 0) {
        const actual = matching.reduce((sum, i) => sum + i.quantity!, 0);
        status = actual === expected ? 'PASS' : 'FAIL';
        reason = `Requested ${expected} ${c.targetProductCategory ?? 'items'}; recommendation explicitly contains ${actual}.`;
      } else reason = 'Requested quantity cannot be checked because quantity evidence is missing or invalid.';
    } else if (effectiveCartTotal === null || !Number.isFinite(expected)) {
      reason = totalDisagreement ? 'Calculated and stated cart totals disagree; budget compliance is UNKNOWN.' : 'Complete, valid quantity and USD unit-price evidence is required to verify the cart budget. A stated total alone is insufficient.';
    } else {
      const rules: Record<string, boolean> = {
        '<': effectiveCartTotal < expected, less_than: effectiveCartTotal < expected,
        '<=': effectiveCartTotal <= expected, less_than_or_equal: effectiveCartTotal <= expected,
        '>': effectiveCartTotal > expected, greater_than: effectiveCartTotal > expected,
        '>=': effectiveCartTotal >= expected, greater_than_or_equal: effectiveCartTotal >= expected,
        '==': effectiveCartTotal === expected, equals: effectiveCartTotal === expected,
        '!=': effectiveCartTotal !== expected, not_equals: effectiveCartTotal !== expected,
      };
      if (!(c.operator in rules)) reason = `Unsupported cart budget operator '${c.operator}'; compliance remains UNKNOWN.`;
      else {
        const matches = c.polarity === 'negative' ? !rules[c.operator] : rules[c.operator];
        status = matches ? 'PASS' : 'FAIL';
        reason = `Combined cart total $${effectiveCartTotal} ${matches ? 'satisfies' : 'violates'} the ${c.constraintType} budget requirement (${c.operator} $${expected}).`;
      }
    }
    const id = nextId();
    const claimEvidence = cartItems.map(i => `${i.quantity ?? 'Unknown'}x ${i.productName}: unit price ${i.unitPrice == null ? 'Unknown' : `$${i.unitPrice}`} / line total ${i.lineTotal == null ? 'Unknown' : `$${i.lineTotal}`}`);
    if (statedCartTotal !== null) claimEvidence.push(`Stated total: $${statedCartTotal}`);
    records.push({ id, productId: 'CART', productName: 'Shopping Cart', constraintId: c.id, constraintAttribute: c.attribute,
      constraintType: c.constraintType, polarity: c.polarity, status, constraintEvidence: c.sourceText, claimEvidence, reason, method: 'deterministic', confidence: 1, conflictDetected: totalDisagreement });
    return { id, constraintId: c.id, constraintAttribute: c.attribute, constraintType: c.constraintType, polarity: c.polarity, status,
      operator: c.operator, expectedValue: c.expectedValue as string | number, actualCartTotal: effectiveCartTotal, items: cartItems,
      constraintEvidence: c.sourceText, claimEvidence, reason, method: 'deterministic' as const, confidence: 1 };
  });
  const hard = verifications.filter(v => v.constraintType === 'hard');
  const hasCartFailure = hard.some(v => v.status === 'FAIL');
  const cartHardGateState = hasCartFailure ? 'HARD_GATE_FAIL' : hard.some(v => v.status === 'UNKNOWN') ? 'HARD_GATE_INDETERMINATE' : 'HARD_GATE_PASS';
  const rationale = `Cart hard gate ${cartHardGateState.replace('HARD_GATE_', '')}. ${verifications.map(v => v.reason).join(' ')} UNKNOWN requirements are not counted as failures.`;
  return { records, cartEvaluation: { hasCartEvaluation: true, cartItems, calculatedCartTotal, statedCartTotal, effectiveCartTotal,
    isCartTotalComplete: complete, totalDisagreement, verifications, cartHardGateState, hasCartFailure, rationale } };
}
