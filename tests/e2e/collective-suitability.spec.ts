import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { analyzeUserPromptDeterministically as prompt } from '../../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../../src/services/evaluation/fallbackClaimAnalyzer';

const request = 'I need 2 running shirts at $25 each and 1 pair of running shorts at $40. My total budget is under $85. All items must be suitable for running.';
const items = 'I recommend 2 RunFit running shirts at $25 each and 1 pair of RunFit running shorts at $40.';
const cases: Array<[string,string,string[],string,number]> = [
  ['manual blocker', 'All items are specifically designed for running.', ['PASS','PASS'], 'FAIL',85],
  ['valid collective', 'All items are specifically designed for running.', ['PASS','PASS'], 'PASS',100],
  ['negative collective', 'All items are not suitable for running.', ['FAIL','FAIL'], 'FAIL',100],
  ['shirt evidence isolation', 'RunFit running shirts are suitable for running.', ['PASS','UNKNOWN'], 'INDETERMINATE',100],
  ['shorts evidence isolation', 'RunFit running shorts are suitable for running.', ['UNKNOWN','PASS'], 'INDETERMINATE',100],
  ['conflict', 'All items are suitable for running. RunFit running shirts are not suitable for running.', ['UNKNOWN','PASS'], 'INDETERMINATE',100],
  ['negative collective conflict', 'All items are not suitable for running. RunFit running shorts are suitable for running.', ['FAIL','UNKNOWN'], 'FAIL',100],
  ['same-clause conflict', 'All items are suitable for running and not suitable for running.', ['UNKNOWN','UNKNOWN'], 'INDETERMINATE',100],
  ['other activity is independent', 'All items are suitable for running and not suitable for hiking.', ['PASS','PASS'], 'PASS',100],
];
for (const [name, statement, statuses, verdict, budget] of cases) for (const fallback of [false,true]) test(`collective ${name}: ${fallback ? 'offline fallback' : 'mock API'}`, async ({page}) => {
  const input = request.replace('$85', `$${budget}`);
  const output = `${items} ${statement} The total is $90.`;
  await page.route('**/api/analyze-*', async route => {
    if (fallback) { await route.fulfill({status:503, body:'offline'}); return; }
    const payload = route.request().url().includes('analyze-prompt') ? prompt(input) : claims(output);
    // Emulate incorrect legacy API attribution: all activity evidence assigned
    // only to the last product. Raw evidence must govern the client correction.
    if ('products' in payload) payload.claims.filter(c => c.attribute === 'use_case').forEach(c => { c.productId = 'P2'; c.productName = payload.products[1].name; });
    await route.fulfill({status:200, contentType:'application/json', body:JSON.stringify(payload)});
  });
  await page.goto('/');
  await page.locator('textarea').nth(0).fill(input);
  await page.locator('textarea').nth(1).fill(output);
  await page.getByRole('button', {name:'RUN EVALUATION', exact:true}).click();
  await expect(page.getByRole('button', {name:'RUN EVALUATION', exact:true})).toBeEnabled({timeout:20000});
  await page.getByRole('button', {name:/10\. Report & Export/}).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', {name:'Export JSON', exact:true}).click();
  const json = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  expect(json.finalVerdict).toBe(verdict);
  expect(json.cartEvaluation.calculatedCartTotal).toBe(90);
  const records = json.rawUpstreamArtifacts.verificationResult.records.filter((v:any) => v.constraintAttribute === 'use_case');
  expect(records.map((v:any) => v.status)).toEqual(statuses);
  const activityClaims = json.rawUpstreamArtifacts.claimAnalysis.claims.filter((c:any) => c.attribute === 'use_case');
  for (const c of activityClaims) expect(output).toContain(c.sourceText);
  if (name === 'manual blocker') {
    expect(json.summary.overallSeverity).toBe('HIGH');
    expect(new Set(activityClaims.map((c:any) => c.productId))).toEqual(new Set(['P1','P2']));
    for (const v of records) expect(v.claimEvidence.join(' ')).toContain('All items');
  }
  if (name.includes('conflict')) for (const v of records.filter((v:any) => v.status === 'UNKNOWN')) expect(v.claimEvidence).toHaveLength(2);
  await page.getByRole('button', {name:'Detailed Report', exact:true}).click();
  await expect(page.getByText(/Cart assessment:/).last()).toBeVisible();
});
