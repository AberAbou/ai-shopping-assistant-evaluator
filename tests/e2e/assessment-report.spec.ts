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

for(const [name,input,output] of cases) test(`Plain-English one-click copy preserves ${name} findings`,async({page})=>{
  await page.addInitScript(()=>{
    (window as any).plainCopies=[];
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).plainCopies.push(text);}}});
  });
  await single(page,input,output,name==='UNKNOWN');
  await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Plain-English assessment text',exact:true});
  const text=await editor.inputValue();
  expect(await page.evaluate(()=>(window as any).plainCopies)).toEqual([text]);
  await expect(page.getByText('Plain-English assessment copied.',{exact:true})).toBeVisible();
  expect(text).toContain(`“${input}”`);expect(text).toContain(`“${output}”`);
  const authored=text.replace(/“[\s\S]*?”/g,'');
  expect(authored).not.toMatch(/[#*`|_]|^\s*(?:[-+]|\d+\.)\s/m);
  expect(authored).not.toMatch(/\b(?:AI|LLM|JSON|algorithms?|automation|models?|pipelines?|C\d+)\b/i);
  expect(text).toContain('No independent catalog checks, physical tests, or human verification were performed.');
  if(name==='FAIL') expect(text).toContain('fails the mandatory requirements');
  if(name==='UNKNOWN'||name==='CONFLICT') expect(text).toContain('cannot be confirmed as meeting');
  if(name==='optional') {expect(text).toContain('meets the mandatory requirements');expect(text).toContain('do not by themselves establish a mandatory failure');}
});

test('Plain-English edited text copies exactly as text/plain; Markdown edits stay separate and explicit',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await single(page,'I need a jacket under $100.','I recommend the TrailAir Jacket for $80.');
  await page.getByRole('button',{name:'Generate QA Assessment Report',exact:true}).click();
  const plain=page.getByRole('textbox',{name:'Plain-English assessment text',exact:true});
  const original=await plain.inputValue();
  const edited=original.replace('Reviewer name:                 ','Reviewer name: Alex. ')+ '\n\nThe reviewer requests a final price confirmation.';
  await plain.fill(edited);
  const markdown=page.getByRole('textbox',{name:'QA assessment report text',exact:true});
  const md=(await markdown.inputValue())+'\n\nMarkdown-only reviewer note.';await markdown.fill(md);
  await expect(page.getByText(/Markdown report edits apply only to its existing copy and download controls/)).toBeVisible();
  await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();
  expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(edited);
  expect(await page.evaluate(async()=> (await navigator.clipboard.read()).flatMap(item=>item.types))).toEqual(['text/plain']);
  expect(await download(page)).toBe(md);
  await page.getByRole('button',{name:'Generate QA Assessment Report',exact:true}).click();await expect(plain).toHaveValue(original);
});

for(const success of [true,false]) test(`Plain-English clipboard fallback ${success?'copies':'offers selected editable text'}`,async({page})=>{
  await page.addInitScript((success)=>{
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Denied');}}});
    document.execCommand=(command:string)=>{(window as any).fallbackCommand=command;(window as any).fallbackText=(document.activeElement as HTMLTextAreaElement).value;return success;};
  },success);
  await single(page,'I need a jacket under $100.','I recommend the TrailAir Jacket for $80.');
  await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Plain-English assessment text',exact:true});const text=await editor.inputValue();
  expect(await page.evaluate(()=>(window as any).fallbackCommand)).toBe('copy');
  expect(await page.evaluate(()=>(window as any).fallbackText)).toBe(text);
  expect(await page.locator('textarea[aria-label="Clipboard fallback"]').count()).toBe(0);
  if(success) await expect(page.getByText('Plain-English assessment copied.',{exact:true})).toBeVisible();
  else {
    await expect(page.getByText('Copy is unavailable. Select and copy the plain-English assessment text below.',{exact:true})).toBeVisible();
    await expect(editor).toBeFocused();
    expect(await editor.evaluate((el:HTMLTextAreaElement)=>el.selectionEnd-el.selectionStart)).toBe(text.length);
  }
});

test('Plain-English conversation copy preserves chronology and reviewer edits; input edits invalidate it',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).plainCopy=text;}}}));
  await conversation(page);await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Plain-English assessment text',exact:true});const text=await editor.inputValue();
  expect(text.indexOf('For turn 1')).toBeLessThan(text.indexOf('For turn 2'));expect(text.indexOf('For turn 2')).toBeLessThan(text.indexOf('For turn 3'));
  expect(text).toContain('Overall, turn 1 fails the mandatory requirements');
  expect(text).toContain('Overall, turn 2 meets the mandatory requirements');
  expect(text).toContain('Overall, turn 3 cannot be confirmed');
  expect(text).toContain('requirement revision at this point');expect(text).toContain('originated in turn 2');
  const edited=text+'\n\nReviewer comments: Please clarify the third request.';await editor.fill(edited);
  await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();expect(await page.evaluate(()=>(window as any).plainCopy)).toBe(edited);
  await page.getByRole('combobox',{name:'Evaluated turn'}).selectOption('0');await expect(editor).toHaveCount(0);
  await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();await expect(editor).toHaveValue(text);
  await page.getByRole('textbox',{name:'User turn 2',exact:true}).fill('My total budget is under $50.');await expect(editor).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true})).toHaveCount(0);
});

test('Plain-English single input edits prevent stale copying',async({page})=>{
  await single(page,'I need a jacket under $100.','I recommend the TrailAir Jacket for $80.');
  await page.getByRole('button',{name:'Generate QA Assessment Report',exact:true}).click();
  await page.locator('textarea').nth(0).fill('I need a jacket under $50.');
  await expect(page.getByRole('textbox',{name:'Plain-English assessment text',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true})).toBeDisabled();
});

const editorialInput='I need a lightweight, breathable jacket for summer trail running under $100. It must not be waterproof or insulated.';
const editorialOutput='I recommend the AlpineShield Heavy Winter Parka for $180. It is waterproof, heavily insulated, and designed for freezing temperatures.';
for(const offline of [false,true]) test(`Editorial assessment groups parka failures and unknowns: ${offline?'fallback':'mock API'}`,async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).plainCopy=text;}}}));
  await single(page,editorialInput,editorialOutput,offline);
  await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();
  const text=await page.getByRole('textbox',{name:'Plain-English assessment text',exact:true}).inputValue();
  expect(await page.evaluate(()=>(window as any).plainCopy)).toBe(text);
  const paragraphs=text.split('\n\n');
  const failure=paragraphs.filter(s=>s.startsWith('For AlpineShield')&&s.includes('mandatory requirements are not met'));
  const unknown=paragraphs.filter(s=>s.startsWith('For AlpineShield')&&s.includes('mandatory requirements remain unconfirmed'));
  expect(failure).toHaveLength(1);expect(unknown).toHaveLength(1);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const json=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
  expect(json.finalVerdict).toBe('FAIL');expect(json.summary.overallSeverity).toBe('HIGH');
  const artifacts=json.rawUpstreamArtifacts;
  expect(artifacts.verificationResult.records).toHaveLength(7);
  for(const record of artifacts.verificationResult.records) {
    const c=artifacts.promptAnalysis.constraints.find((c:any)=>c.id===record.constraintId);
    const group=record.status==='FAIL'?failure[0]:unknown[0];
    expect(group).toContain(`“${c.sourceText}”`);
    for(const evidence of record.claimEvidence) expect(group).toContain(`“${evidence}”`);
  }
  expect(unknown[0]).not.toContain('is violated');expect(unknown[0]).not.toContain('is not met');
  const actions=paragraphs.filter(s=>/^(Replace the unsuitable|Revise the recommendation|Before acceptance, confirm)/.test(s));
  expect(actions).toHaveLength(3);
  for(const record of artifacts.verificationResult.records) {
    const c=artifacts.promptAnalysis.constraints.find((c:any)=>c.id===record.constraintId);
    expect(actions.some(s=>s.includes(`“${c.sourceText}”`))).toBe(true);
  }
  expect(text).toContain('Overall, this response fails the mandatory requirements. Severity is high. The recommendation should not be accepted as proposed.');
  expect(text).not.toContain('As a priority');expect(paragraphs.length).toBeLessThanOrEqual(10);
  expect((text.replace(/“[\s\S]*?”/g,'').match(/AlpineShield Heavy Winter Parka/g)??[])).toHaveLength(2);
  expect(text).toContain(`“${editorialInput}”`);expect(text).toContain(`“${editorialOutput}”`);
});

test('Editorial conversation copy retains grouped findings and severity before a corrected response',async({page})=>{
  await page.route('**/api/analyze-*',()=>{throw new Error('Conversation must remain offline.');});
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).plainCopy=text;}}}));
  await page.goto('/');await page.getByRole('button',{name:'Conversation',exact:true}).click();
  await page.getByRole('textbox',{name:'User turn 1',exact:true}).fill(editorialInput);
  await page.getByRole('textbox',{name:'Assistant turn 1',exact:true}).fill(editorialOutput);
  await page.getByRole('button',{name:'Add turn',exact:true}).click();
  await page.getByRole('textbox',{name:'User turn 2',exact:true}).fill('My budget is now under $200, but all other requirements remain.');
  await page.getByRole('textbox',{name:'Assistant turn 2',exact:true}).fill('I recommend TrailAir Jacket for $80. It is lightweight, breathable, not waterproof, uninsulated, and designed for summer trail running.');
  await page.getByRole('button',{name:'Evaluate conversation',exact:true}).click();await expect(page.getByTestId('conversation-verdict')).toHaveText('Turn T2: PASS');
  await page.getByRole('button',{name:/10\. Report & Export/}).click();await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Plain-English assessment text',exact:true});const text=await editor.inputValue();
  const first=text.split('For turn 1,')[1].split('For turn 2,')[0];
  expect(first).toContain('mandatory requirements are not met');expect(first).toContain('mandatory requirements remain unconfirmed');
  expect(first).toContain('Overall, turn 1 fails the mandatory requirements. Severity is high.');
  expect(first.split('\n\n').filter(s=>/^(Replace the unsuitable|Revise the recommendation|Before acceptance, confirm)/.test(s))).toHaveLength(3);
  const later=text.split('For turn 2,')[1];
  expect(later).toContain('Overall, turn 2 meets the mandatory requirements');
  expect(later).toContain('originated in turn 2');expect(later).toContain('originated in turn 1');
  expect(later).not.toContain('AlpineShield');
  expect(await page.evaluate(()=>(window as any).plainCopy)).toBe(text);
  await editor.fill(text+'\n\nReviewer comments: Retain the earlier failure.');
  await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();expect(await page.evaluate(()=>(window as any).plainCopy)).toBe(await editor.inputValue());
});
