import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { analyzeUserPromptDeterministically as prompt } from '../../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../../src/services/evaluation/fallbackClaimAnalyzer';
import { describeAssessmentRequirement } from '../../src/services/evaluation/qaAssessmentReport';

async function single(page:Page,input:string,output:string,fallback=false) {
  await page.route('**/api/analyze-*',async route=>{
    if(fallback) {await route.fulfill({status:503,body:'offline'});return;}
    const request=route.request().postDataJSON();
    const payload=route.request().url().includes('analyze-prompt') ? prompt(request.userPrompt) : claims(request.llmOutput);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Generate QA Assessment Report',exact:true})).toHaveCount(0);
  await page.locator('textarea').nth(0).fill(input);await page.locator('textarea').nth(1).fill(output);
  await page.getByRole('button',{name:'RUN EVALUATION',exact:true}).click();
  await expect(page.getByRole('button',{name:'RUN EVALUATION',exact:true})).toBeEnabled({timeout:20000});
  await page.getByRole('button',{name:/10\. Report & Export/}).click();
}
async function download(page:Page) {
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download QA Assessment',exact:true}).click();
  const file=await pending;
  expect(file.suggestedFilename()).toBe('qa-assessment-report.md');
  return readFile((await file.path())!,'utf8');
}
const cases:Array<[string,string,string,string]>=[
  ['PASS','I need a jacket under $100.','I recommend the TrailAir Jacket for $80.','PASS'],
  ['FAIL','I need a jacket under $100. It must not be waterproof or insulated.','I recommend the TrailAir Jacket for $180. It is waterproof and insulated.','FAIL'],
  ['UNKNOWN','I need a waterproof jacket under $100.','I recommend the TrailAir Jacket for $80.','UNKNOWN'],
  ['CONFLICT','I need a waterproof jacket under $100.','I recommend the TrailAir Jacket for $80. It is waterproof. It is not waterproof.','CONFLICT (UNKNOWN)'],
  ['optional','I need a jacket. Ideally, its price should be under $70.','I recommend the TrailAir Jacket for $80.','FAIL'],
];
for(const [name,input,output,status] of cases) for(const fallback of [false,true]) test(`QA report ${name}: ${fallback?'fallback':'mock API'}`,async({page})=>{
  await single(page,input,output,fallback);
  const generate=page.getByRole('button',{name:'Generate QA Assessment Report',exact:true});
  await expect(generate).toBeVisible();await expect(generate).toHaveClass(/bg-red-700/);
  const controls=await page.getByRole('button',{name:'Export JSON',exact:true}).boundingBox();
  const action=await generate.boundingBox();expect(action!.y).toBeGreaterThan(controls!.y+controls!.height);
  await generate.focus();await page.keyboard.press('Enter');
  await expect(generate).toHaveAttribute('aria-expanded','true');
  const editor=page.getByRole('textbox',{name:'QA assessment report text',exact:true});
  await expect(editor).toBeVisible();
  const report=await editor.inputValue();
  expect(report).toContain(`Verdict: ${status}.`);expect(report).toContain(input);expect(report).toContain(output);
  expect(report).toContain('Review status: Awaiting review');
  expect(report.replace(/(`{3,})\n[\s\S]*?\n\1/g,'')).not.toMatch(/\b(?:AI|LLM|JSON|algorithms?|automation|models?|pipelines?|C\d+)\b/i);
  if(name==='optional') {expect(report).toContain('Optional improvement');expect(report).toContain('Supplied response: PASS');}
  expect(await download(page)).toBe(report);
  // The existing structured export remains available and has its established verdict.
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const json=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
  expect(json.finalVerdict).toBe(name==='optional'||name==='PASS'?'PASS':name==='FAIL'?'FAIL':'INDETERMINATE');
});

test('QA report edits copy and download exactly; regeneration restores original findings',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await single(page,'I need a jacket under $100.','I recommend the TrailAir Jacket for $80.');
  const generate=page.getByRole('button',{name:'Generate QA Assessment Report',exact:true});await generate.click();
  const editor=page.getByRole('textbox',{name:'QA assessment report text',exact:true});const original=await editor.inputValue();
  const edited=original.replace('Reviewer name: ____________________','Reviewer name: Demo Reviewer');await editor.fill(edited);
  await page.getByRole('button',{name:'Copy QA Assessment',exact:true}).click();
  await expect(page.getByText('Assessment copied.',{exact:true})).toBeVisible();
  // Windows clipboard reads normalize LF to CRLF; all report content must match.
  expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(edited);
  expect(await download(page)).toBe(edited);
  await generate.click();await expect(editor).toHaveValue(original);
  await page.getByRole('button',{name:'Close QA Assessment',exact:true}).click();await expect(editor).toHaveCount(0);
});

for(const inputIndex of [0,1]) test(`QA report invalidated when single input ${inputIndex} changes`,async({page})=>{
  await single(page,'I need a jacket under $100.','I recommend the TrailAir Jacket for $80.');
  const generate=page.getByRole('button',{name:'Generate QA Assessment Report',exact:true});await generate.click();
  await page.locator('textarea').nth(inputIndex).fill(inputIndex===0?'I need a jacket under $50.':'I recommend the TrailAir Jacket for $180.');
  await expect(page.getByRole('textbox',{name:'QA assessment report text',exact:true})).toHaveCount(0);await expect(generate).toBeDisabled();
  await expect(page.getByRole('button',{name:'Download QA Assessment',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'RUN EVALUATION',exact:true}).click();
  await expect(page.getByRole('button',{name:'RUN EVALUATION',exact:true})).toBeEnabled({timeout:20000});
  await expect(generate).toBeEnabled();
  await generate.click();
  const editor=page.getByRole('textbox',{name:'QA assessment report text',exact:true});
  await expect(editor).toBeVisible();expect(await editor.inputValue()).toContain('Supplied response: FAIL');
});

async function conversation(page:Page) {
  await page.route('**/api/analyze-*',()=>{throw new Error('Conversation must remain offline.');});
  await page.goto('/');await page.getByRole('button',{name:'Conversation',exact:true}).click();
  const turns=[['2 shirts and 1 pair of shorts; total budget under $85','I recommend 2 shirts at $25 each and 1 pair of shorts at $40 each. Total: $90.'],['My total budget is under $100.','I recommend 2 shirts at $25 each and 1 pair of shorts at $40 each. Total: $90.'],['Yes.','']];
  for(const [i,[input,output]] of turns.entries()) {
    if(i) await page.getByRole('button',{name:'Add turn',exact:true}).click();
    await page.getByRole('textbox',{name:`User turn ${i+1}`,exact:true}).fill(input);await page.getByRole('textbox',{name:`Assistant turn ${i+1}`,exact:true}).fill(output);
  }
  await page.getByRole('button',{name:'Evaluate conversation',exact:true}).click();await expect(page.getByTestId('conversation-verdict')).toHaveText('Turn T3: INDETERMINATE');
  await page.getByRole('button',{name:/10\. Report & Export/}).click();
}
test('QA conversation report includes all assessed turns and active revisions, even from an earlier selected tab',async({page})=>{
  await conversation(page);await page.getByRole('button',{name:'Generate QA Assessment Report',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'QA assessment report text',exact:true});const report=await editor.inputValue();
  for(const outcome of ['Turn T1: FAIL','Turn T2: PASS','Turn T3: INDETERMINATE','Origin: turn T2','Requirement revision audit trail','covers 3 assessed responses']) expect(report).toContain(outcome);
  expect(await download(page)).toBe(report);
  await page.getByRole('combobox',{name:'Evaluated turn'}).selectOption('0');await expect(editor).toHaveCount(0);
  await page.getByRole('button',{name:'Generate QA Assessment Report',exact:true}).click();await expect(editor).toHaveValue(report);
  await page.getByRole('textbox',{name:'User turn 2',exact:true}).fill('My total budget is under $50.');await expect(editor).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Generate QA Assessment Report',exact:true})).toHaveCount(0);
});

test('QA conversation report invalidates on turn addition and clearing',async({page})=>{
  await conversation(page);await page.getByRole('button',{name:'Generate QA Assessment Report',exact:true}).click();
  await page.getByRole('button',{name:'Add turn',exact:true}).click();await expect(page.getByRole('textbox',{name:'QA assessment report text',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Download QA Assessment',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Clear conversation',exact:true}).click();await expect(page.getByRole('textbox',{name:'User turn 1',exact:true})).toHaveValue('');
});

const reviewInput='I need 2 running shirts and 1 pair of running shorts. My total budget is under $85. All items must be suitable for running.';
const reviewOutput='I recommend 2 RunFit running shirts at $20 each and 1 pair of RunFit running shorts at $40. Both products are specifically designed for running. The total is $60.';
for(const offline of [false,true]) test(`QA review cart findings are unique and quantity is not conflicted: ${offline?'fallback':'mock API'}`,async({page})=>{
  await single(page,reviewInput,reviewOutput,offline);
  await page.getByRole('button',{name:'Generate QA Assessment Report',exact:true}).click();
  const report=await page.getByRole('textbox',{name:'QA assessment report text',exact:true}).inputValue();
  const section=report.split('## Findings by Requirement')[1].split('## Overall Outcome & Severity')[0];
  const blocks=section.split(/\n\n#### Requirement \d+: /).slice(1);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const json=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
  const artifacts=json.rawUpstreamArtifacts;
  expect(blocks).toHaveLength(artifacts.verificationResult.records.length);
  for(const v of artifacts.verificationResult.records) {
    const c=artifacts.promptAnalysis.constraints.find((c:any)=>c.id===v.constraintId);
    const matches=blocks.filter(b=>b.startsWith(`${v.productName}\n`)&&b.includes(`Expected: ${describeAssessmentRequirement(c)}`));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toContain(`Verdict: ${v.conflictDetected?'CONFLICT (UNKNOWN)':v.status}.`);
    if(c.attribute==='quantity') {expect(matches[0]).toContain('Verdict: PASS.');expect(matches[0]).not.toContain('CONFLICT');}
  }
  expect((section.match(/Verdict: CONFLICT \(UNKNOWN\)/g)??[])).toHaveLength(1);
  expect((report.split('## Corrective Recommendations')[1].split('## Limitations')[0].match(/Mandatory priority/g)??[])).toHaveLength(1);
  expect(await download(page)).toBe(report);
});

test('QA review conversation cart requirements are not repeated in each turn',async({page})=>{
  await page.route('**/api/analyze-*',()=>{throw new Error('Conversation must remain offline.');});
  await page.goto('/');await page.getByRole('button',{name:'Conversation',exact:true}).click();
  await page.getByRole('textbox',{name:'User turn 1',exact:true}).fill(reviewInput);
  await page.getByRole('textbox',{name:'Assistant turn 1',exact:true}).fill(reviewOutput);
  await page.getByRole('button',{name:'Add turn',exact:true}).click();
  await page.getByRole('textbox',{name:'User turn 2',exact:true}).fill('My total budget is under $100.');
  await page.getByRole('textbox',{name:'Assistant turn 2',exact:true}).fill(reviewOutput.replace('$60','$80'));
  await page.getByRole('button',{name:'Evaluate conversation',exact:true}).click();await expect(page.getByTestId('conversation-verdict')).toHaveText('Turn T2: PASS');
  await page.getByRole('button',{name:/10\. Report & Export/}).click();await page.getByRole('button',{name:'Generate QA Assessment Report',exact:true}).click();
  const report=await page.getByRole('textbox',{name:'QA assessment report text',exact:true}).inputValue();
  const section=report.split('## Findings by Requirement')[1].split('## Overall Outcome & Severity')[0];
  for(const turn of ['T1','T2']) {
    const turnSection=section.split(`### Turn ${turn}`)[1].split('### Turn ')[0];
    expect((turnSection.match(/#### Requirement /g)??[])).toHaveLength(6);
    expect((turnSection.match(/Expected: Requested quantity /g)??[])).toHaveLength(2);
    expect((turnSection.match(/Verdict: CONFLICT \(UNKNOWN\)/g)??[])).toHaveLength(turn==='T1'?1:0);
  }
  expect(report).toContain('Turn T1: INDETERMINATE');expect(report).toContain('Turn T2: PASS');
  expect(await download(page)).toBe(report);
});
