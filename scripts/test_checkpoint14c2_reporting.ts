import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './helpers/evaluate';
import { analyzeUserPromptDeterministically as prompt } from '../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../src/services/evaluation/fallbackClaimAnalyzer';
import { normalizeClaimAnalysis } from '../src/services/evaluation/claimAnalysisNormalizer';
import { normalizePromptAnalysis } from '../src/services/evaluation/promptAnalysisNormalizer';
import { buildDetailedProfessionalReport, buildConciseProfessionalReport, buildExportJsonPayload } from '../src/services/evaluation/reportExportHelper';

const input = 'I need 2 running shirts and 1 pair of running shorts. My total budget is under $85. All items must be suitable for running.';
const response = 'I recommend 2 RunFit running shirts at $20 each and 1 pair of RunFit running shorts at $40. Both products are specifically designed for running. The total is $60.';
const cases: Array<[string,string,string,string[],string,boolean]> = [
  ['Test 6',input,response,['PASS','PASS','PASS'],'INDETERMINATE',true],
  ['matching total',input,response.replace('$60','$80'),['PASS','PASS','PASS'],'PASS',false],
  ['ambiguous total',input,response.replace('$60','about $80'),['PASS','PASS','PASS'],'INDETERMINATE',false],
  ['multiple stated totals',input,response+' The total is $80.',['PASS','PASS','PASS'],'INDETERMINATE',true],
  ['wrong quantity with total conflict',input,response.replace('2 RunFit','1 RunFit').replace('$60','$10'),['FAIL','FAIL','PASS'],'FAIL',true],
  ['conflicting quantity evidence',input,response+' 1 RunFit running shirts are recommended.',['UNKNOWN','UNKNOWN','PASS'],'INDETERMINATE',false],
  ['missing quantity',input,response.replace('2 RunFit','RunFit'),['UNKNOWN','UNKNOWN','PASS'],'INDETERMINATE',false],
  ['soft conflicting budget',input.replace('My total budget is','Ideally, my total budget is'),response,['PASS','PASS','PASS'],'PASS',true],
  ['missing unit prices',input,'I recommend 2 RunFit running shirts and 1 pair of RunFit running shorts. Both products are specifically designed for running. The total is $60.',['PASS','PASS','PASS'],'INDETERMINATE',false],
];
for (const [name,request,output,statuses,verdict,disagreement] of cases) for (const api of [false,true]) test(`${name}: ${api ? 'API-normalized' : 'fallback'}`,async()=>{
  const r=await evaluate(request,output,api ? {prompt:normalizePromptAnalysis(prompt(request),request),claims:normalizeClaimAnalysis(claims(output),output)} : undefined);
  const cart=r.finalEvaluationResult.cartEvaluation!;
  const independent=r.verificationResult.records.filter(v=>['quantity','cart_items'].includes(v.constraintAttribute));
  assert.deepEqual(independent.map(v=>v.status),statuses);
  assert.ok(independent.every(v=>!v.conflictDetected));
  assert.ok(independent.every(v=>!v.claimEvidence.some(e=>/stated total|unit price|line total/i.test(e))));
  assert.ok(independent.every(v=>!/cart totals|stated total/i.test(v.reason)));
  assert.equal(cart.totalDisagreement,disagreement);
  assert.equal(r.finalEvaluationResult.finalVerdict,verdict);
  const budget=r.verificationResult.records.find(v=>v.constraintAttribute==='cart_total_price')!;
  assert.equal(budget.conflictDetected,disagreement);
  if (disagreement) {assert.equal(budget.status,'UNKNOWN');assert.equal(cart.effectiveCartTotal,null);}
  if(name==='multiple stated totals') {assert.ok(budget.claimEvidence.includes('Stated total: $60'));assert.ok(budget.claimEvidence.includes('Stated total: $80'));}
  assert.deepEqual(r.verificationResult.records.filter(v=>v.constraintAttribute==='use_case').map(v=>v.status),['PASS','PASS']);
  for(const row of r.verificationResult.records) assert.ok(r.promptAnalysis.constraints.some(c=>c.id===row.constraintId));
  assert.equal(new Set(r.verificationResult.records.map(v=>v.id)).size,r.verificationResult.records.length);
  for(const row of cart.verifications) assert.equal(row.status,r.verificationResult.records.find(v=>v.id===row.id)!.status);
  const json=buildExportJsonPayload(r);
  assert.equal(json.finalVerdict,verdict);
  if(name==='Test 6') {
    assert.equal(cart.calculatedCartTotal,80);assert.equal(cart.statedCartTotal,60);
    assert.equal(cart.cartHardGateState,'HARD_GATE_INDETERMINATE');
    for(const report of [buildDetailedProfessionalReport(r).plainText,buildConciseProfessionalReport(r).plainText]) {
      assert.match(report,/INDETERMINATE/);assert.match(report,/totals disagree/i);
      assert.match(report,/explicit requested quantities match/i);
    }
  }
});

test('alternative request stays product-level despite inconsistent response totals',async()=>{
  const request='Recommend a running shirt under $30.';
  const output='Options: Alpha Running Shirt ($20) is suitable for running. Beta Running Shirt ($25) is suitable for running. The total is $60.';
  const r=await evaluate(request,output);
  assert.equal(r.finalEvaluationResult.cartEvaluation,undefined);
  assert.equal(r.finalEvaluationResult.finalVerdict,'PASS');
  assert.ok(r.verificationResult.records.every(v=>v.productId!=='CART'&&!v.conflictDetected));
});

test('cart request with alternative output and no quantities cannot pass',async()=>{
  const output='Options: RunFit Running Shirt ($20) is suitable for running. RunFit Running Shorts ($40) are suitable for running. The total is $60.';
  const r=await evaluate(input,output);
  assert.equal(r.finalEvaluationResult.finalVerdict,'INDETERMINATE');
  assert.equal(r.finalEvaluationResult.cartEvaluation!.cartHardGateState,'HARD_GATE_INDETERMINATE');
  assert.ok(r.verificationResult.records.filter(v=>['cart_items','quantity'].includes(v.constraintAttribute)).every(v=>v.status==='UNKNOWN'));
});
