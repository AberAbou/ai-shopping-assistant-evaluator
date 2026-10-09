import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './helpers/evaluate';
import { analyzeLlmOutputDeterministically as claims } from '../src/services/evaluation/fallbackClaimAnalyzer';
import { analyzeUserPromptDeterministically as prompt } from '../src/services/evaluation/fallbackPromptAnalyzer';
import { normalizeClaimAnalysis } from '../src/services/evaluation/claimAnalysisNormalizer';
import { reconcilePromptCart } from '../src/services/evaluation/shoppingCartSemantics';
import { buildDetailedProfessionalReport, buildExportMarkdownReport } from '../src/services/evaluation/reportExportHelper';

export const input = 'I need 2 running shirts at $25 each and 1 pair of running shorts at $40. My total budget is under $85. All items must be suitable for running.';
const items = 'I recommend 2 RunFit running shirts at $25 each and 1 pair of RunFit running shorts at $40.';
const cases: Array<[string, string, string[]]> = [
  ['manual blocker', 'All items are specifically designed for running.', ['PASS','PASS']],
  ['negative collective', 'All items are not suitable for running.', ['FAIL','FAIL']],
  ['shirts only', 'RunFit running shirts are suitable for running.', ['PASS','UNKNOWN']],
  ['shorts only', 'RunFit running shorts are suitable for running.', ['UNKNOWN','PASS']],
  ['conflict with shirts', 'All items are suitable for running. RunFit running shirts are not suitable for running.', ['UNKNOWN','PASS']],
  ['negative collective conflicting with shorts', 'All items are not suitable for running. RunFit running shorts are suitable for running.', ['FAIL','UNKNOWN']],
  ['collective conflict', 'All items are suitable for running. All items are not suitable for running.', ['UNKNOWN','UNKNOWN']],
  ['negative before positive', 'RunFit running shorts are not suitable for running. All items are suitable for running.', ['PASS','UNKNOWN']],
  ['same-clause conflict', 'All items are suitable for running and not suitable for running.', ['UNKNOWN','UNKNOWN']],
  ['unrelated negative attribute', 'All items are not waterproof and are suitable for running.', ['PASS','PASS']],
  ['different activity does not conflict', 'All items are suitable for running and not suitable for hiking.', ['PASS','PASS']],
  ['unsuitable collective', 'All items are unsuitable for running.', ['FAIL','FAIL']],
  ['conditional collective is not proof', 'If used indoors, all items are suitable for running.', ['UNKNOWN','UNKNOWN']],
];
for (const [name, statement, statuses] of cases) for (const api of [false,true]) for (const budget of [85,100]) test(`${name}: ${api ? 'API-normalized' : 'fallback'}, budget ${budget}`, async () => {
  const output = `${items} ${statement} The total is $90.`;
  const request = input.replace('$85', `$${budget}`);
  const raw = claims(output);
  if (api) raw.claims.filter(c => c.attribute === 'use_case').forEach(c => { c.productId = 'P2'; c.productName = raw.products[1].name; });
  const r = await evaluate(request, output, api ? {prompt:prompt(request), claims:normalizeClaimAnalysis(raw, output)} : undefined);
  const records = r.verificationResult.records.filter(v => v.constraintAttribute === 'use_case');
  assert.deepEqual(records.map(v => v.status), statuses);
  const expected = budget === 85 || statuses.includes('FAIL') ? 'FAIL' : statuses.includes('UNKNOWN') ? 'INDETERMINATE' : 'PASS';
  assert.equal(r.finalEvaluationResult.finalVerdict, expected);
  assert.equal(r.finalEvaluationResult.cartEvaluation!.calculatedCartTotal, 90);
  assert.equal(r.finalEvaluationResult.cartEvaluation!.cartHardGateState, budget === 85 ? 'HARD_GATE_FAIL' : 'HARD_GATE_PASS');
  if (budget === 85) assert.equal(r.finalEvaluationResult.summary.overallSeverity, 'HIGH');
  for (const c of r.claimAnalysis.claims.filter(c => c.attribute === 'use_case')) assert.ok(output.includes(c.sourceText));
  if (name === 'manual blocker') {
    assert.deepEqual(new Set(r.claimAnalysis.claims.filter(c => c.attribute === 'use_case').map(c => c.productId)), new Set(['P1','P2']));
    for (const v of records) assert.ok(v.claimEvidence.some(e => e.includes('All items')));
    assert.match(buildDetailedProfessionalReport(r).plainText, /All items are specifically designed for running/);
    assert.match(buildExportMarkdownReport(r), /All items are specifically designed for running/);
  }
  if ((name.includes('conflict') && !name.includes('does not conflict')) || name === 'negative before positive') for (const v of records.filter(v => v.status === 'UNKNOWN')) assert.equal(v.claimEvidence.length, 2);
});

for (const api of [false,true]) test(`inline product claim does not leak: ${api ? 'API' : 'fallback'}`, async () => {
  const output = `${items.replace('at $40.', 'at $40, suitable for running.')} The total is $90.`;
  const request = input.replace('$85', '$100');
  const r = await evaluate(request, output, api ? {prompt:prompt(request), claims:normalizeClaimAnalysis(claims(output),output)} : undefined);
  assert.deepEqual(r.verificationResult.records.filter(v => v.constraintAttribute === 'use_case').map(v => v.status), ['UNKNOWN','PASS']);
  assert.equal(r.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
});

test('collective requirement preserves a separate product-specific activity', () => {
  const request = `${input} Shirts must also be suitable for hiking.`;
  const analysis = prompt(input);
  analysis.constraints.push({id:'C99', attribute:'use_case', operator:'suitable_for', expectedValue:'hiking', scope:'product', targetProductCategory:'shirt', constraintType:'hard', polarity:'positive', sourceText:'Shirts must also be suitable for hiking', confidence:0.99});
  const result = reconcilePromptCart(analysis, request);
  const running = result.constraints.find(c => c.attribute === 'use_case' && c.expectedValue === 'running')!;
  const hiking = result.constraints.find(c => c.attribute === 'use_case' && c.expectedValue === 'hiking')!;
  assert.equal(running.targetProductCategory, null);
  assert.equal(hiking.targetProductCategory, 'shirt');
  assert.equal(hiking.constraintType, 'hard');
});

for (const api of [false,true]) test(`ambiguous same-category reference cannot borrow the last product scope: ${api ? 'API' : 'fallback'}`, async () => {
  const request = input.replace('$85', '$100');
  const output = 'I recommend 1 Alpha running shirt at $25 each and 1 Beta running shirt at $25 each and 1 pair of RunFit running shorts at $40. A shirt is suitable for running. The total is $90.';
  const r = await evaluate(request,output,api ? {prompt:prompt(request),claims:normalizeClaimAnalysis(claims(output),output)} : undefined);
  assert.equal(r.claimAnalysis.products.filter(p => p.category === 'shirt').length,2);
  assert.deepEqual(r.verificationResult.records.filter(v => v.constraintAttribute === 'use_case').map(v => v.status), ['UNKNOWN','UNKNOWN','UNKNOWN']);
  assert.equal(r.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
});
