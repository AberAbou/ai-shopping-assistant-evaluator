import { test,expect,type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { issue11Turns } from '../fixtures/issue11Conversation';

async function evaluate(page:Page,turns=issue11Turns) {
  await page.route('**/api/analyze-*',()=>{throw new Error('Issue 11 conversation must remain offline.');});
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as any).plainCopy=text;}}}));
  await page.goto('/');await page.getByRole('button',{name:'Conversation',exact:true}).click();
  for(const [i,turn] of turns.entries()) {
    if(i) await page.getByRole('button',{name:'Add turn',exact:true}).click();
    await page.getByRole('textbox',{name:`User turn ${i+1}`,exact:true}).fill(turn.userPrompt);
    await page.getByRole('textbox',{name:`Assistant turn ${i+1}`,exact:true}).fill(turn.llmOutput);
  }
  await page.getByRole('button',{name:'Evaluate conversation',exact:true}).click();
  await expect(page.getByTestId('conversation-verdict')).toBeVisible();
}
async function exported(page:Page) {
  if(!await page.getByRole('button',{name:'Export JSON',exact:true}).isVisible()) await page.getByRole('button',{name:/10\. Report & Export/}).click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  return JSON.parse(await readFile((await(await pending).path())!,'utf8'));
}

test('Issue 11: exact four-turn verdicts, constraints, prices, provenance and copied assessment',async({page})=>{
  await evaluate(page);
  const expected=['PASS','FAIL','PASS','INDETERMINATE'];
  for(const [i,status] of expected.entries()) {
    await page.getByRole('combobox',{name:'Evaluated turn'}).selectOption(String(i));
    await expect(page.getByTestId('conversation-verdict')).toHaveText(`Turn T${i+1}: ${status}`);
    const json=await exported(page);const a=json.rawUpstreamArtifacts;
    expect(json.finalVerdict).toBe(status);
    expect(json.cartEvaluation.calculatedCartTotal).toBe(i?100:80);expect(json.cartEvaluation.statedCartTotal).toBe(i===3?90:i?100:80);
    expect(json.inputs.conversation.unresolved).toHaveLength(0);
    expect(a.promptAnalysis.constraints.filter((c:any)=>c.attribute==='quantity').sort((a:any,b:any)=>a.targetProductCategory.localeCompare(b.targetProductCategory)).map((c:any)=>[c.targetProductCategory,c.expectedValue,c.sourceTurnId])).toEqual([['shirt',i?3:2,i?'T2':'T1'],['shorts',1,'T1']]);
    expect(a.promptAnalysis.constraints.filter((c:any)=>c.attribute==='cart_total_price').map((c:any)=>[c.operator,c.expectedValue,c.sourceTurnId])).toEqual([['<',i<2?100:120,i<2?'T1':'T3']]);
    expect(a.promptAnalysis.constraints.filter((c:any)=>c.attribute==='use_case').map((c:any)=>[c.sourceTurnId,c.targetProductCategory])).toEqual([['T1',null]]);
    expect(a.promptAnalysis.constraints.find((c:any)=>c.attribute==='cart_items').sourceTurnId).toBe(i?'T2':'T1');
    expect(a.claimAnalysis.products.map((p:any)=>[p.category,p.parsedQuantity,p.unitPrice.amount,p.lineTotal.amount])).toEqual([['shirt',i?3:2,20,i?60:40],['shorts',1,40,40]]);
    expect(a.claimAnalysis.claims.every((c:any)=>c.sourceTurnId===`T${i+1}`)).toBe(true);
    expect(a.verificationResult.records.filter((v:any)=>v.status!=='PASS').map((v:any)=>[v.constraintAttribute,v.status,!!v.conflictDetected])).toEqual(i===1?[['cart_total_price','FAIL',false]]:i===3?[['cart_total_price','UNKNOWN',true]]:[]);
  }
  await page.getByRole('button',{name:'Copy Plain-English Assessment',exact:true}).click();
  const text=await page.getByRole('textbox',{name:'Plain-English assessment text',exact:true}).inputValue();
  expect(await page.evaluate(()=>(window as any).plainCopy)).toBe(text);
  for(const [i,turn] of issue11Turns.entries()) {
    const section=text.split(`For turn ${i+1},`)[1].split('For turn ')[0];
    expect(section).toContain(`“${turn.userPrompt}”`);expect(section).toContain(`“${turn.llmOutput}”`);
    expect(section).toContain(`Overall, turn ${i+1} ${i===1?'fails':i===3?'cannot be confirmed as meeting':'meets'} the mandatory requirements`);
  }
  expect(text.split('For turn 4,')[1]).toContain('calculated purchase total is $100, and the stated total is $90');
  expect((text.match(/shopper’s requirement revision at this point/g)??[])).toHaveLength(2);
  expect(text.replace(/“[\s\S]*?”/g,'')).not.toMatch(/[#*`|_]/);
  await page.getByRole('button',{name:'Generate QA Assessment Report',exact:true}).click();
  const qa=await page.getByRole('textbox',{name:'QA assessment report text',exact:true}).inputValue();
  for(const [i,status] of expected.entries()) expect(qa).toContain(`Turn T${i+1}: ${status}`);
  const audit=qa.split('### Requirement revision audit trail')[1].split('## Acceptance Criteria')[0];
  for(const turn of issue11Turns.slice(0,3)) expect(audit.split(turn.userPrompt).length-1).toBe(1);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download QA Assessment',exact:true}).click();
  expect(await readFile((await(await pending).path())!,'utf8')).toBe(qa);
});

for(const [prefix,budget] of [['The final cart includes','strictly under $120'],['The final shopping cart consists of','at most $100']]) test(`Issue 11: four-turn wording variation ${prefix}, ${budget}`,async({page})=>{
  const turns=issue11Turns.map(t=>({...t}));
  turns[1].userPrompt='Set the quantity of running shirts to three. Keep the shorts and my original budget unchanged.';
  turns[2].userPrompt=`My total budget is now ${budget}. Keep the same items and quantities.`;
  turns[3].llmOutput=turns[3].llmOutput.replace('Your final cart contains',prefix);
  await evaluate(page,turns);
  for(const [i,status] of ['PASS','FAIL','PASS','INDETERMINATE'].entries()) {
    await page.getByRole('combobox',{name:'Evaluated turn'}).selectOption(String(i));await expect(page.getByTestId('conversation-verdict')).toHaveText(`Turn T${i+1}: ${status}`);
  }
  const json=await exported(page);expect(json.cartEvaluation.calculatedCartTotal).toBe(100);
  expect(json.rawUpstreamArtifacts.claimAnalysis.products.map((p:any)=>p.parsedQuantity)).toEqual([3,1]);
  expect(json.rawUpstreamArtifacts.promptAnalysis.constraints.find((c:any)=>c.attribute==='cart_total_price').operator).toBe(budget.startsWith('at most')?'<=':'<');
});

test('Issue 11: final confirmation cannot reuse earlier unit prices',async({page})=>{
  const turns=issue11Turns.map(t=>({...t}));turns[3].llmOutput='Your final cart contains 3 RunFit running shirts and 1 pair of RunFit running shorts. All items are designed for running.';
  await evaluate(page,turns);await expect(page.getByTestId('conversation-verdict')).toHaveText('Turn T4: INDETERMINATE');
  const json=await exported(page);expect(json.cartEvaluation.calculatedCartTotal).toBeNull();
  expect(json.rawUpstreamArtifacts.claimAnalysis.products).toHaveLength(2);
  expect(json.rawUpstreamArtifacts.claimAnalysis.products.every((p:any)=>p.unitPrice==null)).toBe(true);
  expect(json.inputs.conversation.unresolved).toHaveLength(0);
});
