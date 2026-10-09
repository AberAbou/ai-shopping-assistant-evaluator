import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './helpers/evaluate';
import { analyzeUserPromptDeterministically as prompt } from '../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../src/services/evaluation/fallbackClaimAnalyzer';
import { normalizePromptAnalysis } from '../src/services/evaluation/promptAnalysisNormalizer';
import { buildConciseProfessionalReport, buildDetailedProfessionalReport } from '../src/services/evaluation/reportExportHelper';

const items = 'I need 2 running shirts and 1 pair of running shorts.';
const mandatory = 'All items must be suitable for running.';
const output = 'I recommend 2 RunFit running shirts at $20 each and 1 pair of RunFit running shorts at $40. All items are specifically designed for running. The total is $80.';
const cases: Array<[string,string[]]> = [
  ['Ideally, my total budget should be under $70.', ['soft']],
  ['Preferably, my total budget should be under $70.', ['soft']],
  ['If possible, my total budget should be under $70.', ['soft']],
  ['Nice to have, my total budget should be under $70.', ['soft']],
  ['Ideally; my total budget should be under $70.', ['soft']],
  ['Preferably; my total budget should be under $70.', ['soft']],
  ['If possible; my total budget should be under $70.', ['soft']],
  ['Nice to have; my total budget should be under $70.', ['soft']],
  ['Nice to have: my total budget should be under $70.', ['soft']],
  ['My total budget should be under $70, if possible.', ['soft']],
  ['My total budget should be under $70; if possible.', ['soft']],
  ['Ideally, my total budget should be under $70; my total budget must be under $90.', ['soft','hard']],
  ['Ideally, my total budget should be under $70, my total budget must be under $90.', ['soft','hard']],
  ['My total budget must be under $90, ideally, my total budget should be under $70.', ['hard','soft']],
  ['My total budget must be under $70; preferably, my total budget should be under $60.', ['hard','soft']],
  ['Preferably black shirts, my total budget must be under $70.', ['hard']],
  ['Nice to have breathable shirts; my total budget must be under $70.', ['hard']],
  ['Ideally, shirts under $15 each; my total budget must be under $70.', ['soft','hard']],
  ['My total budget must be under $80.', ['hard']],
  ['Ideally, my total budget should be under $70; my total budget is under $90.', ['soft','hard']],
  ['Ideally, my total budget should be under $70, my total budget is under $80.', ['soft','hard']],
  ['My total budget is under $90, ideally, my total budget should be under $70.', ['hard','soft']],
  ['Preferably black shirts, my total budget is under $70.', ['hard']],
  ['Nice to have breathable shirts; my total budget is under $70.', ['hard']],
];
for (const [budget, types] of cases) for (const api of [false,true]) test(`${api ? 'API-normalized' : 'fallback'}: ${budget}`, async () => {
  const input = `${items} ${budget} ${mandatory}`;
  const raw = prompt(input);
  // Deliberately wrong model classification must not override source preferences.
  if (api) raw.constraints.filter(c => c.attribute === 'cart_total_price' || c.attribute === 'price').forEach(c => c.constraintType = 'hard');
  const r = await evaluate(input, output, api ? {prompt:normalizePromptAnalysis(raw,input),claims:claims(output)} : undefined);
  const budgets = r.promptAnalysis.constraints.filter(c => ['cart_total_price','price'].includes(c.attribute));
  assert.deepEqual(budgets.map(c => c.constraintType), types);
  for (const c of budgets) assert.ok(input.includes(c.sourceText));
  assert.equal(r.finalEvaluationResult.cartEvaluation!.calculatedCartTotal, 80);
  assert.deepEqual(r.verificationResult.records.filter(v => v.constraintAttribute === 'use_case').map(v => v.status), ['PASS','PASS']);
  const hardFails = budgets.some(c => c.constraintType === 'hard' && Number(c.expectedValue) <= 80);
  assert.equal(r.finalEvaluationResult.finalVerdict, hardFails ? 'FAIL' : 'PASS');
  assert.equal(r.finalEvaluationResult.cartEvaluation!.cartHardGateState, hardFails ? 'HARD_GATE_FAIL' : 'HARD_GATE_PASS');
  if (types.every(t => t === 'soft')) {
    assert.equal(r.finalEvaluationResult.summary.overallSeverity, 'NONE');
    const v = r.finalEvaluationResult.cartEvaluation!.verifications.find(v => v.constraintAttribute === 'cart_total_price')!;
    assert.equal(v.status, 'FAIL');
    assert.equal(v.constraintType, 'soft');
    for (const report of [buildConciseProfessionalReport(r).plainText,buildDetailedProfessionalReport(r).plainText]) assert.match(report,/optional preference/i);
    assert.match(budgets[0].sourceText,/ideally|preferably|if possible|nice to have/i);
  }
});

for (const [name, response, expectedTotal] of [
  ['quantity mismatch', output.replace('2 RunFit','1 RunFit').replace('$80','$60'),60],
  ['unsuitable items', output.replace('specifically designed for running','not suitable for running'),80],
] as const) test(`soft budget never weakens mandatory ${name}`, async () => {
  const input = `${items} Ideally, my total budget should be under $70. ${mandatory}`;
  const r = await evaluate(input,response);
  assert.equal(r.promptAnalysis.constraints.find(c => c.attribute === 'cart_total_price')!.constraintType,'soft');
  assert.equal(r.finalEvaluationResult.finalVerdict,'FAIL');
  assert.equal(r.finalEvaluationResult.cartEvaluation!.calculatedCartTotal,expectedTotal);
});
