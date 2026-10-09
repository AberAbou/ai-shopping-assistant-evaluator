import { test,expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const input='I need 2 running shirts and 1 pair of running shorts. My total budget is under $85. All items must be suitable for running.';
const output='I recommend 2 RunFit running shirts at $20 each and 1 pair of RunFit running shorts at $40. Both products are specifically designed for running. The total is $80.';
async function fill(page:Page,turns:Array<[string,string]>) {
  await page.route('**/api/analyze-*',()=>{throw new Error('Conversation mode must not invoke model APIs');});
  await page.goto('/');await page.getByRole('button',{name:'Conversation',exact:true}).click();
  for(let i=0;i<turns.length;i++){
    if(i) await page.getByRole('button',{name:'Add turn',exact:true}).click();
    await page.getByRole('textbox',{name:`User turn ${i+1}`,exact:true}).fill(turns[i][0]);
    await page.getByRole('textbox',{name:`Assistant turn ${i+1}`,exact:true}).fill(turns[i][1]);
  }
  await page.getByRole('button',{name:'Evaluate conversation',exact:true}).click();
  await expect(page.getByTestId('conversation-verdict')).toBeVisible();
}
for(const [name,request,response,verdict] of [
  ['budget revision','My total budget is under $100.',output.replace('$20','$25').replace('$80','$90'),'PASS'],
  ['optional preference','Ideally, my total budget should be under $70.',output,'PASS'],
  ['quantity revision','I need 3 running shirts.',output,'FAIL'],
  ['missing current prices','Yes.','I recommend 2 RunFit running shirts and 1 pair of RunFit running shorts. Both products are specifically designed for running.','INDETERMINATE'],
  ['empty current response','Yes.','','INDETERMINATE'],
  ['removal','Remove the shorts.','I recommend 2 RunFit running shirts at $20 each. Suitable for running. The total is $40.','PASS'],
  ['replacement','Replace the shorts with 1 pair of socks.','I recommend 2 RunFit running shirts at $20 each and 1 pair of Swift running socks at $10. Both products are specifically designed for running. The total is $50.','PASS'],
  ['unselected candidates','Yes.',`Option A: ${output}\nOption B: ${output}`,'INDETERMINATE'],
  ['selected candidate','Choose option A.',`Option A: ${output}\nOption B: ${output.replace('$20','$30').replace('$80','$100')}`,'PASS'],
  ['ambiguous update retains hard failure','Make it 3.',output.replace('$20','$30').replace('$80','$100'),'FAIL'],
  ['mixed cart and item budgets','My total budget is under $100. Shirts must be under $15 each.',output,'FAIL'],
] as const) test(`14C.3 ${name}`,async({page})=>{
  await fill(page,[[input,output],[request,response]]);await expect(page.getByTestId('conversation-verdict')).toHaveText(`Turn T2: ${verdict}`);
  await page.getByRole('combobox',{name:'Evaluated turn'}).selectOption('0');await expect(page.getByTestId('conversation-verdict')).toHaveText('Turn T1: PASS');
});
test('14C.3 ambiguous update and explicit clarification',async({page})=>{
  await fill(page,[[input,output],['Make it 3.',output],['I meant 3 running shirts.',output.replace('2 RunFit','3 RunFit').replace('$20','$10').replace('$80','$70')]]);
  await expect(page.getByTestId('conversation-verdict')).toHaveText('Turn T3: PASS');
  await page.getByRole('combobox',{name:'Evaluated turn'}).selectOption('1');await expect(page.getByTestId('conversation-verdict')).toHaveText('Turn T2: INDETERMINATE');
});
test('14C.3 JSON export contains transcript and per-turn evidence; edits clear results',async({page})=>{
  await fill(page,[[input,output],['My total budget is under $100.',output]]);
  await page.getByRole('button',{name:/10\. Report & Export/}).click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const json=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
  expect(json.inputs.conversation.responsePolicy).toBe('complete_snapshot');expect(json.inputs.conversation.turns).toHaveLength(2);
  expect(json.rawUpstreamArtifacts.promptAnalysis.constraints.find((c:any)=>c.attribute==='cart_total_price').sourceTurnId).toBe('T2');
  expect(json.rawUpstreamArtifacts.claimAnalysis.claims.every((c:any)=>c.sourceTurnId==='T2')).toBe(true);
  await page.getByRole('textbox',{name:'User turn 2',exact:true}).fill('My total budget is under $60.');await expect(page.getByTestId('conversation-verdict')).toHaveCount(0);
  await page.getByRole('button',{name:'Evaluate conversation',exact:true}).click();await expect(page.getByTestId('conversation-verdict')).toHaveText('Turn T2: FAIL');
});
