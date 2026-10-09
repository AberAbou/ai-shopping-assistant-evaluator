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
  const totalClaims = claims.filter(c => ['cart_total_price', 'total_price'].includes(c.attribute));
  const ambiguousStatedTotal = totalClaims.some(c => c.unit !== 'USD' || typeof c.value !== 'number' || !Number.isFinite(c.value) || c.value < 0);
  const statedAmounts = totalClaims.filter(c => c.unit === 'USD' && typeof c.value === 'number' && Number.isFinite(c.value) && c.value >= 0).map(c => Number(c.value));
  const statedCartTotal = statedAmounts[0] ?? null;
  const totalDisagreement = new Set(statedAmounts.map(v => Math.round(v * 100))).size > 1 || (calculatedCartTotal !== null && statedCartTotal !== null && Math.round(calculatedCartTotal * 100) !== Math.round(statedCartTotal * 100));
  // A stated total never hides missing line-item evidence or an arithmetic contradiction.
  const effectiveCartTotal = complete && !totalDisagreement && !ambiguousStatedTotal ? calculatedCartTotal : null;
  const records: ProductConstraintVerification[] = [];
  const verifications = constraints.map(c => {
    let status: VerificationStatus = 'UNKNOWN';
    let reason = '';
    const expected = Number(c.expectedValue);
    if (c.attribute === 'cart_items') {
      let requested: RequestedCartItem[] = [];
      try { const parsed = JSON.parse(String(c.expectedValue)); if (Array.isArray(parsed)) requested = parsed; } catch { /* malformed metadata remains UNKNOWN */ }
      const missing = requested.filter(r => !cartItems.some(i => i.category === r.category));
      const invalidRequest = requested.some(r => r.hasInvalidQuantity || (r.quantity !== null && (!Number.isSafeInteger(r.quantity) || r.quantity <= 0)));
      const wrongCounts = requested.filter(r => r.quantity !== null && cartItems.some(i => i.category === r.category)
        && cartItems.filter(i => i.category === r.category).every(i => i.quantity !== null)
        && cartItems.filter(i => i.category === r.category).reduce((sum, i) => sum + i.quantity!, 0) !== r.quantity);
      status = !invalidRequest && wrongCounts.length > 0 ? 'FAIL' : requested.length > 0 && !invalidRequest && missing.length === 0 && cartItems.every(i => !i.isMissingQuantity) ? 'PASS' : 'UNKNOWN';
      reason = invalidRequest ? 'The requested quantity is invalid or ambiguous; clarification is required.'
        : wrongCounts.length ? `Requested category quantities do not match: ${wrongCounts.map(r => `${r.category} requires ${r.quantity}`).join(', ')}.`
        : missing.length ? `Missing recommendation evidence for requested categories: ${missing.map(r => r.category).join(', ')}.`
        : status === 'UNKNOWN' ? 'Required cart items or quantities are missing or ambiguous.'
        : requested.some(r => r.quantity !== null) ? 'Requested categories are represented and their explicit requested quantities match the summed item quantities.'
        : 'Requested categories are represented. No category count was requested; only explicit quantity presence was checked.';
    } else if (c.attribute === 'quantity') {
      const matching = cartItems.filter(i => !c.targetProductCategory || i.category === c.targetProductCategory);
      if (matching.length > 0 && matching.every(i => i.quantity !== null) && Number.isSafeInteger(expected) && expected > 0) {
        const actual = matching.reduce((sum, i) => sum + i.quantity!, 0);
        status = actual === expected ? 'PASS' : 'FAIL';
        reason = `Requested ${expected} ${c.targetProductCategory ?? 'items'}; recommendation explicitly contains ${actual}.`;
      } else reason = 'Requested quantity cannot be checked because quantity evidence is missing or invalid.';
    } else if (effectiveCartTotal === null || !Number.isFinite(expected)) {
      reason = ambiguousStatedTotal ? 'Stated total has ambiguous amount or unsupported currency; budget compliance is UNKNOWN.' : totalDisagreement ? 'Calculated and stated cart totals disagree; budget compliance is UNKNOWN.' : 'Complete, valid quantity and USD unit-price evidence is required to verify the cart budget. A stated total alone is insufficient.';
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
    const monetary = !['cart_items', 'quantity'].includes(c.attribute);
    const evidenceItems = c.attribute === 'quantity' ? cartItems.filter(i => !c.targetProductCategory || i.category === c.targetProductCategory) : cartItems;
    const claimEvidence = evidenceItems.map(i => monetary
      ? `${i.quantity ?? 'Unknown'}x ${i.productName}: unit price ${i.unitPrice == null ? 'Unknown' : `$${i.unitPrice}`} / line total ${i.lineTotal == null ? 'Unknown' : `$${i.lineTotal}`}`
      : `${i.quantity ?? 'Unknown'}x ${i.productName} (${i.category ?? 'Unknown category'}); quantity evidence: ${i.quantitySourceText ?? 'Missing or ambiguous'}`);
    if (monetary) claimEvidence.push(...totalClaims.map(c => c.unit === 'USD' && typeof c.value === 'number'
      ? `Stated total: $${c.value}` : `Unresolved stated total: ${c.sourceText}`));
    records.push({ id, productId: 'CART', productName: 'Shopping Cart', constraintId: c.id, constraintAttribute: c.attribute,
      constraintType: c.constraintType, polarity: c.polarity, status, constraintEvidence: c.sourceText, claimEvidence, reason, method: 'deterministic', confidence: 1, conflictDetected: monetary && totalDisagreement });
    return { id, constraintId: c.id, constraintAttribute: c.attribute, constraintType: c.constraintType, polarity: c.polarity, status,
      operator: c.operator, expectedValue: c.expectedValue as string | number, actualCartTotal: effectiveCartTotal, items: cartItems,
      constraintEvidence: c.sourceText, claimEvidence, reason, method: 'deterministic' as const, confidence: 1 };
  });
  const hard = verifications.filter(v => v.constraintType === 'hard');
  const hasCartFailure = hard.some(v => v.status === 'FAIL');
  const cartHardGateState = hasCartFailure ? 'HARD_GATE_FAIL' : hard.some(v => v.status === 'UNKNOWN') ? 'HARD_GATE_INDETERMINATE' : 'HARD_GATE_PASS';
  const rationale = `Cart hard gate ${cartHardGateState.replace('HARD_GATE_', '')}. ${verifications.map(v => v.reason).join(' ')} UNKNOWN requirements are not counted as failures.`;
  return { records, cartEvaluation: { hasCartEvaluation: true, cartItems, calculatedCartTotal, statedCartTotal, effectiveCartTotal,
    isCartTotalComplete: complete, totalDisagreement, ambiguousStatedTotal, verifications, cartHardGateState, hasCartFailure, rationale } };
}
