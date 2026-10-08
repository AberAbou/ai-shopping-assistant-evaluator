import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './helpers/evaluate';
import { analyzeUserPromptDeterministically as prompt } from '../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../src/services/evaluation/fallbackClaimAnalyzer';
import { normalizePromptAnalysis } from '../src/services/evaluation/promptAnalysisNormalizer';
import { normalizeClaimAnalysis } from '../src/services/evaluation/claimAnalysisNormalizer';
import { analyzeUserPrompt } from '../src/services/evaluation/promptAnalysisService';
import { analyzeLlmOutput } from '../src/services/evaluation/claimAnalysisService';
import { evaluateShoppingCart } from '../src/services/evaluation/shoppingCartEngine';
import { parseQuantity } from '../src/services/evaluation/shoppingCartSemantics';
import { buildExportJsonPayload, buildExportMarkdownReport, buildConciseProfessionalReport, buildDetailedProfessionalReport } from '../src/services/evaluation/reportExportHelper';
import type { AtomicConstraint } from '../src/types/evaluation';

export const request = '2 shirts and 1 pair of shorts; total budget strictly under $85';
export const valid = 'I recommend 2 running shirts at $20 each and 1 pair of running shorts at $40 each. Total: $80.';
export const invalid = 'I recommend 2 running shirts at $25 each and 1 pair of running shorts at $40 each. Total: $90.';

const scenarios: Array<[string, string, string, string]> = [
  ['false PASS: quantities exceed total budget', request, invalid, 'FAIL'],
  ['false PASS: exact strictly-under boundary', request, 'I recommend 2 running shirts at $22.50 each and 1 pair of running shorts at $40 each. Total: $85.', 'FAIL'],
  ['valid cart', request, valid, 'PASS'],
  ['inclusive budget boundary', request.replace('strictly under $85', 'up to $80'), valid, 'PASS'],
  ['one category multiple units', '2 shirts; total budget under $60', 'I recommend 2 running shirts at $25 each. Total: $50.', 'PASS'],
  ['word quantities', 'two shirts and one pair of shorts; total budget under $85', 'I recommend two running shirts at $20 each and one pair of running shorts at $40 each.', 'PASS'],
  ['list quantities', request, '1. 2 Running Shirts - $20 each\n2. 1 pair of Running Shorts - $40 each\nTotal: $80.', 'PASS'],
  ['wrong requested quantity', request, 'I recommend 1 running shirt at $20 each and 1 pair of running shorts at $40 each.', 'FAIL'],
  ['missing quantities', request, 'I recommend running shirts at $20 each and running shorts at $40 each. Total: $80.', 'INDETERMINATE'],
  ['missing category', request, 'I recommend 2 running shirts at $20 each.', 'INDETERMINATE'],
  ['zero quantity', request, 'I recommend 0 running shirts at $20 each and 1 pair of running shorts at $40 each.', 'INDETERMINATE'],
  ['conflicting total', request, valid.replace('$80.', '$60.'), 'INDETERMINATE'],
  ['multiple conflicting totals', request, valid + ' Grand total: $70.', 'INDETERMINATE'],
  ['optional budget', request.replace('total budget strictly under $85', 'ideally total budget under $70'), valid, 'PASS'],
  ['per-item and cart budgets', '2 shirts under $25 each and 1 pair of shorts under $45 each; total budget under $85', valid, 'PASS'],
  ['category price failure', '2 shirts under $20 each and 1 pair of shorts under $45 each; total budget under $85', valid, 'FAIL'],
  ['scoped exclusion preserves other product', '1 leather-free running shoe and 1 shirt; total budget under $120', 'I recommend 1 running shoe at $60 each. It is 100% leather-free and suitable for running.\n1 shirt at $20 each. It has genuine leather trim.', 'PASS'],
  ['leather violation reproduction', 'running shoes without leather under $120', 'I recommend genuine leather running shoes for $99.', 'FAIL'],
  ['unsupported suitability remains UNKNOWN', 'running shoes without leather under $120', 'I recommend City Sneakers for $99. They have a synthetic mesh upper.', 'INDETERMINATE'],
  ['budget of phrasing', request.replace('strictly under', 'of'), invalid, 'FAIL'],
  ['optional unknown budget never fails mandatory items', request.replace('total budget strictly under $85', 'ideally total budget under $85'), 'I recommend 2 shirts and 1 pair of shorts.', 'PASS'],
  ['invalid requested quantity', request.replace('2 shirts', '1.5 shirts'), valid, 'INDETERMINATE'],
  ['approximate budget cannot prove compliance', request.replace('strictly under', 'around'), valid, 'INDETERMINATE'],
  ['unresolved budget cannot disappear', request.replace('strictly under $85', 'as discussed earlier'), valid, 'INDETERMINATE'],
  ['unsupported currency budget remains UNKNOWN', request.replace('$85', '€85'), valid, 'INDETERMINATE'],
];
for (const [name, input, output, verdict] of scenarios) test(name, async () => {
  const r = await evaluate(input, output);
  assert.equal(r.finalEvaluationResult.finalVerdict, verdict, JSON.stringify(r.verificationResult, null, 2));
  if (verdict === 'INDETERMINATE') assert.equal(r.finalEvaluationResult.summary.totalConfirmedFailures, 0);
});
test('alternatives are not summed', async () => {
  const r = await evaluate('a jacket under $100', 'Two options: Trail Jacket ($60) is waterproof. Rain Jacket ($70) is waterproof.');
  assert.equal(r.claimAnalysis.products.length, 2);
  assert.equal(r.verificationResult.cartEvaluation, undefined);
  assert.equal(r.finalEvaluationResult.finalVerdict, 'PASS');
});
test('either/or categories remain alternatives', () => assert.equal(prompt('either a shirt or shorts under $50').constraints.some(c => c.scope === 'cart'), false));
test('cart requirements never enter product rubrics', async () => {
  const r = await evaluate(request, invalid);
  assert.ok(r.finalEvaluationResult.productVerdicts.every(p => p.verdict === 'PASS'));
  assert.ok(r.rubricResult.productsList.every(p => p.criteria.every(c => r.promptAnalysis.constraints.find(a => a.id === c.sourceConstraintId)?.scope !== 'cart')));
  assert.equal(r.finalEvaluationResult.summary.overallSeverity, 'HIGH');
});
for (const raw of ['0', '-1', '1.5', 'many', 'NaN', 'Infinity', '2x garbage']) test(`invalid quantity: ${raw}`, () => assert.equal(parseQuantity(raw), null));
test('arithmetic uses cents at strict boundaries', () => {
  const c: AtomicConstraint = { id:'C1', attribute:'cart_total_price', scope:'cart', operator:'<', expectedValue:0.30, constraintType:'hard', polarity:'positive', sourceText:'under $0.30', confidence:1 };
  const r = evaluateShoppingCart([c], claims('I recommend 3 running shirts at $0.10 each and 1 pair of running shorts at $0 each.').products, [], () => 'V1').cartEvaluation!;
  assert.equal(r.calculatedCartTotal, 0.30);
  assert.equal(r.cartHardGateState, 'HARD_GATE_FAIL');
});
test('unsupported operator stays UNKNOWN', () => {
  const c: AtomicConstraint = { id:'C1', attribute:'cart_total_price', scope:'cart', operator:'contains', expectedValue:100, constraintType:'hard', polarity:'positive', sourceText:'$100', confidence:1 };
  assert.equal(evaluateShoppingCart([c], claims(valid).products, [], () => 'V1').cartEvaluation!.cartHardGateState, 'HARD_GATE_INDETERMINATE');
});
test('stated total cannot hide missing prices', () => {
  const parsed = claims(valid);
  parsed.products[0].price = null; parsed.products[0].unitPrice = null;
  const r = evaluateShoppingCart(prompt(request).constraints.filter(c => c.scope === 'cart'), parsed.products, parsed.claims, () => 'V1').cartEvaluation!;
  assert.equal(r.calculatedCartTotal, null); assert.equal(r.effectiveCartTotal, null);
  assert.equal(r.cartHardGateState, 'HARD_GATE_INDETERMINATE');
});
test('API normalizers preserve cart semantics', async () => {
  const p = prompt(request), c = claims(valid);
  const apiPrompt = normalizePromptAnalysis(p, request), apiClaims = normalizeClaimAnalysis(c, valid);
  assert.deepEqual(apiPrompt.constraints, p.constraints);
  assert.deepEqual(apiClaims.products.map(p => p.parsedQuantity), [2,1]);
  assert.equal((await evaluate(request, valid, { prompt:apiPrompt, claims:apiClaims })).finalEvaluationResult.finalVerdict, 'PASS');
});
test('mocked API and fallback parity without model calls', async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('analyze-prompt') ? prompt(request) : claims(invalid)), { status:200 });
    const r = await evaluate(request, invalid, { prompt:await analyzeUserPrompt(request), claims:await analyzeLlmOutput(invalid) });
    assert.equal(r.finalEvaluationResult.finalVerdict, 'FAIL');
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual((await analyzeUserPrompt(request)).constraints, r.promptAnalysis.constraints);
    assert.deepEqual((await analyzeLlmOutput(invalid)).products, r.claimAnalysis.products);
  } finally { globalThis.fetch = oldFetch; }
});
test('reports show cart totals, contradictions, and valid traceability', async () => {
  const r = await evaluate(request, valid.replace('$80.', '$60.'));
  assert.equal(buildExportJsonPayload(r).cartEvaluation!.totalDisagreement, true);
  for (const report of [buildExportMarkdownReport(r), buildConciseProfessionalReport(r).plainText, buildDetailedProfessionalReport(r).plainText]) {
    assert.match(report, /SHOPPING CART EVALUATION/); assert.match(report, /\$80/); assert.match(report, /\$60/); assert.match(report, /disagree/i);
    assert.doesNotMatch(report, /calculations were not evaluated|\$null|\$Unknown/);
  }
  const ids = new Set(r.verificationResult.records.map(v => v.id));
  assert.ok(r.finalEvaluationResult.cartEvaluation!.verifications.every(v => ids.has(v.id)));
  assert.ok(r.rootCauseResult.records.filter(v => v.productName === 'Shopping Cart').every(v => v.verificationIds.every(id => ids.has(id))));
});
test('single-product budget intent remains intact', () => {
  const p = prompt('waterproof jacket under $100');
  assert.equal(p.intent.budget!.maxAmount, 100);
  assert.equal(p.intent.budget!.sourceText, 'under $100');
});
test('or less is a budget boundary, not an alternative indicator', () => {
  assert.ok(prompt('2 shirts and 1 pair of shorts; total budget $85 or less').constraints.some(c => c.attribute === 'cart_total_price'));
});
test('for two items is not a price constraint', () => {
  assert.equal(prompt('I am shopping for 2 shirts').constraints.some(c => c.attribute.includes('price')), false);
});
test('API price inconsistent with its source cannot produce PASS', () => {
  const data = claims(valid);
  data.products[0].price!.amount = 10;
  const parsed = normalizeClaimAnalysis(data, valid);
  assert.equal(parsed.products[0].unitPrice, null);
});
test('ambiguous line totals are not multiplied as unit prices', () => {
  const parsed = claims('I recommend 2 shirts at $50 total and 1 pair of shorts at $30 total.');
  assert.ok(parsed.products.every(p => p.unitPrice === null));
});
test('same-category split lines aggregate requested quantities', async () => {
  const r = await evaluate('2 shirts; total budget under $60', '1. 1 Blue Shirt - $20 each\n2. 1 Red Shirt - $25 each\nTotal: $45.');
  assert.equal(r.finalEvaluationResult.finalVerdict, 'PASS');
  assert.equal(r.finalEvaluationResult.cartEvaluation!.calculatedCartTotal, 45);
});
test('soft unsupported budget stays outside hard gate', () => {
  const c: AtomicConstraint = { id:'C1', attribute:'cart_total_price', scope:'cart', operator:'contains', expectedValue:100, constraintType:'soft', polarity:'positive', sourceText:'prefer $100', confidence:1 };
  const r = evaluateShoppingCart([c], claims(valid).products, [], () => 'V1').cartEvaluation!;
  assert.equal(r.verifications[0].status, 'UNKNOWN'); assert.equal(r.cartHardGateState, 'HARD_GATE_PASS');
});
test('foreign currency is not silently summed as USD', () => {
  const parsed = claims(valid); parsed.products[0].unitPrice!.currency = 'EUR';
  const r = evaluateShoppingCart(prompt(request).constraints.filter(c => c.scope === 'cart'), parsed.products, parsed.claims, () => 'V1').cartEvaluation!;
  assert.equal(r.cartHardGateState, 'HARD_GATE_INDETERMINATE');
});
test('single-line cart failure does not contaminate product diagnostics', async () => {
  const r = await evaluate('2 shirts; total budget under $40', 'I recommend 2 running shirts at $25 each. Total: $50.');
  assert.equal(r.finalEvaluationResult.finalVerdict, 'FAIL');
  assert.equal(r.finalEvaluationResult.productVerdicts[0].verdict, 'PASS');
  assert.equal(r.finalEvaluationResult.productVerdicts[0].severity, 'NONE');
  assert.ok(!r.finalEvaluationResult.productVerdicts[0].keyRootCauseIds.some(id => r.rootCauseResult.records.find(c => c.causeId === id)?.productName === 'Shopping Cart'));
});
test('professional reports never invent product failures for a cart-only failure', async () => {
  const r = await evaluate(request, invalid);
  for (const report of [buildConciseProfessionalReport(r), buildDetailedProfessionalReport(r)]) {
    assert.match(report.executiveSummary, /shopping-cart requirement/);
    assert.doesNotMatch(report.executiveSummary, /at least one recommended product directly violated/);
  }
});
test('professional reports identify failed budgets as optional when appropriate', async () => {
  const r = await evaluate(request.replace('total budget strictly under $85', 'ideally total budget under $70'), valid);
  assert.match(buildConciseProfessionalReport(r).plainText, /optional preference/);
  assert.match(buildDetailedProfessionalReport(r).plainText, /optional preference/);
});
