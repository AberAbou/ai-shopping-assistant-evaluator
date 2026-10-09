import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUserPromptDeterministically as prompt } from '../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../src/services/evaluation/fallbackClaimAnalyzer';
import { normalizeClaimAnalysis } from '../src/services/evaluation/claimAnalysisNormalizer';
import { cartRequest, shoppingConstraints } from '../src/services/evaluation/shoppingCartSemantics';
import { evaluateShoppingCart } from '../src/services/evaluation/shoppingCartEngine';
import { evaluate } from './helpers/evaluate';
import { buildExportMarkdownReport, buildConciseProfessionalReport, buildDetailedProfessionalReport } from '../src/services/evaluation/reportExportHelper';

const request = '2 shirts and 1 pair of shorts; total budget under $85';
const output = 'I recommend 2 running shirts at $20 each and 1 pair of running shorts at $40 each. Total: $80.';

for (const input of [
  'Recommend a shirt under $30. I already own shorts and shoes.',
  'Recommend a shirt under $30; my shorts are blue, and my shoes are black.',
  'Recommend a shirt under $30 and, if unavailable, shorts under $30.',
  'If it rains buy a jacket, otherwise buy a shirt.',
  'Recommend a shirt, comfortable and breathable. I do not need shorts.',
]) test(`review 1: unrelated/conditional categories are not a cart: ${input}`, () => {
  assert.equal(cartRequest(input).isCart, false);
  assert.ok(!prompt(input).constraints.some(c => c.scope === 'cart'));
});
for (const input of ['Buy 2 shirts and 1 pair of shorts', 'Buy a shirt, shorts, and socks', '2 shirts; total budget under $60']) {
  test(`review 1: explicit cart retained: ${input}`, () => assert.equal(cartRequest(input).isCart, true));
}

for (const input of ['Buy 2 shirts at $20 each and 1 pair of shorts for $40 each', 'Buy 2 shirts for $20 each and 1 pair of shorts at $40 each; total budget under $85']) {
  test(`review 2: stated unit prices are not budget constraints: ${input}`, () => {
    const money = shoppingConstraints(input).filter(c => c.attribute.includes('price'));
    assert.equal(money.length, input.includes('budget') ? 1 : 0);
    assert.ok(money.every(c => c.scope === 'cart' && c.expectedValue === 85));
  });
}
test('review 2: one category-local budget does not become a cart budget', () => {
  const money = shoppingConstraints('2 shirts under $25 and 1 pair of shorts').filter(c => c.attribute.includes('price'));
  assert.deepEqual(money.map(c => [c.scope, c.targetProductCategory, c.expectedValue]), [['product', 'shirt', 25]]);
});
test('review 2: adjacent item/cart budgets retain separate scopes', () => {
  const money = shoppingConstraints('2 shirts under $25 each; total budget under $85; 1 pair of shorts under $45 each').filter(c => c.attribute.includes('price'));
  assert.deepEqual(money.map(c => [c.scope, c.targetProductCategory, c.expectedValue]), [['product', 'shirt', 25], ['cart', null, 85], ['product', 'shorts', 45]]);
});

test('review 3: reversed API product order cannot borrow quantities or prices', async () => {
  const api = claims(output);
  api.products.reverse();
  const parsed = normalizeClaimAnalysis(api, output);
  assert.deepEqual(parsed.products.map(p => [p.category, p.parsedQuantity, p.unitPrice?.amount]), [['shorts', 1, 40], ['shirt', 2, 20]]);
  assert.equal((await evaluate(request, output, {prompt: prompt(request), claims: parsed})).finalEvaluationResult.finalVerdict, 'PASS');
});
test('review 3: conjunction before an item description does not copy the previous quantity', () => {
  const text = 'I recommend 2 shirts at $20 each and, for shorts, 1 Running Shorts at $40 each.';
  const api = claims(output);
  api.products[1].name = 'Running Shorts';
  const parsed = normalizeClaimAnalysis(api, text);
  assert.equal(parsed.products[1].parsedQuantity, 1);
  assert.equal(parsed.products[1].unitPrice?.amount, 40);
});
test('review 3: repeated identical product names on separate cart lines stay isolated', () => {
  const text = '1. 1 Blue Shirt - $20 each\n2. 2 Blue Shirt - $25 each\nTotal: $70.';
  const parsed = claims(text);
  assert.deepEqual(parsed.products.map(p => [p.parsedQuantity, p.unitPrice?.amount]), [[1,20], [2,25]]);
});
test('review 3: duplicate API names bind to their own price evidence even in reversed order', () => {
  const text = '1. 1 Blue Shirt - $20 each\n2. 2 Blue Shirt - $25 each\nTotal: $70.';
  const api = claims(text);
  api.products.forEach(p => { p.name = 'Blue Shirt'; p.quantity = null; });
  api.products.reverse();
  const parsed = normalizeClaimAnalysis(api, text);
  assert.deepEqual(parsed.products.map(p => [p.parsedQuantity, p.unitPrice?.amount]), [[2,25], [1,20]]);
});
test('review 3: duplicate API names without distinguishing evidence stay UNKNOWN', () => {
  const text = '1. 1 Blue Shirt - $20 each\n2. 2 Blue Shirt - $20 each';
  const api = claims(text);
  api.products.forEach(p => { p.name = 'Blue Shirt'; p.quantity = null; });
  assert.ok(normalizeClaimAnalysis(api, text).products.every(p => p.parsedQuantity === null && p.unitPrice === null));
});
test('review 3: a conflicting repeated price cannot silently pass', async () => {
  const text = output + ' Running shirts cost $30 each.';
  const r = await evaluate(request, text);
  assert.equal(r.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
  assert.deepEqual(r.claimAnalysis.products.map(p => p.category), ['shirt', 'shorts']);
});
test('review 3: absent API product name cannot borrow another item evidence', () => {
  const api = claims(output);
  api.products[0].name = 'Invented Shirt';
  const parsed = normalizeClaimAnalysis(api, output);
  assert.equal(parsed.products[0].parsedQuantity, null);
  assert.equal(parsed.products[0].unitPrice, null);
});
test('review 3: blank API name stays UNKNOWN without scanning empty occurrences', () => {
  const api = claims(output);
  api.products[0].name = ' ';
  const parsed = normalizeClaimAnalysis(api, output);
  assert.equal(parsed.products[0].parsedQuantity, null);
  assert.equal(parsed.products[0].unitPrice, null);
});

for (const total of ['Total: 60.', 'Total: €80.', 'Total: $80 CAD.', 'Total: about $80.', 'Total: $80 or $90.', 'Total: $80-$90.']) {
  test(`review 4: ambiguous/foreign stated total remains UNKNOWN: ${total}`, async () => {
    const r = await evaluate(request, output.replace('Total: $80.', total));
    assert.equal(r.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
    assert.equal(r.finalEvaluationResult.cartEvaluation!.effectiveCartTotal, null);
    for (const report of [buildExportMarkdownReport(r), buildConciseProfessionalReport(r).plainText, buildDetailedProfessionalReport(r).plainText]) {
      assert.match(report, /ambiguous|unsupported|currency/i);
      assert.doesNotMatch(report, /Stated (?:Cart )?[Tt]otal:\*\*?\s*Not stated|Stated total: Not stated/);
    }
  });
}
test('review 4: clearly stated USD total and no total remain valid', async () => {
  for (const total of ['Total: 80 USD.', 'Total: $80 USD.', 'Total is $80.', 'Grand total comes to $80.', 'All items for $80.', '']) {
    const r = await evaluate(request, output.replace('Total: $80.', total));
    assert.equal(r.finalEvaluationResult.finalVerdict, 'PASS');
  }
});
test('review 4: API foreign total cannot be compared as USD', () => {
  const parsed = claims(output);
  parsed.claims.find(c => c.attribute === 'cart_total_price')!.unit = 'EUR';
  const cart = evaluateShoppingCart(prompt(request).constraints.filter(c => c.scope === 'cart'), parsed.products, parsed.claims, () => 'V').cartEvaluation!;
  assert.equal(cart.effectiveCartTotal, null);
  assert.equal(cart.cartHardGateState, 'HARD_GATE_INDETERMINATE');
});

test('review 5: membership record cannot PASS when the requested count is wrong', async () => {
  const r = await evaluate(request, output.replace('2 running shirts', '1 running shirt').replace('$80', '$60'));
  assert.equal(r.finalEvaluationResult.finalVerdict, 'FAIL');
  assert.equal(r.verificationResult.records.find(v => v.constraintAttribute === 'cart_items')!.status, 'FAIL');
  for (const report of [buildExportMarkdownReport(r), buildConciseProfessionalReport(r).plainText, buildDetailedProfessionalReport(r).plainText]) {
    assert.doesNotMatch(report, /All requested categories and explicit item quantities are represented/);
  }
});
test('review 5: category membership without a requested count does not invent quantity verification', async () => {
  const r = await evaluate('shirts and shorts; total budget under $85', output);
  const record = r.verificationResult.records.find(v => v.constraintAttribute === 'cart_items')!;
  assert.equal(record.status, 'PASS');
  assert.doesNotMatch(record.reason, /requested.*quantities.*verified/i);
});
