import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConversation } from '../src/services/evaluation/conversationEvaluation';
import { issue11Turns } from '../tests/fixtures/issue11Conversation';
import { analyzeLlmOutputDeterministically } from '../src/services/evaluation/fallbackClaimAnalyzer';
import { reconcileClaimCart } from '../src/services/evaluation/shoppingCartSemantics';
import { buildPlainEnglishAssessment } from '../src/services/evaluation/plainEnglishAssessment';
import { buildQaAssessmentReport, assessmentFindings } from '../src/services/evaluation/qaAssessmentReport';
import { analyzeUserPromptDeterministically as analyzePrompt } from '../src/services/evaluation/fallbackPromptAnalyzer';
import { normalizePromptAnalysis } from '../src/services/evaluation/promptAnalysisNormalizer';
import { jacketReplacementTurns as replacementTurns } from '../tests/fixtures/jacketReplacementConversation';
import { pr9ExactReplacementTurns } from '../tests/fixtures/pr9ExactReplacementConversation';

test('PR 9: exact manual jacket and shoes replacement transcript',async()=>{
  const results=await evaluateConversation(pr9ExactReplacementTurns);
  assert.deepEqual(results.map(r=>r.finalEvaluationResult.finalVerdict),['PASS','FAIL','PASS']);
  for(const [i,r] of results.entries()) {
    const c=r.promptAnalysis!.constraints;
    assert.deepEqual(c.filter(c=>c.attribute==='price').map(c=>[c.scope,c.targetProductCategory,c.operator,c.expectedValue,c.sourceTurnId]),[['product',null,'<',100,'T1']]);
    assert.ok(!c.some(c=>c.attribute==='cart_total_price'||c.attribute==='conversation_issue'));
    assert.deepEqual(c.filter(c=>c.attribute==='water_resistance').map(c=>[c.targetProductCategory,c.polarity,c.sourceTurnId]),[['jacket',i?'negative':'positive',i?'T2':'T1']]);
    assert.deepEqual(c.filter(c=>c.attribute==='quantity').map(c=>[c.targetProductCategory,c.expectedValue,c.sourceTurnId]),i?[['running shoes',1,'T1'],['jacket',1,'T2']]:[['jacket',1,'T1'],['running shoes',1,'T1']]);
    assert.equal(r.inputs.conversation.unresolved.length,0);
    assert.deepEqual(r.claimAnalysis!.products.map(p=>[p.category,p.parsedQuantity,p.unitPrice?.amount]),[['jacket',1,i===2?85:80],['running shoes',1,70]]);
    assert.deepEqual(r.verificationResult!.records.filter(v=>v.constraintAttribute==='price').map(v=>[v.productId,v.status]),[['P1','PASS'],['P2','PASS']]);
    assert.deepEqual(r.verificationResult!.records.filter(v=>v.status!=='PASS').map(v=>[v.constraintAttribute,v.productId,v.status]),i===1?[['breathability','P1','UNKNOWN'],['water_resistance','P1','FAIL']]:[]);
  }
  assert.deepEqual(results[2].promptAnalysis!.constraints,results[1].promptAnalysis!.constraints);
  const text=buildPlainEnglishAssessment(results[2],results);
  for(const [i,turn] of pr9ExactReplacementTurns.entries()) {
    assert.ok(text.includes(turn.userPrompt)&&text.includes(turn.llmOutput));
    assert.ok(text.includes(`Overall, turn ${i+1} ${i===1?'fails':'meets'} the mandatory requirements`));
  }
});

test('PR 9: retained per-product budget independently rejects either item at $100',async()=>{
  for(const category of ['jacket','running shoes']) {
    const turns=pr9ExactReplacementTurns.map(t=>({...t}));
    turns[2].llmOutput=turns[2].llmOutput.replace(category==='jacket'?'$85':'$70','$100');
    const r=(await evaluateConversation(turns))[2];
    assert.equal(r.finalEvaluationResult.finalVerdict,'FAIL');
    assert.deepEqual(r.verificationResult!.records.filter(v=>v.status!=='PASS').map(v=>[v.constraintAttribute,v.productId]),[['price',category==='jacket'?'P1':'P2']]);
    assert.equal(r.promptAnalysis!.constraints.find(c=>c.attribute==='price')!.sourceTurnId,'T1');
  }
});

test('PR 9: retention references do not hide a new explicit shoe requirement',async()=>{
  const turns=pr9ExactReplacementTurns.map(t=>({...t}));
  turns[2].userPrompt+=' The shoes must be waterproof.';
  const r=(await evaluateConversation(turns))[2];
  assert.equal(r.finalEvaluationResult.finalVerdict,'INDETERMINATE',JSON.stringify(r.verificationResult!.records));
  assert.deepEqual(r.promptAnalysis!.constraints.filter(c=>c.attribute==='water_resistance').map(c=>[c.targetProductCategory,c.polarity,c.sourceTurnId]),[['jacket','negative','T2'],['running shoes','positive','T3']]);
  assert.deepEqual(r.verificationResult!.records.filter(v=>v.status!=='PASS').map(v=>[v.constraintAttribute,v.productId,v.status]),[['water_resistance','P2','UNKNOWN']]);
});

test('replacement: old description is referential and non-waterproof is a prohibition in fallback and API normalization',()=>{
  const text=replacementTurns[1].userPrompt;
  const p=analyzePrompt(text);
  const raw={...p,constraints:[...p.constraints,{id:'C99',attribute:'water_resistance',operator:'required',expectedValue:'waterproof',polarity:'positive',constraintType:'hard',sourceText:'waterproof'}]};
  for(const analysis of [p,normalizePromptAnalysis(raw,text)]) {
    assert.deepEqual(analysis.constraints.filter(c=>c.attribute==='water_resistance').map(c=>[c.polarity,c.operator]),[['negative','prohibited']]);
    assert.ok(!analysis.intent.desiredAttributes.includes('waterproof'));
    assert.ok(analysis.intent.explicitExclusions.includes('waterproof'));
  }
});

test('replacement: three-turn jacket polarity change preserves budget, shorts, weight and collective suitability',async()=>{
  const results=await evaluateConversation(replacementTurns);

  assert.deepEqual(results.map(r=>r.finalEvaluationResult.finalVerdict),['PASS','PASS','PASS']);
  for(const [i,r] of results.entries()) {
    const c=r.promptAnalysis!.constraints;
    assert.deepEqual(c.filter(c=>c.attribute==='water_resistance').map(c=>[c.polarity,c.sourceTurnId]),[[i?'negative':'positive',i?'T2':'T1']]);
    for(const attribute of ['weight','use_case','cart_total_price']) assert.equal(c.find(c=>c.attribute===attribute)!.sourceTurnId,'T1');
    assert.equal(c.find(c=>c.attribute==='quantity'&&c.targetProductCategory==='shorts')!.sourceTurnId,'T1');
    assert.equal(r.finalEvaluationResult.cartEvaluation!.calculatedCartTotal,90);
    assert.ok(r.verificationResult!.records.every(v=>v.status==='PASS'));
    assert.equal(r.inputs.conversation.unresolved.length,0);
  }
  assert.deepEqual(results[2].promptAnalysis!.constraints,results[1].promptAnalysis!.constraints);
});

test('replacement: a product revision does not withdraw a collective feature from other products',async()=>{
  const turns=replacementTurns.map(t=>({...t}));
  turns[0].userPrompt='I need 1 jacket and 1 pair of running shorts. My total budget must be under $120. All items must be waterproof and suitable for running.';
  turns[0].llmOutput=turns[0].llmOutput.replace('RunFit running shorts','waterproof RunFit running shorts');
  for(const i of [1,2]) turns[i].llmOutput=turns[i].llmOutput.replace('RunFit running shorts','waterproof RunFit running shorts');
  const results=await evaluateConversation(turns);
  assert.deepEqual(results.map(r=>r.finalEvaluationResult.finalVerdict),['PASS','PASS','PASS']);
  assert.deepEqual(results[2].promptAnalysis!.constraints.filter(c=>c.attribute==='water_resistance').map(c=>[c.targetProductCategory,c.polarity,c.sourceTurnId]),[['shorts','positive','T1'],['jacket','negative','T2']]);
  turns[2].llmOutput=turns[2].llmOutput.replace('waterproof RunFit','non-waterproof RunFit');
  const r=(await evaluateConversation(turns))[2];
  assert.equal(r.finalEvaluationResult.finalVerdict,'FAIL');
  assert.deepEqual(r.verificationResult!.records.filter(v=>v.status!=='PASS').map(v=>[v.constraintAttribute,v.productId]),[['water_resistance','P2']]);
});

test('replacement: single jacket retains budget, activity and weight, and supports reversal of feature polarity',async()=>{
  const turns=[
    {id:'T1',userPrompt:'I need a lightweight waterproof jacket for running under $100.',llmOutput:'I recommend the RainFit jacket for $80. It is lightweight, waterproof and designed for running.'},
    {id:'T2',userPrompt:'Replace the waterproof jacket with a breathable, non-waterproof jacket.',llmOutput:'I recommend the TrailAir jacket for $80. It is lightweight, breathable, non-waterproof and designed for running.'},
    {id:'T3',userPrompt:'Keep the same products and quantities.',llmOutput:'I recommend the TrailAir jacket for $80. It is lightweight, breathable, non-waterproof and designed for running.'},
  ];
  const results=await evaluateConversation(turns);
  assert.deepEqual(results.map(r=>r.finalEvaluationResult.finalVerdict),['PASS','PASS','PASS']);
  const c=results[2].promptAnalysis!.constraints;
  for(const attribute of ['price','use_case','weight']) assert.equal(c.find(c=>c.attribute===attribute)!.sourceTurnId,'T1');
  assert.deepEqual(c.filter(c=>c.attribute==='water_resistance').map(c=>[c.polarity,c.sourceTurnId]),[['negative','T2']]);
  const reversed=await evaluateConversation([...turns,{id:'T4',userPrompt:'Replace the non-waterproof jacket with a waterproof jacket.',llmOutput:'I recommend the RainFit jacket for $80. It is lightweight, breathable, waterproof and designed for running.'}]);
  assert.equal(reversed[3].finalEvaluationResult.finalVerdict,'PASS');
  assert.deepEqual(reversed[3].promptAnalysis!.constraints.filter(c=>c.attribute==='water_resistance').map(c=>[c.polarity,c.sourceTurnId]),[['positive','T4']]);
});

for(const [statement,expected] of [['waterproof','FAIL'],['blue','INDETERMINATE'],['non-waterproof waterproof','INDETERMINATE']] as const) test(`replacement: final snapshot ${statement}`,async()=>{
  const turns=replacementTurns.map(t=>({...t}));turns[2].llmOutput=turns[2].llmOutput.replace('non-waterproof',statement);
  const r=(await evaluateConversation(turns))[2];
  assert.equal(r.finalEvaluationResult.finalVerdict,expected);
  assert.ok(r.verificationResult!.records.filter(v=>v.constraintAttribute!=='water_resistance').every(v=>v.status==='PASS'));
});

test('Issue 11: exact four-turn acceptance transcript',async()=>{
  const results=await evaluateConversation(issue11Turns);
  assert.deepEqual(results.map(r=>r.finalEvaluationResult.finalVerdict),['PASS','FAIL','PASS','INDETERMINATE']);
  assert.deepEqual(results.map(r=>r.finalEvaluationResult.cartEvaluation!.calculatedCartTotal),[80,100,100,100]);
  assert.deepEqual(results.map(r=>r.finalEvaluationResult.cartEvaluation!.statedCartTotal),[80,100,100,90]);
  for(const [i,r] of results.entries()) {
    const c=r.promptAnalysis!.constraints;
    assert.deepEqual(c.filter(c=>c.attribute==='quantity').sort((a,b)=>a.targetProductCategory!.localeCompare(b.targetProductCategory!)).map(c=>[c.targetProductCategory,c.expectedValue,c.sourceTurnId]),[['shirt',i?3:2,i?'T2':'T1'],['shorts',1,'T1']]);
    assert.deepEqual(c.filter(c=>c.attribute==='cart_total_price').map(c=>[c.expectedValue,c.operator,c.sourceTurnId]),[[i<2?100:120,'<',i<2?'T1':'T3']]);
    assert.deepEqual(c.filter(c=>c.attribute==='use_case').map(c=>[c.expectedValue,c.sourceTurnId,c.targetProductCategory]),[['running','T1',null]]);
    assert.equal(c.find(c=>c.attribute==='cart_items')!.sourceTurnId,i?'T2':'T1');
    assert.equal(r.inputs.conversation.unresolved.length,0);
    assert.ok(r.claimAnalysis!.claims.every(c=>c.sourceTurnId===`T${i+1}`));
    assert.deepEqual(r.claimAnalysis!.products.map(p=>[p.category,p.parsedQuantity,p.unitPrice?.amount,p.lineTotal?.amount]),[['shirt',i?3:2,20,i?60:40],['shorts',1,40,40]]);
    const notPassed=r.verificationResult!.records.filter(v=>v.status!=='PASS');
    assert.deepEqual(notPassed.map(v=>[v.constraintAttribute,v.status,!!v.conflictDetected]),i===1?[['cart_total_price','FAIL',false]]:i===3?[['cart_total_price','UNKNOWN',true]]:[]);
  }
});

for(const revision of ['Change the running shirts to three.','Set the quantity of running shirts to 3.','Update the running shirts to 3.']) test(`Issue 11: targeted quantity override ${revision}`,async()=>{
  const turns=issue11Turns.map(t=>({...t}));turns[1].userPrompt=revision+' Keep the shorts and my original budget unchanged.';
  const results=await evaluateConversation(turns);
  assert.deepEqual(results.map(r=>r.finalEvaluationResult.finalVerdict),['PASS','FAIL','PASS','INDETERMINATE']);
  assert.ok(results.slice(1).every(r=>r.promptAnalysis!.constraints.find(c=>c.attribute==='quantity'&&c.targetProductCategory==='shirt')!.expectedValue===3));
});

for(const prefix of ['The final cart includes','Your current shopping cart contains','The final shopping cart consists of','This cart has']) test(`Issue 11: full snapshot prefix ${prefix}`,async()=>{
  const turns=issue11Turns.map(t=>({...t}));turns[3].llmOutput=turns[3].llmOutput.replace('Your final cart contains',prefix);
  const results=await evaluateConversation(turns);const last=results[3];
  assert.equal(last.finalEvaluationResult.finalVerdict,'INDETERMINATE');assert.equal(last.finalEvaluationResult.cartEvaluation!.calculatedCartTotal,100);
  assert.deepEqual(last.claimAnalysis!.products.map(p=>[p.category,p.parsedQuantity,p.unitPrice?.amount]),[['shirt',3,20],['shorts',1,40]]);
});

test('Issue 11: strict and inclusive budget boundaries remain distinct after quantity overrides',async()=>{
  for(const [budget,expected] of [['strictly under $100','FAIL'],['at most $100','PASS'],['strictly under $100.01','PASS']] as const) {
    const turns=issue11Turns.slice(0,3).map(t=>({...t}));turns[2].userPrompt=`My total budget is now ${budget}. Keep the same products and quantities.`;
    const results=await evaluateConversation(turns);
    assert.equal(results[2].finalEvaluationResult.finalVerdict,expected);
    assert.equal(results[2].finalEvaluationResult.cartEvaluation!.calculatedCartTotal,100);
  }
});

test('Issue 11: confirmation and keep-same follow-ups do not create requirements or borrow missing prices',async()=>{
  for(const request of ['Confirm my final cart.','Please show the current shopping cart, quantities and unit prices and total.','Keep the same items and quantities.']) {
    const turns=issue11Turns.map(t=>({...t}));turns[3].userPrompt=request;turns[3].llmOutput=turns[3].llmOutput.replace('$90','$100');
    const results=await evaluateConversation(turns);
    assert.equal(results[3].finalEvaluationResult.finalVerdict,'PASS');
    assert.equal(results[3].inputs.conversation.unresolved.length,0);
    const before=results[2].promptAnalysis!.constraints.map(c=>[c.attribute,c.expectedValue,c.sourceTurnId,c.sourceText]);
    assert.deepEqual(results[3].promptAnalysis!.constraints.map(c=>[c.attribute,c.expectedValue,c.sourceTurnId,c.sourceText]),before);
  }
  const turns=issue11Turns.map(t=>({...t}));turns[3].llmOutput='Your final cart contains 3 RunFit running shirts and 1 pair of RunFit running shorts. All items are designed for running.';
  const result=(await evaluateConversation(turns))[3];
  assert.equal(result.finalEvaluationResult.finalVerdict,'INDETERMINATE');
  assert.equal(result.claimAnalysis!.products.length,2);assert.ok(result.claimAnalysis!.products.every(p=>p.unitPrice==null));
});

test('Issue 11: ambiguous, invalid and conflicting count overrides cannot pass',async()=>{
  for(const request of ['Change them to 3.','Change the running shirts to 0.','Change the running shirts to -2.','Change the running shirts to 2.5.','Change the running shirts to 3 and change the running shirts to 4.','Change the shirts and shorts to 3.','Change the socks to 3.']) {
    const results=await evaluateConversation([issue11Turns[0],{...issue11Turns[1],userPrompt:request}]);
    assert.notEqual(results[1].finalEvaluationResult.finalVerdict,'PASS',request);
    assert.equal(results[0].promptAnalysis!.constraints.find(c=>c.attribute==='quantity'&&c.targetProductCategory==='shirt')!.expectedValue,2);
  }
});

test('Issue 11: count choices and ranges cannot silently select the first number',async()=>{
  for(const request of ['Change the running shirts to 3 or 4.','Change the running shirts to three or four.','Set the running shirts to 3-4.']) {
    const results=await evaluateConversation([issue11Turns[0],{...issue11Turns[1],userPrompt:request,llmOutput:issue11Turns[1].llmOutput.replace('$20','$10').replace('$100','$70')}]);
    assert.equal(results[1].finalEvaluationResult.finalVerdict,'INDETERMINATE',request);
    assert.ok(!results[1].promptAnalysis!.constraints.some(c=>c.attribute==='quantity'&&c.targetProductCategory==='shirt'&&c.expectedValue===3));
  }
});

test('Issue 11: confirmation with a new constraint is not treated as unchanged',async()=>{
  const results=await evaluateConversation([issue11Turns[0],{...issue11Turns[1],userPrompt:'Please confirm the final cart. My total budget must be under $50.',llmOutput:issue11Turns[0].llmOutput}]);
  assert.equal(results[1].finalEvaluationResult.finalVerdict,'FAIL');
  assert.ok(results[1].promptAnalysis!.constraints.some(c=>c.attribute==='cart_total_price'&&c.expectedValue===50));
});

test('Issue 11: raw snapshot quantities are authoritative for an API-shaped product array',()=>{
  const text=issue11Turns[3].llmOutput;
  const result=analyzeLlmOutputDeterministically(text);
  const api={...structuredClone(result),products:[...result.products].reverse().map(p=>({...p,quantity:null,parsedQuantity:null,lineTotal:null}))};
  const reconciled=reconcileClaimCart(api,text);
  assert.deepEqual(reconciled.products.map(p=>[p.category,p.parsedQuantity,p.unitPrice?.amount,p.lineTotal?.amount]),[['shorts',1,40,40],['shirt',3,20,60]]);
});

test('Issue 11: report history, findings, evidence and revision origins remain truthful for all four turns',async()=>{
  const results=await evaluateConversation(issue11Turns);const before=JSON.stringify(results);
  const plain=buildPlainEnglishAssessment(results[3],results);const qa=buildQaAssessmentReport(results[3],results);
  for(const [i,r] of results.entries()) {
    const section=plain.split(`For turn ${i+1},`)[1].split('For turn ')[0];
    assert.ok(section.includes(`“${issue11Turns[i].userPrompt}”`));assert.ok(section.includes(`“${issue11Turns[i].llmOutput}”`));
    for(const f of assessmentFindings(r)) {
      assert.ok(section.includes(`“${f.requirement.sourceText}”`));
      for(const evidence of f.evidence) assert.ok(section.includes(`“${evidence}”`));
    }
    assert.ok(qa.includes(`Turn T${i+1}: ${r.finalEvaluationResult.finalVerdict}`));
  }
  const audit=qa.split('### Requirement revision audit trail')[1].split('## Acceptance Criteria')[0];
  for(const turn of issue11Turns.slice(0,3)) assert.equal(audit.split(turn.userPrompt).length-1,1);
  assert.equal((plain.match(/shopper’s requirement revision at this point/g)??[]).length,2);
  assert.ok(!plain.split('For turn 1,')[1].split('For turn 2,')[0].includes('requirement revision at this point'));
  assert.ok(plain.includes('Overall, turn 2 fails'));assert.ok(plain.includes('Overall, turn 3 meets'));assert.ok(plain.includes('Overall, turn 4 cannot be confirmed'));
  const last=plain.split('For turn 4,')[1];assert.ok(last.includes('calculated purchase total is $100, and the stated total is $90'));
  assert.ok(last.includes('originated in turn 1')&&last.includes('originated in turn 2')&&last.includes('originated in turn 3'));
  for(const origin of [1,2,3]) assert.equal((last.match(new RegExp(`originated in turn ${origin}`,'g'))??[]).length,1);
  assert.ok(!last.includes('originated in turn 4'));
  assert.equal(JSON.stringify(results),before);
});
