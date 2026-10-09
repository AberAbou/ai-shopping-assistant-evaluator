import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './helpers/evaluate';
import { evaluateConversation } from '../src/services/evaluation/conversationEvaluation';
import { assessmentFindings, buildQaAssessmentReport } from '../src/services/evaluation/qaAssessmentReport';
import { buildPlainEnglishAssessment } from '../src/services/evaluation/plainEnglishAssessment';
import { buildExportJsonPayload, buildDetailedProfessionalReport, buildConciseProfessionalReport } from '../src/services/evaluation/reportExportHelper';

const narrative=(text:string)=>text.replace(/(`{3,})\n[\s\S]*?\n\1/g,'');
const forbidden=/\b(?:AI|LLM|JSON|algorithms?|automation|automated|models?|pipelines?|software processing|C\d+)\b/i;
const headings=['Assessment Title','Scope & Objective','Scenario/Request Summary','Acceptance Criteria','Observed Response','Assessment Method','Findings by Requirement','Overall Outcome & Severity','Deviations/Root Causes','Risk/Impact','Corrective Recommendations','Limitations','Reviewer Sign-off'];
const cases: Array<[string,string,string,string]> = [
  ['valid response','I need a jacket under $100.','I recommend the TrailAir Jacket for $80.','PASS'],
  ['mandatory budget failure','I need a jacket under $100.','I recommend the TrailAir Jacket for $180.','FAIL'],
  ['optional budget failure','I need a jacket. Ideally, its price should be under $70.','I recommend the TrailAir Jacket for $80.','PASS'],
  ['missing evidence','I need a waterproof jacket under $100.','I recommend the TrailAir Jacket for $80.','INDETERMINATE'],
  ['forbidden properties','I need a jacket under $100. It must not be waterproof or insulated.','I recommend the TrailAir Jacket for $80. It is waterproof and insulated.','FAIL'],
  ['conflicting feature','I need a waterproof jacket under $100.','I recommend the TrailAir Jacket for $80. It is waterproof. It is not waterproof.','INDETERMINATE'],
  ['cart total conflict','2 shirts and 1 pair of shorts; total budget under $85','I recommend 2 running shirts at $20 each and 1 pair of running shorts at $40 each. Total: $60.','INDETERMINATE'],
];
for (const [name,input,output,verdict] of cases) test(`stakeholder report: ${name}`,async()=>{
  const p=await evaluate(input,output);
  const before=JSON.stringify(p);
  const jsonBefore=buildExportJsonPayload(p);
  const detailedBefore=buildDetailedProfessionalReport(p).plainText;
  const conciseBefore=buildConciseProfessionalReport(p).plainText;
  const report=buildQaAssessmentReport(p);
  assert.equal(p.finalEvaluationResult.finalVerdict,verdict);
  for(const heading of headings) assert.ok(report.includes(`## ${heading}`),heading);
  assert.ok(report.includes(input)&&report.includes(output));
  assert.ok(!forbidden.test(narrative(report)),narrative(report));
  assert.match(report,/Direct comparison against the stated shopper requirements/);
  assert.match(report,/Review status: Awaiting review/);
  assert.match(report,/Reviewer name: ____________________/);
  assert.match(report,/No independent catalog checks, physical tests, or human verification were performed/);
  assert.ok(!report.includes('response is approved'));
  const findings=assessmentFindings(p);
  for(const f of findings) {
    assert.ok(report.includes(`Verdict: ${f.conflict ? 'CONFLICT (UNKNOWN)' : f.status}.`));
    for(const evidence of f.evidence) assert.ok(report.includes(evidence));
  }
  if(name==='optional budget failure') {assert.match(report,/Optional improvement/);assert.match(report,/does not by itself establish a mandatory failure/);}
  if(name==='mandatory budget failure') {assert.match(report,/Mandatory priority/);assert.match(report,/strictly below \$100/);}
  if(name==='conflicting feature'||name==='cart total conflict') assert.match(report,/CONFLICT/);
  if(name==='cart total conflict') assert.match(report,/calculated \$80; stated \$60/);
  assert.equal(JSON.stringify(p),before);
  assert.deepEqual(buildExportJsonPayload(p),jsonBefore);
  assert.equal(buildDetailedProfessionalReport(p).plainText,detailedBefore);
  assert.equal(buildConciseProfessionalReport(p).plainText,conciseBefore);
});

test('verbatim technical or markup content stays within evidence; narrative remains stakeholder prose',async()=>{
  const input='I need a jacket under $100. Notes: AI, JSON, C42, algorithms, model pipelines. ``` <script>alert(1)</script>';
  const p=await evaluate(input,'I recommend the TrailAir Jacket for $80.');
  const report=buildQaAssessmentReport(p);
  assert.ok(report.includes(input));
  assert.ok(!forbidden.test(narrative(report)));
  assert.ok(report.includes('````\n'+input+'\n````'));
});

test('product-specific feature findings and corrections preserve isolation',async()=>{
  const input='I need a jacket and a backpack under $100 each. Neither waterproof nor insulated.';
  const output='1. TrailAir Jacket - $40. It is not waterproof or insulated.\n2. Alpine Backpack - $50. It is waterproof and insulated.';
  const p=await evaluate(input,output);
  const findings=assessmentFindings(p).filter(f=>['water_resistance','insulation'].includes(f.requirement.attribute));
  assert.deepEqual(findings.map(f=>[f.subject,f.status]),[['TrailAir Jacket','PASS'],['Alpine Backpack','FAIL'],['TrailAir Jacket','PASS'],['Alpine Backpack','FAIL']]);
  const corrections=buildQaAssessmentReport(p).split('## Corrective Recommendations')[1].split('## Limitations')[0];
  assert.ok(corrections.includes('Alpine Backpack'));
  assert.ok(!corrections.includes('TrailAir Jacket'));
});

const turns=[
  {id:'T1',userPrompt:'2 shirts and 1 pair of shorts; total budget under $85',llmOutput:'I recommend 2 shirts at $25 each and 1 pair of shorts at $40 each. Total: $90.'},
  {id:'T2',userPrompt:'My total budget is under $100.',llmOutput:'I recommend 2 shirts at $25 each and 1 pair of shorts at $40 each. Total: $90.'},
  {id:'T3',userPrompt:'Yes.',llmOutput:''},
];
test('conversation includes every assessed verdict, active revisions, and audit trail',async()=>{
  const results=await evaluateConversation(turns);
  const before=JSON.stringify(results);
  const report=buildQaAssessmentReport(results.at(-1)!,results);
  assert.match(report,/covers 3 assessed responses/);
  assert.match(report,/Turn T1: FAIL/);assert.match(report,/Turn T2: PASS/);assert.match(report,/Turn T3: INDETERMINATE/);
  assert.match(report,/Latest assessed response \(T3\): INDETERMINATE/);
  assert.match(report,/Origin: turn T2/);
  assert.match(report,/Requirement revision audit trail/);
  assert.ok(!forbidden.test(narrative(report)),narrative(report));
  for(const t of turns) assert.ok(report.includes(t.userPrompt));
  assert.match(report,/No response supplied/);
  assert.equal(JSON.stringify(results),before);
});

test('partial conversation artifacts never certify earlier turns as assessed',async()=>{
  const results=await evaluateConversation(turns);
  const report=buildQaAssessmentReport(results.at(-1)!);
  assert.match(report,/covers 1 assessed response/);
  assert.match(report,/Turn T1: Not assessed in this report/);assert.match(report,/Turn T2: Not assessed in this report/);
  assert.ok(!report.includes('Turn T1: FAIL'));
});

test('selecting an earlier conversation tab still reports the full assessed history',async()=>{
  const results=await evaluateConversation(turns);
  assert.equal(buildQaAssessmentReport(results[0],results),buildQaAssessmentReport(results[2],results));
});

const test6Input='I need 2 running shirts and 1 pair of running shorts. My total budget is under $85. All items must be suitable for running.';
const test6Output='I recommend 2 RunFit running shirts at $20 each and 1 pair of RunFit running shorts at $40. Both products are specifically designed for running. The total is $60.';
test('review: each cart requirement has one authoritative finding; only money conflicts',async()=>{
  const p=await evaluate(test6Input,test6Output);
  const findings=assessmentFindings(p);
  const cartRecords=p.verificationResult.records.filter(v=>v.productId==='CART');
  assert.equal(cartRecords.length,4);
  for(const v of cartRecords) {
    const matches=findings.filter(f=>f.requirement.id===v.constraintId);
    assert.equal(matches.length,1,`${v.constraintAttribute} must not be duplicated`);
    assert.equal(matches[0].subject,v.productName);
    assert.equal(matches[0].status,v.status);
    assert.equal(matches[0].conflict,!!v.conflictDetected);
    assert.deepEqual(matches[0].evidence,v.claimEvidence);
  }
  assert.equal(findings.filter(f=>f.conflict).length,1);
  assert.ok(findings.filter(f=>f.requirement.attribute==='quantity').every(f=>f.status==='PASS'&&!f.conflict));
  const report=buildQaAssessmentReport(p);
  assert.equal((report.match(/Verdict: CONFLICT \(UNKNOWN\)/g)??[]).length,1);
  assert.equal((report.match(/#### Requirement /g)??[]).length,p.verificationResult.records.length);
  const corrections=report.split('## Corrective Recommendations')[1].split('## Limitations')[0];
  assert.equal((corrections.match(/Mandatory priority/g)??[]).length,1);
});

test('review: fallback cart summaries work only when upstream records for that requirement are absent',async()=>{
  const p=await evaluate(test6Input,test6Output);
  const budget=p.promptAnalysis.constraints.find(c=>c.attribute==='cart_total_price')!;
  // Non-budget alias for a monetary constraint must retain the same conflict.
  budget.attribute='budget';
  p.finalEvaluationResult.cartEvaluation!.verifications.find(v=>v.constraintId===budget.id)!.constraintAttribute='budget';
  p.verificationResult.records=p.verificationResult.records.filter(v=>v.constraintId!==budget.id);
  const findings=assessmentFindings(p);
  const money=findings.filter(f=>f.requirement.id===budget.id);
  assert.equal(money.length,1);assert.equal(money[0].status,'UNKNOWN');assert.equal(money[0].conflict,true);
  for(const c of p.promptAnalysis.constraints.filter(c=>c.scope==='cart')) assert.equal(findings.filter(f=>f.requirement.id===c.id).length,1);
  assert.ok(findings.filter(f=>f.requirement.attribute==='quantity').every(f=>f.status==='PASS'&&!f.conflict));
});

test('review: distinct same-named products stay distinct while repeated subject records are ignored',async()=>{
  const p=await evaluate('I need a waterproof jacket under $100.','Options: Alpha Jacket ($80) is waterproof. Beta Jacket ($90) is waterproof.');
  assert.equal(p.claimAnalysis.products.length,2);
  p.verificationResult.records.forEach(v=>{v.productName='Jacket';});
  const before=assessmentFindings(p);
  p.verificationResult.records.push({...p.verificationResult.records[0],id:'duplicate'});
  assert.deepEqual(assessmentFindings(p),before);
  const waterproof=assessmentFindings(p).filter(f=>f.requirement.attribute==='water_resistance');
  assert.equal(waterproof.length,2);
});

test('review: conversation cart findings occur once for each assessed turn',async()=>{
  const results=await evaluateConversation([{id:'T1',userPrompt:test6Input,llmOutput:test6Output},{id:'T2',userPrompt:'My total budget is under $100.',llmOutput:test6Output.replace('$60','$80')}]);
  const report=buildQaAssessmentReport(results[1],results);
  assert.equal((report.match(/#### Requirement /g)??[]).length,results.reduce((n,p)=>n+p.verificationResult!.records.length,0));
  assert.equal((report.match(/Verdict: CONFLICT \(UNKNOWN\)/g)??[]).length,1);
  assert.match(report,/Turn T1: INDETERMINATE/);assert.match(report,/Turn T2: PASS/);
});

const authoredPlain=(text:string)=>text.replace(/“[\s\S]*?”/g,'');
test('plain English: ordinary paragraphs, exact supplied quotes, and no unsupported certification',async()=>{
  const input='I need a jacket under $100. # Shopper *note* `verbatim`';
  const output='I recommend the TrailAir Jacket for $80. # Response *note* `verbatim`';
  const p=await evaluate(input,output);const before=JSON.stringify(p);
  const text=buildPlainEnglishAssessment(p);
  assert.ok(text.includes(`“${input}”`));assert.ok(text.includes(`“${output}”`));
  assert.ok(!/[#*`|_]|^\s*(?:[-+]|\d+\.)\s/m.test(authoredPlain(text)));
  assert.ok(!forbidden.test(authoredPlain(text)));
  assert.match(text,/No independent catalog checks, physical tests, or human verification were performed/);
  assert.match(text,/Reviewer name: +Review date: +Review decision: Awaiting review/);
  assert.equal(JSON.stringify(p),before);
});

for(const [name,input,output,expected] of [
  ['pass','I need a jacket under $100.','I recommend TrailAir Jacket for $80.','meets the mandatory requirements on the supplied evidence'],
  ['fail','I need a jacket under $100.','I recommend TrailAir Jacket for $180.','fails the mandatory requirements'],
  ['unknown','I need a waterproof jacket under $100.','I recommend TrailAir Jacket for $80.','mandatory requirements remain unconfirmed'],
  ['conflict','I need a waterproof jacket under $100.','I recommend TrailAir Jacket for $80. It is waterproof. It is not waterproof.','contains conflicting statements'],
  ['optional','I need a jacket. Ideally, its price should be under $70.','I recommend TrailAir Jacket for $80.','do not by themselves establish a mandatory failure'],
] as const) test(`plain English: ${name} preserves recorded outcomes and priority`,async()=>{
  const text=buildPlainEnglishAssessment(await evaluate(input,output));
  assert.ok(text.includes(expected));
  if(name==='optional') assert.match(text,/Overall, this response meets the mandatory requirements/);
  if(name==='unknown'||name==='conflict') {assert.match(text,/cannot be confirmed as meeting/);assert.ok(!text.includes('recommendation fails the mandatory requirements'));}
  if(name==='fail') {assert.match(text,/Revise the recommendation to respect the shopper’s budget/);assert.match(text,/spending outside the stated limits/);}
});

test('plain English: cart conflict retains quantities and product evidence isolation',async()=>{
  const p=await evaluate(test6Input,test6Output);const text=buildPlainEnglishAssessment(p);
  assert.match(text,/calculated purchase total is \$80, and the stated total is \$60/);
  assert.equal((text.match(/contains conflicting statements/g)??[]).length,1);
  assert.equal((text.match(/Reconcile the conflicting statements and confirm/g)??[]).length,1);
  const isolated=await evaluate('I need a waterproof jacket and waterproof boots.','I recommend Alpha Jacket ($40), which is waterproof, and Beta Boots ($30).');
  const findings=assessmentFindings(isolated);
  const report=buildPlainEnglishAssessment(isolated);
  for(const f of findings) {
    const paragraph=report.split('\n\n').find(s=>s.includes(f.subject)&&s.includes(`“${f.requirement.sourceText}”`));
    assert.ok(paragraph);
    for(const evidence of f.evidence) assert.ok(paragraph.includes(`“${evidence}”`));
    if(f.status==='UNKNOWN') assert.ok(paragraph.includes('remain unconfirmed'));
  }
});

test('plain English: conversation is chronological with revisions and earlier failures',async()=>{
  const results=await evaluateConversation(turns);const text=buildPlainEnglishAssessment(results[0],results);
  assert.ok(text.indexOf('For turn 1')<text.indexOf('For turn 2'));assert.ok(text.indexOf('For turn 2')<text.indexOf('For turn 3'));
  assert.match(text,/Overall, turn 1 fails the mandatory requirements/);
  assert.match(text,/Overall, turn 2 meets the mandatory requirements/);
  assert.match(text,/Overall, turn 3 cannot be confirmed/);
  assert.match(text,/requirement revision at this point/);assert.match(text,/originated in turn 2/);
  assert.ok(!/\bT\d+\b/.test(authoredPlain(text)));
  const partial=buildPlainEnglishAssessment(results[2]);
  assert.equal((partial.match(/has not been assessed here/g)??[]).length,2);
  assert.ok(!partial.includes('Overall, turn 1'));
});

const editorialInput='I need a lightweight, breathable jacket for summer trail running under $100. It must not be waterproof or insulated.';
const editorialOutput='I recommend the AlpineShield Heavy Winter Parka for $180. It is waterproof, heavily insulated, and designed for freezing temperatures.';
test('editorial review: parka assessment groups all seven findings and evidence into concise prose',async()=>{
  const p=await evaluate(editorialInput,editorialOutput);const before=JSON.stringify(p);
  const findings=assessmentFindings(p);const text=buildPlainEnglishAssessment(p);const paragraphs=text.split('\n\n');
  assert.equal(findings.length,7);
  const fail=paragraphs.filter(s=>s.startsWith('For AlpineShield')&&s.includes('mandatory requirements are not met'));
  const unknown=paragraphs.filter(s=>s.startsWith('For AlpineShield')&&s.includes('mandatory requirements remain unconfirmed'));
  assert.equal(fail.length,1);assert.equal(unknown.length,1);
  assert.equal(findings.filter(f=>f.status==='FAIL').length,4);assert.equal(findings.filter(f=>f.status==='UNKNOWN').length,3);
  for(const f of findings) {
    const paragraph=f.status==='FAIL'?fail[0]:unknown[0];
    assert.ok(paragraph.includes(`“${f.requirement.sourceText}”`));
    for(const evidence of f.evidence) assert.ok(paragraph.includes(`“${evidence}”`));
  }
  assert.ok(!unknown[0].includes('is violated')&&!unknown[0].includes('is not met'));
  const actions=paragraphs.filter(s=>/^(Replace the unsuitable|Revise the recommendation|Before acceptance, confirm|Reconcile the conflicting)/.test(s));
  assert.equal(actions.length,3);
  assert.ok(actions[0].includes('“summer”'));assert.match(actions[1],/budget and exclusions/);
  for(const f of findings) assert.ok(actions.some(s=>s.includes(`“${f.requirement.sourceText}”`)));
  assert.match(text,/Overall, this response fails the mandatory requirements\. Severity is high\. The recommendation should not be accepted as proposed\./);
  assert.ok(!text.includes('As a priority'));assert.ok(paragraphs.length<=10);
  assert.equal((authoredPlain(text).match(/AlpineShield Heavy Winter Parka/g)??[]).length,2);
  assert.ok(!/[#*`|_]/.test(authoredPlain(text)));assert.ok(!forbidden.test(authoredPlain(text)));
  assert.equal(JSON.stringify(p),before);
});

test('editorial review: grouped multi-product evidence retains each requirement and subject association',async()=>{
  const p=await evaluate('I need a jacket and a backpack under $100 each. Neither waterproof nor insulated.','1. TrailAir Jacket - $40. It is not waterproof or insulated.\n2. Alpine Backpack - $150. It is waterproof and insulated.');
  const text=buildPlainEnglishAssessment(p);const paragraphs=text.split('\n\n');
  for(const f of assessmentFindings(p)) {
    const status=f.conflict?'UNKNOWN':f.status;
    const group=paragraphs.find(s=>s.startsWith(`For ${f.subject},`)&&s.includes(status==='PASS'?'are supported':status==='FAIL'?'are not met':'remain unconfirmed'));
    assert.ok(group);
    assert.ok(group.includes(`“${f.requirement.sourceText}”`));
    for(const evidence of f.evidence) assert.ok(group.includes(`“${evidence}”`));
    const other=p.claimAnalysis.products.find(product=>product.name!==f.subject);
    if(other&&f.requirement.scope!=='cart') assert.ok(!group.includes(other.name));
  }
  assert.ok(text.includes('for Alpine Backpack'));
});

test('editorial review: each conversation response retains grouped findings, evidence and its recorded severity',async()=>{
  const results=await evaluateConversation([{id:'T1',userPrompt:editorialInput,llmOutput:editorialOutput},{id:'T2',userPrompt:'My budget is now under $200, but all other requirements remain.',llmOutput:'I recommend TrailAir Jacket for $80. It is lightweight, breathable, not waterproof, uninsulated, and designed for summer trail running.'}]);
  const text=buildPlainEnglishAssessment(results[0],results);
  for(const [index,p] of results.entries()) {
    const section=text.split(`For turn ${index+1},`)[1].split('For turn ')[0];
    for(const f of assessmentFindings(p)) {
      assert.ok(section.includes(`“${f.requirement.sourceText}”`));
      for(const evidence of f.evidence) assert.ok(section.includes(`“${evidence}”`));
    }
    assert.ok(section.includes(p.finalEvaluationResult.finalVerdict==='PASS'?'meets the mandatory requirements':'fails the mandatory requirements'));
    if(p.finalEvaluationResult.summary.overallSeverity!=='NONE') assert.ok(section.includes(`Severity is ${p.finalEvaluationResult.summary.overallSeverity.toLowerCase()}`));
    assert.ok(section.split('\n\n').filter(s=>/^(Replace the unsuitable|Revise the recommendation|Before acceptance, confirm|Reconcile the conflicting)/.test(s)).length<=3);
  }
  assert.match(text,/Overall, turn 1 fails[\s\S]*Overall, turn 2 meets/);
});
