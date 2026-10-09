import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { analyzeUserPromptDeterministically as prompt } from '../../src/services/evaluation/fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as claims } from '../../src/services/evaluation/fallbackClaimAnalyzer';

const request = '2 shirts and 1 pair of shorts; total budget strictly under $85';
const valid = 'I recommend 2 running shirts at $20 each and 1 pair of running shorts at $40 each. Total: $80.';
const invalid = valid.replace('$20', '$25').replace('$80', '$90');
const cases: Array<[string, string, string, string, boolean]> = [
  ['valid cart', request, valid, 'PASS', true],
  ['false PASS: quantity arithmetic', request, invalid, 'FAIL', true],
  ['false PASS: strict boundary', request, valid.replace('$20', '$22.50').replace('$80', '$85'), 'FAIL', true],
  ['conflicting total', request, valid.replace('$80', '$60'), 'INDETERMINATE', true],
  ['review: currency-free total is unresolved', request, valid.replace('Total: $80.', 'Total: 60.'), 'INDETERMINATE', true],
  ['review: foreign stated total is unresolved', request, valid.replace('Total: $80.', 'Total: €80.'), 'INDETERMINATE', true],
  ['review: ranged total is unresolved', request, valid.replace('Total: $80.', 'Total: $80 or $90.'), 'INDETERMINATE', true],
  ['review: unit-price request does not create budgets', '2 shirts at $20 each and 1 pair of shorts for $40 each; total budget under $85', valid, 'PASS', true],
  ['review: adjacent item and cart budgets', '2 shirts under $25 each; total budget under $85; 1 pair of shorts under $45 each', valid, 'PASS', true],
  ['third review: color choices preserve combined budget', 'Buy 2 shirts and 1 pair of shorts, either red or blue; total budget under $85', invalid, 'FAIL', true],
  ['third review: color choice before the second item', 'Buy 2 shirts in red or blue and 1 pair of shorts; total budget under $85', invalid, 'FAIL', true],
  ['third review: optional feature clause preserves combined budget', 'Buy 2 shirts and shorts; if possible make them breathable; total budget under $85', invalid, 'FAIL', true],
  ['third review: inclusive qualifier total unresolved', request, valid.replace('Total: $80.', 'Total: $80, including all items.'), 'INDETERMINATE', true],
  ['third review: tax qualifier total unresolved', request, valid.replace('Total: $80.', 'Total: $80 (before tax).'), 'INDETERMINATE', true],
  ['third review: currency-free budget', 'Buy 2 shirts and 1 pair of shorts; max 85', valid, 'INDETERMINATE', true],
  ['third review: budget before items', 'budget under $85 for 2 shirts and shorts', invalid, 'FAIL', true],
  ['third review: API EUR currency', 'a jacket under $100', 'I recommend Trail Jacket for €90.', 'INDETERMINATE', false],
  ['third review: API USD label conflicts with EUR source', 'a jacket under $100', 'I recommend Trail Jacket for €90.', 'INDETERMINATE', false],
  ['unknown quantities', request, valid.replace('2 running', 'running').replace('1 pair of ', ''), 'INDETERMINATE', true],
  ['alternatives', 'a jacket under $100', 'Two options: Trail Jacket ($60) is waterproof. Rain Jacket ($70) is waterproof.', 'PASS', false],
  ['leather exclusion failure', 'running shoes without leather under $120', 'I recommend genuine leather running shoes for $99.', 'FAIL', false],
  ['synthetic upper cannot prove leather exclusion or running suitability', 'running shoes without leather under $120', 'I recommend City Sneakers for $99. They have a synthetic mesh upper.', 'INDETERMINATE', false],
  ['wrong requested quantity', request, valid.replace('2 running', '1 running').replace('$80', '$60'), 'FAIL', true],
  ['inclusive boundary', request.replace('strictly under $85', 'up to $80'), valid, 'PASS', true],
  ['optional budget', request.replace('total budget strictly under $85', 'ideally total budget under $70'), valid, 'PASS', true],
  ['quantity list', request, '1. 2 Running Shirts - $20 each\n2. 1 pair of Running Shorts - $40 each\nTotal: $80.', 'PASS', true],
  ['scoped exclusion preserves shirt', '1 leather-free running shoe and 1 shirt; total budget under $120', 'I recommend 1 running shoe at $60 each. It is 100% leather-free and suitable for running.\n1 shirt at $20 each. It has genuine leather trim.', 'PASS', true],
  ['optional unknown price still allows mandatory item PASS', request.replace('total budget strictly under $85', 'ideally total budget under $85'), 'I recommend 2 shirts and 1 pair of shorts.', 'PASS', true],
];
for (const [name, input, output, verdict, cart] of cases) test(name, async ({ page }) => {
  let calls = 0;
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/analyze-*', async route => {
    calls++;
    // Emulate old API payloads without the new metadata; the client must reconcile them.
    const payload = route.request().url().includes('analyze-prompt') ? prompt(input) : claims(output);
    if ('products' in payload && name.startsWith('third review: API')) {
      payload.products[0].name = 'Trail Jacket';
      payload.products[0].price = {amount:90, currency:name.includes('USD label') ? 'USD' : 'EUR', sourceText:output};
    }
    if ('products' in payload) payload.products.forEach(p => { delete p.parsedQuantity; delete p.unitPrice; delete p.lineTotal; });
    else payload.constraints.forEach(c => { delete c.scope; delete c.targetProductCategory; });
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(payload) });
  });
  await page.goto('/');
  await page.locator('textarea').nth(0).fill(input);
  await page.locator('textarea').nth(1).fill(output);
  await page.getByRole('button', { name:'RUN EVALUATION', exact:true }).click();
  await expect(page.getByRole('button', { name:'RUN EVALUATION', exact:true })).toBeEnabled({ timeout:20000 });
  await page.getByRole('button', { name:/8\. Final Evaluation/ }).click();
  if (cart) await expect(page.getByRole('heading', { name:'Shopping Cart Evaluation & Combined Budget', exact:true })).toBeVisible();
  else await expect(page.getByRole('heading', { name:'Shopping Cart Evaluation & Combined Budget', exact:true })).toHaveCount(0);
  await page.getByRole('button', { name:/10\. Report & Export/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name:'Export JSON', exact:true }).click();
  const download = await downloadPromise;
  const json = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(json.finalVerdict).toBe(verdict);
  expect(Boolean(json.cartEvaluation)).toBe(cart);
  if (cart) {
    await page.getByRole('button', { name:'Detailed Report', exact:true }).click();
    await expect(page.getByText(/Cart assessment:/).last()).toBeVisible();
    expect(json.cartEvaluation.cartHardGateState).toBe(`HARD_GATE_${verdict === 'INDETERMINATE' ? 'INDETERMINATE' : verdict}`);
    if (name === 'wrong requested quantity') expect(json.cartEvaluation.verifications.find((v: any) => v.constraintAttribute === 'cart_items').status).toBe('FAIL');
    if (name.includes('unresolved')) {
      expect(json.cartEvaluation.ambiguousStatedTotal).toBe(true);
      expect(json.cartEvaluation.effectiveCartTotal).toBeNull();
      await expect(page.getByText(/Stated total has ambiguous amount or unsupported currency/).first()).toBeVisible();
    }
  }
  expect(calls).toBe(2);
  expect(pageErrors).toEqual([]);
});

test('unavailable API falls back without model calls', async ({ page }) => {
  await page.route('**/api/analyze-*', route => route.fulfill({ status:503, body:'offline' }));
  await page.goto('/');
  await page.locator('textarea').nth(0).fill(request);
  await page.locator('textarea').nth(1).fill(invalid);
  await page.getByRole('button', { name:'RUN EVALUATION', exact:true }).click();
  await expect(page.getByRole('button', { name:'RUN EVALUATION', exact:true })).toBeEnabled();
  await page.getByRole('button', { name:/10\. Report & Export/ }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name:'Export JSON', exact:true }).click();
  const download = await pending;
  expect(JSON.parse(await readFile((await download.path())!, 'utf8')).finalVerdict).toBe('FAIL');
});
