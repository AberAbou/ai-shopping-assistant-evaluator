import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const root = new URL('../src/services/evaluation/', import.meta.url);
const prompt = readFileSync(new URL('fallbackPromptAnalyzer.ts', root), 'utf8');
const verifier = readFileSync(new URL('fallbackVerificationEngine.ts', root), 'utf8');
assert.match(prompt, /\btest\(source\) \? '<' : '<='/);
assert.match(prompt, /under\|below\|less than/);
const section = verifier.match(/const comparison: Record<string, \{ matches: boolean; boundary: string \}> = \{[\s\S]*?\n              \};/);
assert.ok(section, 'operator-based verifier must exist');
const expr = section[0].replace('const comparison: Record<string, { matches: boolean; boundary: string }> =', 'const comparison =');
let checked = 2;
for (const [op, price, bound, expected] of [
  ['<',24.99,25,true],['<',25,25,false],['<',32,25,false],
  ['<=',25,25,true],['<=',32,25,false],['>',25,25,false],
  ['>',25.01,25,true],['>=',25,25,true],['>=',24.99,25,false],
  ['less_than',25,25,false],['less_than_or_equal',25,25,true],
  ['greater_than',25,25,false],['greater_than_or_equal',25,25,true],
  ['==',25,25,true],['==',24.99,25,false],
]) {
  const result=runInNewContext(`${expr}\ncomparison[${JSON.stringify(op)}].matches`,{statedPrice:price,maxAllowed:bound});
  assert.equal(result,expected,`${op} ${price} vs ${bound}`); checked++;
}
assert.match(verifier,/Unsupported price comparison operator/);checked++;
assert.match(verifier,/status = 'UNKNOWN'/);checked++;
console.log(`${checked}/${checked} focused price-extraction and verification checks passed`);
