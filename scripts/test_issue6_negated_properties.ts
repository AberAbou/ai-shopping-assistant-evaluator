import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './helpers/evaluate';
import { analyzeUserPromptDeterministically as prompt } from '../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../src/services/evaluation/fallbackClaimAnalyzer';
import { normalizePromptAnalysis } from '../src/services/evaluation/promptAnalysisNormalizer';
import { normalizeClaimAnalysis } from '../src/services/evaluation/claimAnalysisNormalizer';
import { analyzeUserPrompt } from '../src/services/evaluation/promptAnalysisService';
import { buildDetailedProfessionalReport, buildExportMarkdownReport } from '../src/services/evaluation/reportExportHelper';

export const blockerPrompt = 'I need a lightweight, breathable jacket for summer trail running under $100. It must not be waterproof or insulated.';
export const blockerOutput = 'I recommend the AlpineShield Heavy Winter Parka for $180. It is waterproof, heavily insulated, and designed for freezing temperatures.';

test('Issue 6 manual blocker: prohibited features independently fail', async () => {
  const r = await evaluate(blockerPrompt, blockerOutput);
  const features = r.promptAnalysis.constraints.filter(c => ['water_resistance', 'insulation'].includes(c.attribute));
  assert.equal(features.length, 2);
  assert.ok(features.every(c => c.polarity === 'negative' && c.operator === 'prohibited' && c.constraintType === 'hard'));
  assert.deepEqual(r.verificationResult.records.filter(v => ['water_resistance', 'insulation'].includes(v.constraintAttribute)).map(v => v.status), ['FAIL', 'FAIL']);
  assert.equal(r.verificationResult.productSummaries.P1.negativeConstraintsFailed, 2);
  assert.equal(r.finalEvaluationResult.finalVerdict, 'FAIL');
  assert.equal(r.finalEvaluationResult.summary.overallSeverity, 'HIGH');
  assert.match(buildDetailedProfessionalReport(r).plainText, /not be waterproof or insulated/);
  assert.match(buildExportMarkdownReport(r), /not be waterproof or insulated/);
});

const prohibitions = ['must not be waterproof or insulated', 'must be neither waterproof nor insulated', 'must have no waterproof or insulated features', 'must be without waterproof or insulated features', 'must not be waterproof, or insulated', 'must not be waterproof and insulated'];
const cases: Array<[string, string, string[]]> = [
  ['explicit forbidden features', 'It is waterproof and heavily insulated.', ['FAIL', 'FAIL']],
  ['explicit absence', 'It is not waterproof or insulated.', ['PASS', 'PASS']],
  ['neither absence', 'It is neither waterproof nor insulated.', ['PASS', 'PASS']],
  ['prefix absence', 'It is non-waterproof and uninsulated.', ['PASS', 'PASS']],
  ['missing insulation', 'It is waterproof.', ['FAIL', 'UNKNOWN']],
  ['no property evidence', 'It is blue.', ['UNKNOWN', 'UNKNOWN']],
  ['independent positive after but', 'It is not waterproof but heavily insulated.', ['PASS', 'FAIL']],
  ['conflicting insulation', 'It is not waterproof or insulated. It is heavily insulated.', ['PASS', 'UNKNOWN']],
  ['conflicting waterproof', 'It is neither waterproof nor insulated. It is waterproof.', ['UNKNOWN', 'PASS']],
];
for (const phrase of prohibitions) for (const api of [false, true]) test(`${phrase}: ${api ? 'API normalized' : 'fallback'}`, async () => {
  const input = `I need a jacket under $100. It ${phrase}.`;
  const p = prompt(input);
  // Deliberately emulate the accepted-main/API defect, including misleading intent.
  const raw = { ...p, intent: { ...p.intent, desiredAttributes: ['waterproof', 'insulated'], explicitExclusions: ['be waterproof', 'insulated'] }, constraints: [
    ...p.constraints.filter(c => !['water_resistance', 'insulation'].includes(c.attribute)),
    {id:'C80', attribute:'be waterproof', expectedValue:'be waterproof', polarity:'negative', sourceText:phrase},
    {id:'C81', attribute:'insulated', expectedValue:'insulated', polarity:'positive', sourceText:'insulated'},
    {id:'C82', attribute:'water_resistance', expectedValue:true, polarity:'positive', sourceText:'waterproof'},
    {id:'C83', attribute:'weather_protection', expectedValue:'waterproof', polarity:'positive', sourceText:'waterproof'},
  ] };
  const a = api ? normalizePromptAnalysis(raw, input) : p;
  assert.deepEqual(a.constraints.filter(c => ['water_resistance', 'insulation'].includes(c.attribute)).map(c => [c.polarity,c.operator,c.constraintType]), [['negative','prohibited','hard'],['negative','prohibited','hard']]);
  assert.ok(!a.constraints.some(c => c.attribute === 'be waterproof' || c.attribute === 'insulated'));
  assert.ok(!a.constraints.some(c => c.attribute === 'weather_protection'));
  assert.ok(!a.intent.desiredAttributes.includes('waterproof') && !a.intent.desiredAttributes.includes('insulated'));
  assert.deepEqual(a.intent.explicitExclusions, ['waterproof','insulated']);
  assert.equal(a.summary.negativeCount, 2);
  for (const [name, statement, statuses] of cases) {
    const output = `I recommend the TrailAir Jacket for $80. ${statement}`;
    const r = await evaluate(input, output, api ? {prompt:a, claims:normalizeClaimAnalysis(claims(output), output)} : undefined);
    const verifications = r.verificationResult.records.filter(v => ['water_resistance','insulation'].includes(v.constraintAttribute));
    assert.deepEqual(verifications.map(v => v.status), statuses, name);
    for (const v of verifications) for (const e of v.claimEvidence) assert.ok(output.includes(e), name);
    assert.equal(r.finalEvaluationResult.finalVerdict, statuses.includes('FAIL') ? 'FAIL' : statuses.includes('UNKNOWN') ? 'INDETERMINATE' : 'PASS', name);
    assert.equal(r.verificationResult.productSummaries.P1.negativeConstraintsFailed, statuses.filter(s => s === 'FAIL').length);
    const rubric = r.rubricResult.productEvaluations.P1;
    assert.equal(rubric.hardGateState, statuses.includes('FAIL') ? 'HARD_GATE_FAIL' : statuses.includes('UNKNOWN') ? 'HARD_GATE_INDETERMINATE' : 'HARD_GATE_PASS');
    assert.ok(rubric.criteria.filter(c => c.polarity === 'negative').every(c => /exclude the prohibited/.test(c.description)));
    for (const v of verifications.filter(v => v.status === 'UNKNOWN' && v.conflictDetected)) assert.equal(v.claimEvidence.length, 2);
  }
});

for (const api of [false,true]) test(`positive requirements and negation scope: ${api ? 'API' : 'fallback'}`, async () => {
  for (const [phrase, statuses] of [
    ['must be waterproof and insulated', ['PASS','PASS']],
    ['must be waterproof or insulated', ['PASS','PASS']],
    ['must not be waterproof but must be insulated', ['FAIL','PASS']],
    ['must not be waterproof. It must be insulated', ['FAIL','PASS']],
  ] as Array<[string,string[]]>) {
    const input = `I need a jacket under $100. It ${phrase}.`;
    const output = 'I recommend the TrailAir Jacket for $80. It is waterproof and insulated.';
    const r = await evaluate(input, output, api ? {prompt:normalizePromptAnalysis(prompt(input),input),claims:normalizeClaimAnalysis(claims(output),output)} : undefined);
    assert.deepEqual(r.verificationResult.records.filter(v=>['water_resistance','insulation'].includes(v.constraintAttribute)).map(v=>v.status),statuses);
  }
});

for (const api of [false,true]) test(`product-specific evidence isolation: ${api ? 'API' : 'fallback'}`, async () => {
  const input = 'I need a jacket and a backpack under $100 each. Neither waterproof nor insulated.';
  const output = 'I recommend the TrailAir Jacket for $40. It is not waterproof or insulated.\nI recommend the Alpine Backpack for $50. It is waterproof and insulated.';
  const r = await evaluate(input,output,api ? {prompt:normalizePromptAnalysis(prompt(input),input),claims:normalizeClaimAnalysis(claims(output),output)} : undefined);
  assert.equal(r.claimAnalysis.products.length,2);
  for (const p of r.claimAnalysis.products) assert.deepEqual(r.verificationResult.records.filter(v=>v.productId===p.id && ['water_resistance','insulation'].includes(v.constraintAttribute)).map(v=>v.status), /Jacket/.test(p.name) ? ['PASS','PASS'] : ['FAIL','FAIL'], JSON.stringify({products:r.claimAnalysis.products.map(p=>({id:p.id,name:p.name})),claims:r.claimAnalysis.claims.filter(c=>/water|insul/.test(c.attribute))}));
  assert.equal(r.finalEvaluationResult.finalVerdict,'FAIL');
});

test('successful mocked API service corrects truncated positive constraints', async () => {
  const original = globalThis.fetch;
  const p = prompt(blockerPrompt);
  globalThis.fetch = async () => new Response(JSON.stringify({...p, constraints:[{id:'C1',attribute:'water_resistance',expectedValue:'waterproof',polarity:'positive',sourceText:'waterproof',constraintType:'hard',operator:'required'}]}),{status:200});
  try {
    const r = await analyzeUserPrompt(blockerPrompt);
    assert.deepEqual(r.constraints.filter(c=>['water_resistance','insulation'].includes(c.attribute)).map(c=>c.polarity), ['negative','negative']);
  } finally { globalThis.fetch = original; }
});

test('separate product requirements retain category and polarity', async () => {
  const input = 'I need a jacket and a backpack under $100 each. The jacket must not be waterproof or insulated. The backpack must be waterproof and insulated.';
  const output = '1. TrailAir Jacket - $40. It is not waterproof or insulated.\n2. Alpine Backpack - $50. It is waterproof and insulated.';
  const r = await evaluate(input,output);
  assert.equal(r.claimAnalysis.products.length,2);
  const features=r.promptAnalysis.constraints.filter(c=>['water_resistance','insulation'].includes(c.attribute));
  assert.deepEqual(features.map(c=>[c.targetProductCategory,c.polarity]), [['jacket','negative'],['jacket','negative'],['backpack','positive'],['backpack','positive']]);
  assert.deepEqual(r.verificationResult.records.filter(v=>['water_resistance','insulation'].includes(v.constraintAttribute)).map(v=>v.status), ['PASS','PASS','PASS','PASS']);
});
