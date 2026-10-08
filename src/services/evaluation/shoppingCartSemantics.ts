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
  text = text.trim();
  const explicit = text.match(/\b(?:qty|quantity)\s*[:=]?\s*([\w.-]+)/i);
  const prefix = text.replace(/^\s*(?:\d+[.)]\s+|[-*]\s+)/, '').match(/^(?:I\s+(?:recommend|suggest)\s+|(?:get|buy|recommend|suggest)\s+)?(-?\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s*(?:x\s+|\s+(?:pairs?\s+of\s+)?)(?=[a-z])/i);
  const suffix = text.match(/\b(?:x\s*|quantity\s*)(-?\d+(?:\.\d+)?)(?:\s|$)/i);
  const raw = explicit?.[1] ?? prefix?.[1] ?? suffix?.[1] ?? null;
  return { raw, amount: parseQuantity(raw) };
}

export interface RequestedCartItem { category: string; quantity: number | null; sourceText: string; hasInvalidQuantity?: boolean }

export function cartRequest(text: string): { isCart: boolean; items: RequestedCartItem[] } {
  const items: RequestedCartItem[] = [];
  // A conjunction must join requested items in the same clause. Background
  // possessions and conditional replacements are not simultaneous purchases.
  let joinedRequest = false;
  const clauses = text.split(/(?:\.(?=\s|$)|[;\n])/);
  for (const clause of clauses) {
    if (/\b(?:already (?:own|have)|I (?:own|have)|my\s+\w+\s+(?:are|is)|do not need|don't need)\b/i.test(clause)) continue;
    const clauseItems: RequestedCartItem[] = [];
    for (const entry of categoryPatterns) {
      const match = clause.match(entry.pattern);
      if (!match) continue;
      const before = clause.slice(Math.max(0, (match.index ?? 0) - 55), match.index);
      const qty = before.match(/(-?\d+(?:\.\d+)?|one|two|three|four|five|six|a|an)\s+(?:pairs?\s+of\s+)?(?:[a-z-]+\s+){0,2}$/i);
      clauseItems.push({ category: entry.category, quantity: parseQuantity(qty?.[1]), sourceText: qty ? qty[0] + match[0] : match[0], hasInvalidQuantity: Boolean(qty && parseQuantity(qty[1]) === null) });
    }
    joinedRequest ||= clauseItems.length > 1 && /\band\b|\bplus\b|,/i.test(clause);
    for (const item of clauseItems) if (!items.some(i => i.category === item.category)) items.push(item);
  }
  const alternatives = /\b(?:either|alternatives?|options?|choose one|one of|otherwise|instead|unless)\b|\bif\b(?!\s+possible)|\bor\b(?!\s+(?:less|more|equal))/i.test(text);
  const combined = /\b(?:total budget|overall budget|combined budget|total cost|cart budget|shopping cart|in total|all together|for both|for all|all items|entire order)\b/i.test(text);
  const isCart = !alternatives && items.length > 0 && (combined || items.some(i => (i.quantity ?? 0) > 1 || i.hasInvalidQuantity) || joinedRequest);
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
  const money = /(?:(strictly\s+under|under|below|less\s+than|at\s+most|up\s+to|no\s+more\s+than|at\s+least|over|above|greater\s+than|exactly|around|approximately|about|max(?:imum)?\s+(?:of\s+)?|budget\s+(?:(?:is|of)\s+)?)\s*)([$€£]?)([0-9]+(?:\.[0-9]+)?)(?:\s*(USD|dollars|EUR|GBP|CAD|AUD))?/gi;
  const moneyMatches = [...text.matchAll(money)];
  for (const match of moneyMatches) {
    const before = text.slice(0, match.index);
    const clauseStart = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf('\n'), before.lastIndexOf(' and '), before.lastIndexOf('. ')) + 1;
    const end = (match.index ?? 0) + match[0].length;
    const tail = text.slice(end);
    const nextClause = tail.search(/[,;\n]|\band\b|\.(?=\s|$)/i);
    const local = text.slice(clauseStart, end) + tail.slice(0, nextClause < 0 ? tail.length : nextClause);
    const localCategory = productCategory(local);
    const perItem = /\b(?:each|apiece|per item|per product)\b/i.test(local);
    const total = /\b(?:total|combined|overall|cart|together|all items|both)\b/i.test(local);
    const scope = request.isCart && !perItem && (total || !localCategory) ? 'cart' : 'product';
    const word = match[1].toLowerCase().replace(/\s+/g, ' ');
    const foreignCurrency = /[€£]/.test(match[2]) || Boolean(match[4] && !/^(USD|dollars)$/i.test(match[4]));
    const operator = foreignCurrency || /around|approximately|about/.test(word) ? 'required' : /under|below|less than/.test(word) ? '<' : /at least/.test(word) ? '>=' : /over|above|greater/.test(word) ? '>' : /exactly/.test(word) ? 'equals' : '<=';
    constraints.push({ id: '', attribute: scope === 'cart' ? 'cart_total_price' : 'price', operator, expectedValue: foreignCurrency ? 'Unsupported budget currency' : Number(match[3]), scope,
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

/** Preserve every stated total, including unparseable evidence, rather than
 * dropping it and allowing calculated line items to silently prove PASS. */
function statedTotalClaims(text: string): LlmOutputClaimAnalysisResult['claims'] {
  const claims: LlmOutputClaimAnalysisResult['claims'] = [];
  const labels = /\b(?:grand\s+total|cart\s+total|combined\s+total|total(?:\s+(?:cost|price))?|in\s+total|totaling|all\s+items\s+for)\s*(?:is\b|of\b|comes\s+to\b|:|=)?\s*/gi;
  for (const match of text.matchAll(labels)) {
    if (/\b(?:line|sub)\s*$|\$\s*\d+(?:\.\d+)?\s*$/i.test(text.slice(0, match.index))) continue;
    const tail = text.slice((match.index ?? 0) + match[0].length).split(/\.(?=\s|$)|[;\n]/)[0].trim();
    // A trailing 'total' on a line price is not a response total declaration.
    if (!tail) continue;
    const exact = tail.match(/^(?:\$\s*(\d+(?:\.\d+)?)\s*(?:USD|dollars)?|(\d+(?:\.\d+)?)\s*(?:USD|dollars))(?:\s+(?:for both|for all items))?$/i);
    claims.push({ id: '', productId: null, productName: null, claimType: 'price', nature: 'factual', attribute: 'cart_total_price', operator: 'equals',
      value: exact ? Number(exact[1] ?? exact[2]) : 'Ambiguous or unsupported stated total', unit: exact ? 'USD' : null,
      sourceText: match[0] + tail, confidence: 0.99 });
  }
  return claims;
}

function evidenceStart(text: string, index: number): number {
  const before = text.slice(0, index);
  const delimiters = [...before.matchAll(/\n|[,;]|\.(?=\s)|\band\b/gi)];
  const last = delimiters.at(-1);
  return last ? last.index! + last[0].length : 0;
}

function localPrices(section: string): number[] {
  return [...section.matchAll(/\$\s*(\d+(?:\.\d+)?)(?:\s*(USD|dollars|CAD|AUD|EUR|GBP))?|(\d+(?:\.\d+)?)\s*(USD|dollars)/gi)]
    .filter(m => !m[2] || /^(USD|dollars)$/i.test(m[2])).map(m => Number(m[1] ?? m[3]));
}

export function reconcileClaimCart(result: LlmOutputClaimAnalysisResult, text: string): LlmOutputClaimAnalysisResult {
  // Bound evidence by actual textual positions, independent of API array order.
  const names = [...new Set(result.products.map(p => p.name.toLowerCase()).filter(Boolean))];
  const mentions = names.flatMap(name => {
    const positions: Array<{ name: string; index: number }> = [];
    let from = 0, index: number;
    while ((index = text.toLowerCase().indexOf(name, from)) >= 0) {
      positions.push({ name, index }); from = index + name.length;
    }
    return positions;
  }).sort((a, b) => a.index - b.index);
  const sections = mentions.map((mention, i) => {
    const start = evidenceStart(text, mention.index);
    const next = mentions[i + 1];
    const end = next ? Math.max(mention.index + mention.name.length, evidenceStart(text, next.index)) : text.length;
    // Response totals must not masquerade as the last product's unit price.
    const rawSection = text.slice(start, end);
    const total = statedTotalClaims(rawSection)[0];
    const totalIndex = total ? rawSection.indexOf(total.sourceText) : -1;
    const section = totalIndex < 0 ? rawSection : rawSection.slice(0, totalIndex);
    return { ...mention, section };
  });
  const products = result.products.map(p => {
    const sameName = result.products.filter(other => other.name.toLowerCase() === p.name.toLowerCase());
    let relevant = sections.filter(s => s.name === p.name.toLowerCase());
    // Repeated identical names on separate lines need distinguishing price or
    // quantity evidence. If no unique mapping exists, retain UNKNOWN.
    if (sameName.length > 1) {
      relevant = relevant.filter(s => p.price?.amount != null && localPrices(s.section).includes(p.price.amount)
        && (!p.quantity || extractQuantity(s.section).amount === parseQuantity(p.quantity)));
      if (relevant.length !== 1 || sameName.filter(other => other.price?.amount === p.price?.amount && parseQuantity(other.quantity) === parseQuantity(p.quantity)).length > 1) relevant = [];
    }
    const generalFallback = p.name === 'Recommended Item' && result.products.length === 1;
    const evidence = relevant.length ? relevant.map(s => s.section) : generalFallback ? [text] : [];
    const quantities = evidence.map(s => extractQuantity(s).raw).filter((q): q is string => q !== null);
    const distinctQuantities = new Set(quantities.map(q => parseQuantity(q)));
    const quantity = distinctQuantities.size === 1 ? quantities[0] : null;
    const parsedQuantity = parseQuantity(quantity);
    const amounts = evidence.flatMap(localPrices);
    const price = evidence.length > 0 && p.price && p.price.currency === 'USD' && Number.isFinite(p.price.amount) && p.price.amount! >= 0
      && amounts.length > 0 && amounts.every(amount => amount === p.price!.amount) ? p.price : null;
    const ambiguousPrice = evidence.some(section => /\b(?:line total|subtotal|for both|for all|total for)\b|\$[0-9.]+\s+total\b/i.test(section) && !/\b(?:each|apiece|per unit)\b/i.test(section));
    const unitPrice = ambiguousPrice ? null : price;
    return { ...p, category: productCategory(p.name) ?? productCategory(p.category ?? '') ?? p.category, quantity, parsedQuantity, unitPrice,
      lineTotal: unitPrice?.amount != null && parsedQuantity != null ? { amount: Math.round(unitPrice.amount * 100) * parsedQuantity / 100, currency: unitPrice.currency } : null };
  });
  const claims = result.claims.filter(c => !['quantity', 'line_total', 'cart_total_price', 'total_price'].includes(c.attribute));
  claims.push(...statedTotalClaims(text));
  for (const p of products) if (p.parsedQuantity != null) claims.push({ id: `CL${claims.length + 1}`, productId: p.id, productName: p.name, claimType: 'quantity', nature: 'factual', attribute: 'quantity', operator: 'equals', value: p.parsedQuantity, unit: 'units', sourceText: p.quantity!, confidence: 0.98 });
  claims.forEach((c, i) => { c.id = `CL${i + 1}`; });
  return { ...result, products, claims, summary: { ...result.summary, totalProducts: products.length, totalClaims: claims.length, factualCount: claims.filter(c => c.nature === 'factual').length, subjectiveCount: claims.filter(c => c.nature === 'subjective').length,
    claimsPerProduct: Object.fromEntries(products.map(p => [p.id, claims.filter(c => c.productId === p.id).length])) }, rawJson: { ...result.rawJson, products, claims } };
}
