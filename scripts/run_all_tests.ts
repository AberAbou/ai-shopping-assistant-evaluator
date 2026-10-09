import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
const tsx = fileURLToPath(import.meta.resolve('tsx/cli'));
const suites = ['scripts/run_regression_tests.ts', 'test_checkpoint9_fix.ts', 'scripts/test_checkpoint10.ts', 'scripts/test_checkpoint14_hardening.ts', 'scripts/test_checkpoint14b_professional_report.ts', 'scripts/test_checkpoint14b1_dual_reports.ts', 'scripts/test_checkpoint14b3_exclusion_extraction.ts'];
let failures = 0;
mkdirSync('regression-results', { recursive: true });
function run(suite: string, args: string[]) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(`regression-results/${suite.split('/').pop()}.log`, output);
  console.log(`${suite}: ${result.status === 0 ? 'PASS' : 'FAIL'}`);
  console.log(output.split('\n').filter(line => /SUMMARY|passed|failed|Scenarios (Passed|Failed)|Assertions (Passed|Failed)|# (pass|fail)|ALL.*PASSED|>>> TEST.*PASSED/.test(line)).join('\n'));
  if (result.status !== 0) { failures++; console.error(output.slice(-8000)); }
}
for (const suite of suites) {
  run(suite, [tsx, suite]);
}
for (const suite of ['scripts/test_checkpoint14b2a_price_boundaries.mjs', 'scripts/test_checkpoint14b2b_price_verification.mjs']) {
  run(suite, [suite]);
}
run('scripts/test_checkpoint14c1_shopping_cart.ts', [tsx, '--test', 'scripts/test_checkpoint14c1_shopping_cart.ts']);
run('scripts/test_checkpoint14c1_review.ts', [tsx, '--test', 'scripts/test_checkpoint14c1_review.ts']);
run('scripts/test_checkpoint14c1_third_review.ts', [tsx, '--test', 'scripts/test_checkpoint14c1_third_review.ts']);
run('scripts/test_checkpoint14c1_collective.ts', [tsx, '--test', 'scripts/test_checkpoint14c1_collective.ts']);
run('scripts/test_checkpoint14c1_soft_budget.ts', [tsx, '--test', 'scripts/test_checkpoint14c1_soft_budget.ts']);
run('scripts/test_checkpoint14c2_reporting.ts', [tsx, '--test', 'scripts/test_checkpoint14c2_reporting.ts']);
run('scripts/test_checkpoint14c3_conversation.ts', [tsx, '--test', 'scripts/test_checkpoint14c3_conversation.ts']);
run('scripts/test_issue6_negated_properties.ts', [tsx, '--test', 'scripts/test_issue6_negated_properties.ts']);
console.log(`All-suite runner: ${17 - failures}/17 commands passed, ${failures} failed.`);
process.exitCode = failures ? 1 : 0;
