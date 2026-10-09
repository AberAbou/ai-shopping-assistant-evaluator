import test from 'node:test';
import assert from 'node:assert/strict';
import { cartRequest, shoppingConstraints } from '../src/services/evaluation/shoppingCartSemantics';
import { analyzeUserPromptDeterministically as prompt } from '../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../src/services/evaluation/fallbackClaimAnalyzer';
import { normalizeClaimAnalysis } from '../src/services/evaluation/claimAnalysisNormalizer';
import { normalizePromptAnalysis } from '../src/services/evaluation/promptAnalysisNormalizer';
import { verifyProductConstraintsDeterministically as verify } from '../src/services/evaluation/fallbackVerificationEngine';
import { evaluate } from './helpers/evaluate';
import { buildExportMarkdownReport, buildConciseProfessionalReport, buildDetailedProfessionalReport } from '../src/services/evaluation/reportExportHelper';

const request = 'Buy 2 shirts and 1 pair of shorts; total budget under $85';
const valid = 'I recommend 2 running shirts at $20 each and 1 pair of running shorts at $40 each. Total: $80.';
const invalid = valid.replace('$20', '$25').replace('$80', '$90');

for (const input of [
  'Buy 2 shirts and 1 pair of shorts, either red or blue; total budget under $85',
  'Buy 2 shirts and shorts; if possible make them breathable; total budget under $85',
  'Buy 2 shirts and 1 pair of shorts, red or blue; total budget under $85',
  'Buy 2 shirts in red or blue and 1 pair of shorts; total budget under $85',
]) test(`risk 1: optional attributes preserve cart gates: ${input}`, async () => {
  assert.equal(cartRequest(input).isCart, true);
  const r = await evaluate(input, invalid);
  assert.equal(r.finalEvaluationResult.finalVerdict, 'FAIL');
  assert.equal(r.finalEvaluationResult.cartEvaluation!.cartHardGateState, 'HARD_GATE_FAIL');
  assert.equal(r.promptAnalysis.constraints.some(c => c.attribute === 'quantity' && c.expectedValue === 2), true);
});
for (const input of ['Buy either 2 shirts or 1 pair of shorts; total budget under $85', 'If it rains buy a jacket, otherwise buy a shirt.', 'Recommend a shirt and, if unavailable, shorts under $30']) {
  test(`risk 1: real item choices remain alternatives: ${input}`, () => assert.equal(cartRequest(input).isCart, false));
}

for (const total of ['Total: $80, including all items.', 'Total: $80 (before tax).', 'Total: $80!', 'Total: $80,']) {
  test(`risk 2: qualified/unrecognized terminal total is explicitly UNKNOWN: ${total}`, async () => {
    const r = await evaluate(request, valid.replace('Total: $80.', total));
    assert.equal(r.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
    assert.equal(r.finalEvaluationResult.summary.totalConfirmedFailures, 0);
    assert.equal(r.finalEvaluationResult.cartEvaluation!.ambiguousStatedTotal, true);
    assert.equal(r.finalEvaluationResult.cartEvaluation!.effectiveCartTotal, null);
    for (const report of [buildExportMarkdownReport(r), buildConciseProfessionalReport(r).plainText, buildDetailedProfessionalReport(r).plainText]) {
      assert.match(report, /ambiguous amount or unsupported currency/i);
    }
  });
}

for (const currency of ['EUR', 'GBP', 'CAD', '']) test(`risk 3: direct foreign/missing product currency is UNKNOWN: ${currency}`, () => {
  const p = claims('I recommend Trail Jacket for $90.');
  p.products[0].price!.currency = currency;
  assert.equal(verify(prompt('a jacket under $100').constraints, p.products, p.claims).records.find(v => v.constraintAttribute === 'price')!.status, 'UNKNOWN');
});
for (const [text, currency] of [['I recommend Trail Jacket for €90.', 'EUR'], ['I recommend Trail Jacket for $90 CAD.', 'CAD'], ['I recommend Trail Jacket for €90.', 'USD']] as const) {
  test(`risk 3: API-normalized currency evidence cannot false PASS: ${currency} / ${text}`, async () => {
    const input = 'a jacket under $100';
    const api = claims('I recommend Trail Jacket for $90.');
    api.products[0].price = {amount:90, currency, sourceText:text};
    const r = await evaluate(input, text, {prompt:prompt(input), claims:normalizeClaimAnalysis(api, text)});
    assert.equal(r.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
    assert.equal(r.finalEvaluationResult.summary.totalConfirmedFailures, 0);
  });
}
test('risk 3: fallback dollar sign with foreign code is not USD', async () => {
  const r = await evaluate('a jacket under $100', 'I recommend Trail Jacket for $90 EUR.');
  assert.equal(r.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
});
test('risk 3: supported USD product-only strict boundary stays unchanged', async () => {
  for (const [price, expected] of [[99,'PASS'],[100,'FAIL']] as const) {
    assert.equal((await evaluate('a jacket under $100', `I recommend Trail Jacket for $${price}.`)).finalEvaluationResult.finalVerdict, expected);
  }
});

for (const input of ['Buy 2 shirts and 1 pair of shorts; max 85', 'Buy 2 shirts and 1 pair of shorts; total budget under 85', 'a jacket under 100']) {
  test(`risk 4: currency-free monetary limit retains UNKNOWN: ${input}`, async () => {
    const p = prompt(input);
    const monetary = p.constraints.find(c => c.attribute.includes('price'))!;
    assert.equal(monetary.operator, 'required');
    assert.equal(p.intent.budget!.currency, 'Unknown');
    assert.deepEqual(normalizePromptAnalysis(p, input).constraints, p.constraints);
    const r = await evaluate(input, input.startsWith('a jacket') ? 'I recommend Trail Jacket for $90.' : valid);
    assert.equal(r.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
  });
}
test('risk 4: explicit physical maximum does not become a price budget', () => {
  assert.equal(shoppingConstraints('headphones with max 85 dB').some(c => c.attribute.includes('price')), false);
});
for (const input of ['budget under $85 for 2 shirts and shorts', 'Budget under $85 for 2 shirts and 1 pair of shorts; shirts under $25 each']) {
  test(`risk 4: budget before items is cart-scoped: ${input}`, async () => {
    const c = shoppingConstraints(input);
    assert.equal(c[0].scope, 'cart');
    assert.equal(c[0].expectedValue, 85);
    if (input.includes('each')) assert.equal(c.find(c => c.attribute === 'price')!.targetProductCategory, 'shirt');
    const r = await evaluate(input, invalid);
    assert.equal(r.finalEvaluationResult.cartEvaluation!.cartHardGateState, 'HARD_GATE_FAIL');
  });
}
for (const separator of [';', '.']) test(`risk 4: unresolved cart budget cannot vanish beside a valid item price cap (${separator})`, async () => {
  const input = `2 shirts under $25 each and 1 pair of shorts${separator} total budget as discussed earlier`;
  const r = await evaluate(input, valid);
  assert.equal(r.promptAnalysis.constraints.some(c => c.attribute === 'cart_total_price' && c.operator === 'required'), true);
  assert.equal(r.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
});
test('risk 4: explicit USD and category-local cap stay supported', async () => {
  const input = '2 shirts under $25 each and 1 pair of shorts; total budget under 85 USD';
  assert.equal((await evaluate(input, valid)).finalEvaluationResult.finalVerdict, 'PASS');
});
for (const amount of ['¥85', '₹85', '85 JPY']) test(`risk 4: unsupported currency budget is retained as UNKNOWN: ${amount}`, async () => {
  const input = `2 shirts and 1 pair of shorts; under ${amount}`;
  const p = prompt(input);
  assert.equal(p.constraints.some(c => c.attribute === 'cart_total_price' && c.operator === 'required'), true);
  assert.equal((await evaluate(input, valid)).finalEvaluationResult.finalVerdict, 'INDETERMINATE');
});
