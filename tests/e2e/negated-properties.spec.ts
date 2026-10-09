import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { analyzeUserPromptDeterministically as prompt } from '../../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../../src/services/evaluation/fallbackClaimAnalyzer';

const original = 'I need a lightweight, breathable jacket for summer trail running under $100. It must not be waterproof or insulated.';
const cases: Array<[string,string,string,string[],string]> = [
  ['manual blocker', original, 'I recommend the AlpineShield Heavy Winter Parka for $180. It is waterproof, heavily insulated, and designed for freezing temperatures.', ['FAIL','FAIL'],'FAIL'],
  ['must not coordinated', 'I need a jacket under $100. It must not be waterproof or insulated.', 'I recommend the TrailAir Jacket for $80. It is waterproof and insulated.', ['FAIL','FAIL'],'FAIL'],
  ['neither nor', 'I need a jacket under $100. It must be neither waterproof nor insulated.', 'I recommend the TrailAir Jacket for $80. It is waterproof and insulated.', ['FAIL','FAIL'],'FAIL'],
  ['no coordinated', 'I need a jacket under $100. No waterproof or insulated features.', 'I recommend the TrailAir Jacket for $80. It is waterproof and insulated.', ['FAIL','FAIL'],'FAIL'],
  ['punctuation', 'I need a jacket under $100. It must not be waterproof, or insulated.', 'I recommend the TrailAir Jacket for $80. It is waterproof and insulated.', ['FAIL','FAIL'],'FAIL'],
  ['explicit absence', 'I need a jacket under $100. It must not be waterproof or insulated.', 'I recommend the TrailAir Jacket for $80. It is neither waterproof nor insulated.', ['PASS','PASS'],'PASS'],
  ['missing evidence', 'I need a jacket under $100. It must not be waterproof or insulated.', 'I recommend the TrailAir Jacket for $80. It is blue.', ['UNKNOWN','UNKNOWN'],'INDETERMINATE'],
  ['conflicting insulation', 'I need a jacket under $100. It must not be waterproof or insulated.', 'I recommend the TrailAir Jacket for $80. It is not waterproof or insulated. It is heavily insulated.', ['PASS','UNKNOWN'],'INDETERMINATE'],
  ['benign positive', 'I need a jacket under $100. It must be waterproof and insulated.', 'I recommend the TrailAir Jacket for $80. It is waterproof and insulated.', ['PASS','PASS'],'PASS'],
  ['product isolation', 'I need a jacket and a backpack under $100 each. Neither waterproof nor insulated.', 'I recommend the TrailAir Jacket for $40. It is not waterproof or insulated.\nI recommend the Alpine Backpack for $50. It is waterproof and insulated.', ['PASS','PASS','FAIL','FAIL'],'FAIL'],
];
for (const [name,input,output,statuses,verdict] of cases) for (const fallback of [false,true]) test(`Issue 6 ${name}: ${fallback ? 'offline fallback' : 'mock API'}`, async ({page}) => {
  await page.route('**/api/analyze-*', async route => {
    if (fallback) { await route.fulfill({status:503,body:'offline'}); return; }
    const payload = route.request().url().includes('analyze-prompt') ? prompt(input) : claims(output);
    if ('constraints' in payload && name !== 'benign positive') {
      // Simulate successful legacy API extraction losing the coordinated negation.
      payload.constraints.filter(c=>['water_resistance','insulation'].includes(c.attribute)).forEach(c=>{ c.polarity='positive'; c.operator='required'; c.sourceText=String(c.expectedValue); });
      payload.intent.desiredAttributes.push('waterproof','insulated');
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.goto('/');
  await page.locator('textarea').nth(0).fill(input);
  await page.locator('textarea').nth(1).fill(output);
  await page.getByRole('button',{name:'RUN EVALUATION',exact:true}).click();
  await expect(page.getByRole('button',{name:'RUN EVALUATION',exact:true})).toBeEnabled({timeout:20000});
  if (name === 'manual blocker') {
    await page.getByRole('button',{name:/2\. Constraint Matrix/}).click();
    for (const attribute of ['water_resistance','insulation']) {
      const row=page.getByRole('row').filter({has:page.getByText(attribute,{exact:true})});
      await expect(row).toHaveCount(1);
      await expect(row.getByText('hard',{exact:true})).toBeVisible();
      await expect(row.getByText('FAIL',{exact:true})).toBeVisible();
    }
  }
  await page.getByRole('button',{name:/10\. Report & Export/}).click();
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const json=JSON.parse(await readFile((await (await pending).path())!,'utf8'));
  expect(json.finalVerdict).toBe(verdict);
  const artifacts=json.rawUpstreamArtifacts;
  const constraints=artifacts.promptAnalysis.constraints.filter((c:any)=>['water_resistance','insulation'].includes(c.attribute));
  expect(constraints).toHaveLength(2);
  expect(constraints.map((c:any)=>c.polarity)).toEqual(name==='benign positive' ? ['positive','positive'] : ['negative','negative']);
  expect(constraints.every((c:any)=>c.constraintType==='hard')).toBe(true);
  const records=artifacts.verificationResult.records.filter((v:any)=>['water_resistance','insulation'].includes(v.constraintAttribute));
  expect(records.map((v:any)=>v.status)).toEqual(statuses);
  for (const v of records) for (const evidence of v.claimEvidence) expect(output).toContain(evidence);
  if (name==='manual blocker') {
    expect(artifacts.verificationResult.productSummaries.P1.negativeConstraintsFailed).toBe(2);
    expect(json.summary.overallSeverity).toBe('HIGH');
  }
  if (name==='conflicting insulation') expect(records[1].conflictDetected).toBe(true);
  await page.getByRole('button',{name:'Detailed Report',exact:true}).click();
  await expect(page.getByText(input,{exact:true}).last()).toBeVisible();
});
