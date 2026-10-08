import type { AtomicConstraint, ExtractedProduct, LlmOutputClaimAnalysisResult, UserPromptAnalysisResult } from '../../types/evaluation';

export const categoryPatterns = [
  { category: 'jacket', pattern: /\b(jackets?|outerwear|coats?)\b/i },
  { category: 'running shoes', pattern: /\b(running shoes?|shoes?|sneakers?|boots?|footwear)\b/i },
  { category: 'sunscreen', pattern: /\b(sunscreen|sunblock|spf lotion)\b/i },
  { category: 'backpack', pattern: /\b(backpacks?|daypacks?|bags?)\b/i },
  { category: 'headphones', pattern: /\b(headphones?|earbuds?)\b/i },
  { category: 'laptop', pattern: /\b(laptops?|notebooks?)\b/i },
  { category: 'shirt', pattern: /\b(t-shirts?|shirts?|tees?|tops?)\b/i },
  { category: 'shorts', pattern: /\b(shorts?)\b/i },
  { category: 'pants', pattern: /\b(pants?|leggings?|tights?)\b/i },
  { category: 'socks', pattern: /\b(socks?)\b/i },
  { category: 'watch', pattern: /\b(watches?|smartwatch)\b/i },
];

export function productCategory(text: string): string | null {
  return categoryPatterns.find(c => c.pattern.test(text))?.category ?? null;
}

export function parseQuantity(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const token = String(raw).trim().toLowerCase().replace(/\s*(?:pairs?(?:\s+of)?|units?|pieces?|x)\s*$/, '').trim();
  const quantity = words[token] ?? (/^\d+$/.test(token) ? Number(token) : NaN);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

export function extractQuantity(text: string): { raw: string | null; amount: number | null } {
  const explicit = text.match(/\b(?:qty|quantity)\s*[:=]?\s*([\w.-]+)/i);
  const prefix = text.replace(/^\s*(?:\d+[.)]\s+|[-*]\s+)/, '').match(/^(?:I\s+(?:recommend|suggest)\s+|(?:get|buy|recommend|suggest)\s+)?(-?\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s*(?:x\s+|\s+(?:pairs?\s+of\s+)?)(?=[a-z])/i);
  const suffix = text.match(/\b(?:x\s*|quantity\s*)(-?\d+(?:\.\d+)?)(?:\s|$)/i);
  const raw = explicit?.[1] ?? prefix?.[1] ?? suffix?.[1] ?? null;
  return { raw, amount: parseQuantity(raw) };
}

export interface RequestedCartItem { category: string; quantity: number | null; sourceText: string; hasInvalidQuantity?: boolean }

export function cartRequest(text: string): { isCart: boolean; items: RequestedCartItem[] } {
  const items: RequestedCartItem[] = [];
  for (const entry of categoryPatterns) {
    const match = text.match(entry.pattern);
    if (!match) continue;
    const before = text.slice(Math.max(0, (match.index ?? 0) - 55), match.index);
    const qty = before.match(/(-?\d+(?:\.\d+)?|one|two|three|four|five|six|a|an)\s+(?:pairs?\s+of\s+)?(?:[a-z-]+\s+){0,2}$/i);
    items.push({ category: entry.category, quantity: parseQuantity(qty?.[1]), sourceText: qty ? qty[0] + match[0] : match[0], hasInvalidQuantity: Boolean(qty && parseQuantity(qty[1]) === null) });
  }
  const alternatives = /\b(?:either|alternatives?|options?|choose one|one of)\b|\bor\b(?!\s+(?:less|more|equal))/i.test(text);
  const combined = /\b(?:total budget|overall budget|combined budget|total cost|cart budget|shopping cart|in total|all together|for both|for all|all items|entire order)\b/i.test(text);
  const isCart = !alternatives && (combined || items.some(i => (i.quantity ?? 0) > 1 || i.hasInvalidQuantity) || (items.length > 1 && /\band\b|\bplus\b|,/i.test(text)));
  return { isCart, items };
}

export function isCartConstraint(c: AtomicConstraint): boolean {
  return c.scope === 'cart' || ['cart_total_price', 'cart_budget', 'cart_items'].includes(c.attribute);
}

export function appliesToProduct(c: AtomicConstraint, product: ExtractedProduct): boolean {
  if (isCartConstraint(c)) return false;
  return !c.targetProductCategory || c.targetProductCategory === (product.category ?? productCategory(product.name));
}

/** Extract monetary constraints from their local clause, rather than applying one bound everywhere. */
export function shoppingConstraints(text: string): AtomicConstraint[] {
  const request = cartRequest(text);
  const constraints: AtomicConstraint[] = [];
  const money = /(?:(strictly\s+under|under|below|less\s+than|at\s+most|up\s+to|no\s+more\s+than|at\s+least|over|above|greater\s+than|exactly|around|approximately|about|max(?:imum)?\s+(?:of\s+)?|budget\s+(?:(?:is|of)\s+)?|at|for)\s*)\$?([0-9]+(?:\.[0-9]+)?)(?:\s*(?:USD|dollars))?/gi;
  const moneyMatches = [...text.matchAll(money)];
  for (const match of moneyMatches) {
    if (/^(?:at|for)$/i.test(match[1]) && !match[0].includes('$') && !/USD|dollars/i.test(match[0])) continue;
    const before = text.slice(0, match.index);
    const clauseStart = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf('\n'), before.lastIndexOf(' and '), before.lastIndexOf('. ')) + 1;
    const local = text.slice(clauseStart, (match.index ?? 0) + match[0].length);
    const localCategory = productCategory(local);
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 25);
    const perItem = /\b(?:each|apiece|per item|per product)\b/i.test(local + after);
    const total = /\b(?:total|combined|overall|cart|together|all items|both)\b/i.test(local + after);
    const scope = request.isCart && !perItem && (total || !localCategory || moneyMatches.length === 1) ? 'cart' : 'product';
    const word = match[1].toLowerCase().replace(/\s+/g, ' ');
    const operator = /around|approximately|about/.test(word) ? 'required' : /under|below|less than/.test(word) ? '<' : /at least/.test(word) ? '>=' : /over|above|greater/.test(word) ? '>' : /exactly/.test(word) ? 'equals' : '<=';
    constraints.push({ id: '', attribute: scope === 'cart' ? 'cart_total_price' : 'price', operator, expectedValue: Number(match[2]), scope,
      targetProductCategory: scope === 'product' && request.isCart ? localCategory : null,
      constraintType: /\b(?:preferably|ideally|if possible|prefer)\b/i.test(local) ? 'soft' : 'hard', polarity: 'positive', sourceText: match[0], confidence: 0.99 });
  }
  if (request.isCart) {
    if (!constraints.some(c => c.attribute.includes('price')) && /\bbudget\b|(?:under|below|up to)\s*[€£]/i.test(text)) {
      constraints.push({ id: '', attribute: 'cart_total_price', operator: 'required', expectedValue: 'Unresolved budget', scope: 'cart', constraintType: /preferably|ideally|if possible/i.test(text) ? 'soft' : 'hard', polarity: 'positive', sourceText: text, confidence: 0.9 });
    }
    constraints.push({ id: '', attribute: 'cart_items', operator: 'required', expectedValue: JSON.stringify(request.items), scope: 'cart', constraintType: 'hard', polarity: 'positive', sourceText: text, confidence: 0.98 });
    for (const item of request.items) {
      if (item.quantity !== null) constraints.push({ id: '', attribute: 'quantity', operator: 'equals', expectedValue: item.quantity, scope: 'cart', targetProductCategory: item.category, constraintType: 'hard', polarity: 'positive', sourceText: item.sourceText, confidence: 0.98 });
    }
  }
  return constraints.map((c, i) => ({ ...c, id: `C${i + 1}` }));
}

/** Common reconciliation for API and fallback; unrelated model-extracted attributes are retained. */
export function reconcilePromptCart(result: UserPromptAnalysisResult, text: string): UserPromptAnalysisResult {
  const canonical = shoppingConstraints(text);
  const cart = cartRequest(text);
  const constraints = [...canonical, ...result.constraints.filter(c => !isCartConstraint(c) && !['price', 'budget', 'quantity'].includes(c.attribute)).map(c => ({ ...c,
    scope: 'product' as const,
    targetProductCategory: cart.isCart ? c.targetProductCategory ?? constraintCategory(text, c.sourceText) : null,
  }))].map((c, i) => ({ ...c, id: `C${i + 1}` }));
  const summary = { ...result.summary, totalConstraints: constraints.length, hardCount: constraints.filter(c => c.constraintType === 'hard').length,
    softCount: constraints.filter(c => c.constraintType === 'soft').length, negativeCount: constraints.filter(c => c.polarity === 'negative').length };
  const budget = canonical.find(c => c.attribute === 'cart_total_price') ?? canonical.find(c => c.attribute === 'price');
  const intent = { ...result.intent, quantity: cart.items.length === 1 ? cart.items[0].quantity : result.intent.quantity,
    budget: budget ? { maxAmount: ['<', '<=', 'equals'].includes(budget.operator) ? Number(budget.expectedValue) : null,
      minAmount: ['>', '>=', 'equals'].includes(budget.operator) ? Number(budget.expectedValue) : null, currency: 'USD', sourceText: budget.sourceText } : result.intent.budget,
    evidenceMap: { ...result.intent.evidenceMap, ...(budget ? { budget: budget.sourceText } : {}) } };
  return { ...result, constraints, summary, intent, rawJson: { ...result.rawJson, constraints, intent } };
}

function constraintCategory(text: string, evidence: string): string | null {
  const index = text.toLowerCase().indexOf(evidence.toLowerCase());
  if (index < 0) return null;
  const before = text.slice(0, index);
  const after = text.slice(index + evidence.length);
  const start = Math.max(before.lastIndexOf(' and '), before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf('. '));
  const end = after.search(/\band\b|[,;]|\. /);
  return productCategory(text.slice(start < 0 ? 0 : start + 1, end < 0 ? text.length : index + evidence.length + end));
}

export function reconcileClaimCart(result: LlmOutputClaimAnalysisResult, text: string): LlmOutputClaimAnalysisResult {
  const products = result.products.map((p, index) => {
    const nameIndex = text.toLowerCase().indexOf(p.name.toLowerCase());
    const nextName = result.products[index + 1]?.name;
    const nextIndex = nextName ? text.toLowerCase().indexOf(nextName.toLowerCase(), Math.max(0, nameIndex) + p.name.length) : -1;
    const andIndex = text.lastIndexOf(' and ', nameIndex);
    const commaIndex = text.lastIndexOf(', ', nameIndex);
    const start = nameIndex < 0 ? 0 : Math.max(text.lastIndexOf('\n', nameIndex) + 1, andIndex < 0 ? 0 : andIndex + 5, commaIndex < 0 ? 0 : commaIndex + 2);
    const section = text.slice(start, nextIndex < 0 ? text.length : nextIndex);
    const extracted = extractQuantity(section);
    // Never silently repair an explicitly invalid quantity to one.
    const quantity = extracted.raw ?? p.quantity;
    const parsedQuantity = parseQuantity(quantity);
    const textPrice = section.match(/\$([0-9]+(?:\.[0-9]+)?)/);
    const price = p.price && Number.isFinite(p.price.amount) && p.price.amount! >= 0 && (!textPrice || Number(textPrice[1]) === p.price.amount) ? p.price : null;
    const ambiguousPrice = /\b(?:line total|subtotal|for both|for all|total for)\b|\$[0-9.]+\s+total\b/i.test(section) && !/\b(?:each|apiece|per unit)\b/i.test(section);
    const unitPrice = ambiguousPrice ? null : price;
    return { ...p, category: productCategory(p.category ?? '') ?? p.category ?? productCategory(p.name), quantity, parsedQuantity, unitPrice,
      lineTotal: unitPrice?.amount != null && parsedQuantity != null ? { amount: Math.round(unitPrice.amount * 100) * parsedQuantity / 100, currency: unitPrice.currency } : null };
  });
  const claims = result.claims.filter(c => !['quantity', 'line_total', 'cart_total_price'].includes(c.attribute));
  const totals = [...text.matchAll(/\b(?:grand\s+total|cart\s+total|combined\s+total|total(?:\s+(?:cost|price))?|in\s+total|totaling)\s*(?:is|of|comes\s+to|:|=)?\s*\$([0-9]+(?:\.[0-9]+)?)/gi)];
  for (const match of totals) claims.push({ id: `CL${claims.length + 1}`, productId: null, productName: null, claimType: 'price', nature: 'factual', attribute: 'cart_total_price', operator: 'equals', value: Number(match[1]), unit: 'USD', sourceText: match[0], confidence: 0.99 });
  for (const p of products) if (p.parsedQuantity != null) claims.push({ id: `CL${claims.length + 1}`, productId: p.id, productName: p.name, claimType: 'quantity', nature: 'factual', attribute: 'quantity', operator: 'equals', value: p.parsedQuantity, unit: 'units', sourceText: p.quantity!, confidence: 0.98 });
  claims.forEach((c, i) => { c.id = `CL${i + 1}`; });
  return { ...result, products, claims, summary: { ...result.summary, totalProducts: products.length, totalClaims: claims.length, factualCount: claims.filter(c => c.nature === 'factual').length, subjectiveCount: claims.filter(c => c.nature === 'subjective').length,
    claimsPerProduct: Object.fromEntries(products.map(p => [p.id, claims.filter(c => c.productId === p.id).length])) }, rawJson: { ...result.rawJson, products, claims } };
}
