import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConversation } from '../src/services/evaluation/conversationEvaluation';
import { evaluate } from './helpers/evaluate';
import { REGRESSION_SCENARIOS } from '../src/fixtures/regressionScenarios';
import { buildExportJsonPayload,buildExportMarkdownReport,buildConciseProfessionalReport,buildDetailedProfessionalReport } from '../src/services/evaluation/reportExportHelper';
const input='I need 2 running shirts and 1 pair of running shorts. My total budget is under $85. All items must be suitable for running.';
const output='I recommend 2 RunFit running shirts at $20 each and 1 pair of RunFit running shorts at $40. Both products are specifically designed for running. The total is $80.';
const turn=(userPrompt:string,llmOutput=output,id='T1')=>({id,userPrompt,llmOutput});
const run=async(user:string,response=output)=> (await evaluateConversation([turn(input),turn(user,response,'T2')])).at(-1)!;
const verdict=(r:Awaited<ReturnType<typeof run>>)=>r.finalEvaluationResult.finalVerdict;
for(const s of REGRESSION_SCENARIOS) test(`single-turn parity ${s.key}`,async()=>{
  const legacy=await evaluate(s.userPrompt,s.llmOutput);
  const [r]=await evaluateConversation([turn(s.userPrompt,s.llmOutput)]);
  assert.equal(verdict(r),legacy.finalEvaluationResult.finalVerdict);
  assert.deepEqual(r.verificationResult!.records.map(v=>v.status),legacy.verificationResult.records.map(v=>v.status));
});
test('complete cart and unchanged follow-up preserve mandatory requirements',async()=>{
  const r=await run('Yes.');assert.equal(verdict(r),'PASS');
  assert.equal(r.promptAnalysis!.constraints.find(c=>c.attribute==='cart_total_price')!.sourceTurnId,'T1');
  assert.ok(r.claimAnalysis!.claims.every(c=>c.sourceTurnId==='T2'));
});
test('explicit budget revision supersedes previous limit',async()=>{
  const r=await run('My total budget is now under $100.',output.replace('$20','$25').replace('$80','$90'));
  assert.equal(verdict(r),'PASS');
  assert.deepEqual(r.promptAnalysis!.constraints.filter(c=>c.attribute==='cart_total_price').map(c=>[c.expectedValue,c.sourceTurnId]),[[100,'T2']]);
});
test('new soft budget does not withdraw mandatory budget',async()=>{
  const r=await run('Ideally, my total budget should be under $70.');assert.equal(verdict(r),'PASS');
  assert.deepEqual(r.promptAnalysis!.constraints.filter(c=>c.attribute==='cart_total_price').map(c=>c.constraintType),['hard','soft']);
});
test('quantity revision preserves other products and uses latest prices',async()=>{
  const r=await run('I need 3 running shirts.',output.replace('2 RunFit','3 RunFit').replace('$20','$10').replace('$80','$70'));
  assert.equal(verdict(r),'PASS');assert.equal(r.finalEvaluationResult.cartEvaluation!.calculatedCartTotal,70);
  const stale=await run('I need 3 running shirts.');assert.equal(verdict(stale),'FAIL');
});
test('invalid revised quantity cannot pass',async()=>{assert.notEqual(verdict(await run('I need 0 running shirts.')),'PASS');});
test('removal updates membership without retaining stale item',async()=>{
  const r=await run('Remove the shorts.','I recommend 2 RunFit running shirts at $20 each. Suitable for running. The total is $40.');assert.equal(verdict(r),'PASS');
  assert.equal(JSON.parse(String(r.promptAnalysis!.constraints.find(c=>c.attribute==='cart_items')!.expectedValue)).length,1);
});
test('replacement does not inherit removed quantity',async()=>{
  const r=await run('Replace the shorts with 1 pair of socks.','I recommend 2 RunFit running shirts at $20 each and 1 pair of Swift running socks at $10. Both products are specifically designed for running. The total is $50.');assert.equal(verdict(r),'PASS');
  assert.ok(!JSON.stringify(r.promptAnalysis!.constraints).includes('"targetProductCategory":"shorts"'));
});
test('missing replacement quantity remains unknown',async()=>{assert.notEqual(verdict(await run('Replace the shorts with socks.')),'PASS');});
test('removal and new budget in same turn both apply',async()=>{
  const r=await run('Remove the shorts. My total budget is under $30.','I recommend 2 RunFit running shirts at $20 each. Suitable for running. The total is $40.');assert.equal(verdict(r),'FAIL');
});
test('ambiguous update requires clarification instead of guessing',async()=>{const r=await run('Make it 3.');assert.equal(verdict(r),'INDETERMINATE');assert.ok(r.inputs.conversation.unresolved.length);});
test('explicit clarification restores unaffected requirements',async()=>{
  const r=(await evaluateConversation([turn(input),turn('Make it 3.',output,'T2'),turn('I meant 3 running shirts.',output.replace('2 RunFit','3 RunFit').replace('$20','$10').replace('$80','$70'),'T3')])).at(-1)!;
  assert.equal(verdict(r),'PASS');assert.equal(r.inputs.conversation.unresolved.length,0);
  assert.equal(r.promptAnalysis!.constraints.find(c=>c.attribute==='cart_total_price')!.sourceTurnId,'T1');
});
test('contradictory counts need explicit correction',async()=>{
  const r=await run('I need 3 shirts and 4 shirts.');assert.notEqual(verdict(r),'PASS');
  const fixed=(await evaluateConversation([turn(input),turn('I need 3 shirts and 4 shirts.',output,'T2'),turn('I meant 2 shirts.',output,'T3')])).at(-1)!;assert.equal(verdict(fixed),'PASS');
});
for(const [name,response] of [['empty',''],['prices missing','I recommend 2 RunFit running shirts and 1 pair of RunFit running shorts. Both products are specifically designed for running.'],['quantity missing',output.replace('2 RunFit','RunFit')]]) test(`latest snapshot ${name}: earlier evidence never fills gaps`,async()=>{assert.equal(verdict(await run('Yes.',response)),'INDETERMINATE');});
test('assistant cannot revise user budget',async()=>{assert.equal(verdict(await run('Yes.',output.replace('$20','$30').replace('$80','$100')+' Your budget is now $110.')),'FAIL');});
test('foreign currency revision remains unknown',async()=>{assert.equal(verdict(await run('My total budget is under 100 EUR.')),'INDETERMINATE');});
test('total disagreement preserves quantity independence',async()=>{const r=await run('Yes.',output.replace('$80','$60'));assert.equal(verdict(r),'INDETERMINATE');assert.ok(r.verificationResult!.records.filter(v=>v.constraintAttribute==='quantity').every(v=>v.status==='PASS'));});
const options=`Option A: ${output}\nOption B: ${output.replace('$20','$30').replace('$80','$100')}`;
test('unselected candidates cannot combine into cart',async()=>{assert.equal(verdict(await run('Yes.',options)),'INDETERMINATE');});
test('explicit candidate selection isolates selected cart',async()=>{assert.equal(verdict(await run('Choose option A.',options)),'PASS');assert.equal(verdict(await run('Choose option B.',options)),'FAIL');});
test('missing selected option remains unknown',async()=>{assert.equal(verdict(await run('Choose option C.',options)),'INDETERMINATE');});
test('reports preserve transcript, active provenance and superseded audit',async()=>{
  const r=await run('My total budget is under $100.');const json=buildExportJsonPayload(r);
  assert.equal(json.metadata.inputContract,'ORDERED_CONVERSATION_TURNS');assert.deepEqual(json.inputs.conversation,r.inputs.conversation);
  for(const report of [buildExportMarkdownReport(r),buildConciseProfessionalReport(r).plainText,buildDetailedProfessionalReport(r).plainText]) {assert.match(report,/CONVERSATION AUDIT/);assert.ok(report.includes(input));assert.ok(report.includes('T2'));assert.ok(report.includes('requirement revision'));}
});
test('product-specific running evidence cannot bleed across turns',async()=>{
  const r=await run('Yes.','I recommend 2 RunFit running shirts at $20 each and 1 pair of Casual shorts at $40. The shirts are suitable for running. The shorts are not suitable for running. The total is $80.');assert.equal(verdict(r),'FAIL');
});
test('unsupported update cannot pass by echoing user text',async()=>{assert.equal(verdict(await run('Change the mystery feature.',output+' Change the mystery feature.')),'INDETERMINATE');});
test('input validation preserves explicit turn ordering and limits',async()=>{
  await assert.rejects(evaluateConversation([]));await assert.rejects(evaluateConversation([turn(input),turn(input)]));await assert.rejects(evaluateConversation([turn('x'.repeat(20001))]));
});
test('cart addition preserves earlier categories and quantities',async()=>{
  const r=await run('Also add 1 pair of socks.',output.replace('. Both',' and 1 pair of Swift running socks at $2. All').replace('$80','$82'));assert.equal(verdict(r),'PASS');
  const requested=JSON.parse(String(r.promptAnalysis!.constraints.find(c=>c.attribute==='cart_items')!.expectedValue));assert.deepEqual(requested.map((i:any)=>[i.category,i.quantity]),[['shirt',2],['shorts',1],['socks',1]]);
});
test('budget range retains minimum and maximum across turns',async()=>{
  const r=(await evaluateConversation([turn(input.replace('under $85','at least $50 and under $85')),turn('Yes.',output.replace('$20','$2').replace('$40','$10').replace('$80','$14'),'T2')])).at(-1)!;assert.equal(verdict(r),'FAIL');
  assert.deepEqual(r.promptAnalysis!.constraints.filter(c=>c.attribute==='cart_total_price').map(c=>c.operator),['>=','<']);
});
test('same-turn competing limits are not silently discarded',async()=>{
  assert.equal(verdict(await run('My total budget must be under $70 and under $90.')),'FAIL');
});
test('unsupported named-product update remains unknown',async()=>{assert.equal(verdict(await run('Make the shirts cheaper.')),'INDETERMINATE');});
test('active intent reflects revised budget and retained activity',async()=>{const r=await run('My total budget is under $100.');assert.equal(r.promptAnalysis!.intent.budget!.maxAmount,100);assert.equal(r.promptAnalysis!.intent.useCaseOrActivity,'running');});
test('explicit exclusion withdrawal is supported without reintroducing exclusion',async()=>{
  const r=(await evaluateConversation([turn(input+' All items must be leather-free.'),turn('Allow leather.',output+' Both products contain leather.','T2')])).at(-1)!;
  assert.equal(verdict(r),'PASS');assert.ok(!r.promptAnalysis!.constraints.some(c=>c.polarity==='negative'&&String(c.expectedValue).includes('leather')));
});
test('a product-specific withdrawal preserves other product exclusions',async()=>{
  const r=(await evaluateConversation([turn(input+' All items must be leather-free.'),turn('Allow leather for the shirts.',output+' Both products contain leather.','T2')])).at(-1)!;assert.equal(verdict(r),'FAIL');
});
test('single-product budget remains scoped when another product is added',async()=>{
  const r=(await evaluateConversation([turn('Recommend a running shirt under $30.','Alpha Running Shirt ($20) is suitable for running.'),turn('Add 1 pair of shorts.','I recommend 1 Alpha running shirt at $20 and 1 pair of Beta running shorts at $40. Both products are specifically designed for running. The total is $60.','T2')])).at(-1)!;
  assert.equal(verdict(r),'PASS');assert.equal(r.promptAnalysis!.constraints.find(c=>c.attribute==='price')!.targetProductCategory,'shirt');
});
test('no active cart items cannot yield a false pass',async()=>{
  const r=(await evaluateConversation([turn('I need 2 shirts. My total budget is under $50.','I recommend 2 Alpha shirts at $20 each. The total is $40.'),turn('Remove the shirts.','There are no recommendations.','T2')])).at(-1)!;assert.notEqual(verdict(r),'PASS');
});
test('a later turn can set both cart and product-level budgets',async()=>{
  const r=await run('My total budget is under $100. Shirts must be under $15 each.');assert.equal(verdict(r),'FAIL');
  assert.ok(r.promptAnalysis!.constraints.some(c=>c.attribute==='cart_total_price'&&c.expectedValue===100));
  assert.ok(r.promptAnalysis!.constraints.some(c=>c.attribute==='price'&&c.expectedValue===15&&c.targetProductCategory==='shirt'));
  assert.equal(r.promptAnalysis!.intent.budget!.maxAmount,100);
});
test('new per-item cap does not mask a cart budget revision',async()=>{
  const r=await run('My total budget is under $100. Each item must be under $50.',output.replace('$20','$25').replace('$80','$90'));assert.equal(verdict(r),'PASS');
  assert.equal(r.promptAnalysis!.constraints.filter(c=>c.attribute==='cart_total_price').length,1);
  assert.equal(r.promptAnalysis!.constraints.find(c=>c.attribute==='cart_total_price')!.expectedValue,100);
});
test('explicit hard-boundary revision retains strict comparison',async()=>{
  assert.equal(verdict(await run('My total budget is under $80.')),'FAIL');assert.equal(verdict(await run('My total budget is at most $80.')),'PASS');
});
test('conflicting latest suitability claims do not reuse earlier positive evidence',async()=>{
  assert.equal(verdict(await run('Yes.',output+' The shorts are not suitable for running.')),'INDETERMINATE');
});
test('duplicate option labels cannot silently select the first candidate',async()=>{
  assert.equal(verdict(await run('Choose option A.',options.replace('Option B:','Option A:'))),'INDETERMINATE');
});
test('an ambiguous update cannot withdraw earlier mandatory budget',async()=>{
  const r=await run('Make it 3.',output.replace('$20','$30').replace('$80','$100'));
  assert.equal(verdict(r),'FAIL');
  assert.equal(r.promptAnalysis!.constraints.find(c=>c.attribute==='cart_total_price')!.expectedValue,85);
});
test('partial and multiple-category removals require clarification',async()=>{
  for(const request of ['Remove 1 shirt.','Replace the blue shirt with 1 pair of socks.','Remove the shirts and shorts.']) assert.notEqual(verdict(await run(request)),'PASS');
});
test('explicit category clarification resolves ambiguous removal',async()=>{
  const r=(await evaluateConversation([turn(input),turn('Remove 1 shirt.',output,'T2'),turn('I meant remove all shirts.','I recommend 1 pair of RunFit running shorts at $40. Suitable for running. The total is $40.','T3')])).at(-1)!;assert.equal(verdict(r),'PASS');
});
test('a new explicit request resolves an emptied cart',async()=>{
  const r=(await evaluateConversation([turn('I need 2 shirts. My total budget is under $50.','I recommend 2 Alpha shirts at $20 each. The total is $40.'),turn('Remove the shirts.','There are no recommendations.','T2'),turn('Add 1 shirt.','I recommend 1 Alpha shirt at $20. The total is $20.','T3')])).at(-1)!;assert.equal(verdict(r),'PASS');
});
test('equivalent word and numeric quantities are not contradictory',async()=>{
  assert.equal(verdict(await run('I need one shirt and 1 shirt.',output.replace('2 RunFit','1 RunFit').replace('$80','$60'))),'PASS');
});
test('article and numeric quantity contradictions remain unknown',async()=>{
  assert.equal(verdict(await run('I need a shirt and 2 shirts.',output.replace('2 RunFit','1 RunFit').replace('$80','$60'))),'INDETERMINATE');
});
