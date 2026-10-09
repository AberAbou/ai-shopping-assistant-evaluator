import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { analyzeUserPromptDeterministically as prompt } from '../../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../../src/services/evaluation/fallbackClaimAnalyzer';

const input='I need 2 running shirts and 1 pair of running shorts. My total budget is under $85. All items must be suitable for running.';
const response='I recommend 2 RunFit running shirts at $20 each and 1 pair of RunFit running shorts at $40. Both products are specifically designed for running. The total is $60.';
const cases:Array<[string,string,string,string[],string,boolean]>=[
  ['Test 6',input,response,['PASS','PASS','PASS'],'INDETERMINATE',true],
  ['conflicting quantities',input,response+' 1 RunFit running shirts are recommended.',['UNKNOWN','UNKNOWN','PASS'],'INDETERMINATE',false],
  ['missing quantity',input,response.replace('2 RunFit','RunFit'),['UNKNOWN','UNKNOWN','PASS'],'INDETERMINATE',false],
  ['wrong quantity and monetary conflict',input,response.replace('2 RunFit','1 RunFit').replace('$60','$10'),['FAIL','FAIL','PASS'],'FAIL',true],
  ['ambiguous total',input,response.replace('$60','about $80'),['PASS','PASS','PASS'],'INDETERMINATE',false],
  ['cart request with unquantified options',input,'Options: RunFit Running Shirt ($20) is suitable for running. RunFit Running Shorts ($40) are suitable for running. The total is $60.',['UNKNOWN','UNKNOWN','UNKNOWN'],'INDETERMINATE',false],
  ['alternative request','Recommend a running shirt under $30.','Options: Alpha Running Shirt ($20) is suitable for running. Beta Running Shirt ($25) is suitable for running. The total is $60.',[],'PASS',false],
];
for(const [name,request,output,statuses,verdict,conflict] of cases) for(const offline of [false,true]) test(`14C.2 ${name}: ${offline ? 'fallback':'mock API'}`,async({page})=>{
  await page.route('**/api/analyze-*',async route=>{
    if(offline){await route.fulfill({status:503,body:'offline'});return;}
    const payload=route.request().url().includes('analyze-prompt')?prompt(request):claims(output);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.goto('/');
  await page.locator('textarea').nth(0).fill(request);
  await page.locator('textarea').nth(1).fill(output);
  await page.getByRole('button',{name:'RUN EVALUATION',exact:true}).click();
  await expect(page.getByRole('button',{name:'RUN EVALUATION',exact:true})).toBeEnabled({timeout:20000});
  await page.getByRole('button',{name:/2\. Constraint Matrix/}).click();
  const membership=page.getByRole('row').filter({has:page.getByRole('cell',{name:'cart_items',exact:true})});
  const quantities=page.getByRole('row').filter({has:page.getByRole('cell',{name:'quantity',exact:true})});
  if(statuses.length){
    await expect(membership).toHaveCount(1);
    await expect(membership.getByRole('cell').nth(4)).toHaveText(statuses[0]);
    await expect(quantities).toHaveCount(2);
    for(let i=0;i<2;i++) await expect(quantities.nth(i).getByRole('cell').nth(4)).toHaveText(statuses[i+1]);
    const budget=page.getByRole('row').filter({has:page.getByRole('cell',{name:'cart_total_price',exact:true})});
    await expect(budget.getByRole('cell').nth(4)).toHaveText(conflict?'CONFLICT':'UNKNOWN');
  }else{await expect(membership).toHaveCount(0);await expect(quantities).toHaveCount(0);}
  await page.getByRole('button',{name:/10\. Report & Export/}).click();
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const json=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
  expect(json.finalVerdict).toBe(verdict);
  const records=json.rawUpstreamArtifacts.verificationResult.records;
  const independent=records.filter((v:any)=>['cart_items','quantity'].includes(v.constraintAttribute));
  expect(independent.map((v:any)=>v.status)).toEqual(statuses);
  for(const row of independent){
    expect(row.conflictDetected).toBe(false);
    expect(row.claimEvidence.join(' ')).not.toMatch(/stated total|unit price|line total/i);
    expect(json.rawUpstreamArtifacts.promptAnalysis.constraints.some((c:any)=>c.id===row.constraintId)).toBe(true);
  }
  if(name==='Test 6'){
    expect(json.cartEvaluation.calculatedCartTotal).toBe(80);
    expect(json.cartEvaluation.statedCartTotal).toBe(60);
    expect(json.cartEvaluation.effectiveCartTotal).toBeNull();
    expect(json.cartEvaluation.cartHardGateState).toBe('HARD_GATE_INDETERMINATE');
    expect(records.filter((v:any)=>v.constraintAttribute==='use_case').map((v:any)=>v.status)).toEqual(['PASS','PASS']);
    await page.getByRole('button',{name:'Detailed Report',exact:true}).click();
    await expect(page.getByText(/Calculated and stated cart totals disagree/).first()).toBeVisible();
    await expect(page.getByText(/explicit requested quantities match/).first()).toBeVisible();
  }
  if(!statuses.length) expect(json.cartEvaluation).toBeUndefined();
});
