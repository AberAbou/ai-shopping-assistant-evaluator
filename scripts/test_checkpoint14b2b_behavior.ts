import assert from 'node:assert/strict';
import { analyzeUserPromptDeterministically as analyze } from '../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as extract } from '../src/services/evaluation/fallbackClaimAnalyzer';
import { verifyProductConstraintsDeterministically as verify } from '../src/services/evaluation/fallbackVerificationEngine';
import type { AtomicConstraint, ConstraintOperator } from '../src/types/evaluation';
let checked = 0;
for (const phrase of ['under', 'below', 'less than']) {
  assert.equal(analyze(`a jacket ${phrase} $25`).constraints.find(c => c.attribute === 'price')!.operator, '<'); checked++;
}
for (const [op, price, bound, expected] of [
  ['<',24.99,25,'PASS'],['<',25,25,'FAIL'],['<',32,25,'FAIL'],
  ['<=',25,25,'PASS'],['<=',32,25,'FAIL'],['>',25,25,'FAIL'],
  ['>',25.01,25,'PASS'],['>=',25,25,'PASS'],['>=',24.99,25,'FAIL'],
  ['less_than',25,25,'FAIL'],['less_than_or_equal',25,25,'PASS'],
  ['greater_than',25,25,'FAIL'],['greater_than_or_equal',25,25,'PASS'],
  ['==',25,25,'PASS'],['==',24.99,25,'FAIL'],
] as const) {
  const constraint: AtomicConstraint = { id:'C1', attribute:'price', operator:op, expectedValue:bound, constraintType:'hard', polarity:'positive', sourceText:`${op} $${bound}`, confidence:1 };
  const extracted = extract(`I recommend Test Jacket for $${price}.`);
  assert.equal(verify([constraint], extracted.products, extracted.claims).records[0].status, expected, `${op}: ${price} versus ${bound}`); checked++;
}
const unsupported: AtomicConstraint = { id:'C1', attribute:'price', operator:'contains', expectedValue:25, constraintType:'hard', polarity:'positive', sourceText:'$25', confidence:1 };
const stated = extract('I recommend Test Jacket for $20.');
assert.equal(verify([unsupported], stated.products, stated.claims).records[0].status, 'UNKNOWN'); checked++;
const missing = extract('I recommend Test Jacket.');
assert.equal(verify([{ ...unsupported, operator:'<' as ConstraintOperator }], missing.products, missing.claims).records[0].status, 'UNKNOWN'); checked++;
console.log(`${checked}/${checked} behavioral price-extraction and verification checks passed`);
