import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../src/services/evaluation/recommendationEngine.ts', import.meta.url), 'utf8');
const match = source.match(/export function describePriceBoundary\([\s\S]*?\n}\n/);
assert.ok(match, 'price-boundary helper exists');
const describe = runInNewContext(`${match[0].replace('export ', '').replace('operator: string | undefined, sourceText: string, amount: string', 'operator, sourceText, amount')}\ndescribePriceBoundary`, {});
const cases = [
  ['<=', 'under $25', 'strictly below $25'],
  ['less_than', 'below $25', 'strictly below $25'],
  ['<', 'less than $25', 'strictly below $25'],
  ['<=', 'at most $25', 'at or below $25'],
  ['<=', 'up to $25', 'at or below $25'],
  ['>', 'over $25', 'strictly above $25'],
  ['>=', 'at least $25', 'at or above $25'],
  ['less_than', '', 'strictly below $25'],
  ['less_than_or_equal', '', 'at or below $25'],
  ['greater_than', '', 'strictly above $25'],
  ['greater_than_or_equal', '', 'at or above $25'],
  ['equals', '', null],
];
for (const [op, sourceText, expected] of cases) assert.equal(describe(op, sourceText, '$25'), expected);
assert.ok(source.includes('const boundary = describePriceBoundary('));
assert.ok(!source.includes('whose stated price is at or below ${ceilingStr}'));
console.log(`${cases.length + 2}/${cases.length + 2} price-boundary checks passed`);
