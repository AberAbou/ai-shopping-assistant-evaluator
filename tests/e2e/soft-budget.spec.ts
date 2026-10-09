import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { analyzeUserPromptDeterministically as prompt } from '../../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../../src/services/evaluation/fallbackClaimAnalyzer';

const items = 'I need 2 running shirts and 1 pair of running shorts.';
const mandatory = 'All items must be suitable for running.';
const valid = 'I recommend 2 RunFit running shirts at $20 each and 1 pair of RunFit running shorts at $40. All items are specifically designed for running. The total is $80.';
const cases: Array<[string,string,string[],string,string]> = [
  ['Test 8','Ideally, my total budget should be under $70.',['soft'],'PASS',valid],
  ['preferably','Preferably, my total budget should be under $70.',['soft'],'PASS',valid],
  ['if possible','If possible, my total budget should be under $70.',['soft'],'PASS',valid],
  ['nice to have','Nice to have, my total budget should be under $70.',['soft'],'PASS',valid],
  ['semicolon marker','Ideally; my total budget should be under $70.',['soft'],'PASS',valid],
  ['postfix','My total budget should be under $70, if possible.',['soft'],'PASS',valid],
  ['hard following comma','Ideally, my total budget should be under $70, my total budget is under $80.',['soft','hard'],'FAIL',valid],
  ['hard following semicolon','Ideally, my total budget should be under $70; my total budget is under $90.',['soft','hard'],'PASS',valid],
  ['hard before optional','My total budget is under $80, ideally, my total budget should be under $70.',['hard','soft'],'FAIL',valid],
  ['quantity remains mandatory','Ideally, my total budget should be under $70.',['soft'],'FAIL',valid.replace('2 RunFit','1 RunFit').replace('$80','$60')],
  ['suitability remains mandatory','Ideally, my total budget should be under $70.',['soft'],'FAIL',valid.replace('specifically designed for running','not suitable for running')],
];
for (const [name,budget,types,verdict,output] of cases) for (const offline of [false,true]) test(`soft budget ${name}: ${offline ? 'fallback' : 'API mock'}`,async ({page}) => {
  const input = `${items} ${budget} ${mandatory}`;
  await page.route('**/api/analyze-*',async route => {
    if (offline) {await route.fulfill({status:503,body:'offline'});return;}
    const payload = route.request().url().includes('analyze-prompt') ? prompt(input) : claims(output);
    if ('constraints' in payload) payload.constraints.filter(c => ['cart_total_price','price'].includes(c.attribute)).forEach(c => c.constraintType='hard');
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.goto('/');
  await page.locator('textarea').nth(0).fill(input);
  await page.locator('textarea').nth(1).fill(output);
  await page.getByRole('button',{name:'RUN EVALUATION',exact:true}).click();
  await expect(page.getByRole('button',{name:'RUN EVALUATION',exact:true})).toBeEnabled({timeout:20000});
  await page.getByRole('button',{name:/10\. Report & Export/}).click();
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const json=JSON.parse(await readFile((await (await pending).path())!,'utf8'));
  expect(json.finalVerdict).toBe(verdict);
  const constraints=json.rawUpstreamArtifacts.promptAnalysis.constraints.filter((c:any)=>['cart_total_price','price'].includes(c.attribute));
  expect(constraints.map((c:any)=>c.constraintType)).toEqual(types);
  for (const c of constraints) expect(input).toContain(c.sourceText);
  if (!name.includes('remains mandatory')) {
    expect(json.cartEvaluation.calculatedCartTotal).toBe(80);
    expect(json.rawUpstreamArtifacts.verificationResult.records.filter((v:any)=>v.constraintAttribute==='use_case').map((v:any)=>v.status)).toEqual(['PASS','PASS']);
  }
  if (name === 'Test 8') {
    expect(json.summary.overallSeverity).toBe('NONE');
    expect(json.cartEvaluation.cartHardGateState).toBe('HARD_GATE_PASS');
    const budgetRecord=json.cartEvaluation.verifications.find((v:any)=>v.constraintAttribute==='cart_total_price');
    expect(budgetRecord.constraintType).toBe('soft');
    expect(budgetRecord.status).toBe('FAIL');
    expect(budgetRecord.constraintEvidence).toContain('Ideally,');
  }
  await page.getByRole('button',{name:'Detailed Report',exact:true}).click();
  await expect(page.getByText(/Cart assessment:/).last()).toBeVisible();
  if (verdict === 'PASS') await expect(page.getByText(/optional preference/).first()).toBeVisible();
});
