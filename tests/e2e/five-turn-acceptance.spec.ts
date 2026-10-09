import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fiveTurnAcceptanceTurns } from '../fixtures/fiveTurnAcceptanceConversation';

async function evaluate(page: Page, turns = fiveTurnAcceptanceTurns) {
  await page.route('**/api/analyze-*', () => { throw new Error('Acceptance test must remain offline.'); });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as any).plainCopy = text; } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  for (const [i, turn] of turns.entries()) {
    if (i) await page.getByRole('button', { name: 'Add turn', exact: true }).click();
    await page.getByRole('textbox', { name: `User turn ${i + 1}`, exact: true }).fill(turn.userPrompt);
    await page.getByRole('textbox', { name: `Assistant turn ${i + 1}`, exact: true }).fill(turn.llmOutput);
  }
  await page.getByRole('button', { name: 'Evaluate conversation', exact: true }).click();
  await expect(page.getByTestId('conversation-verdict')).toBeVisible();
}

async function exported(page: Page) {
  if (!await page.getByRole('button', { name: 'Export JSON', exact: true }).isVisible()) {
    await page.getByRole('button', { name: /10\. Report & Export/ }).click();
  }
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
}

test('Five-turn acceptance: exact UI verdicts, totals, and per-turn progression', async ({ page }) => {
  await evaluate(page, fiveTurnAcceptanceTurns);

  const expectedVerdicts = ['PASS', 'FAIL', 'PASS', 'PASS', 'INDETERMINATE'];

  for (const [i, status] of expectedVerdicts.entries()) {
    await page.getByRole('combobox', { name: 'Evaluated turn' }).selectOption(String(i));
    await expect(page.getByTestId('conversation-verdict')).toHaveText(`Turn T${i + 1}: ${status}`);

    const json = await exported(page);
    expect(json.finalVerdict).toBe(status);

    if (i === 0) {
      expect(json.cartEvaluation.calculatedCartTotal).toBe(175);
      expect(json.cartEvaluation.statedCartTotal).toBe(175);
      const c = json.rawUpstreamArtifacts.promptAnalysis.constraints;
      const jacketPrice = c.find((x: any) => x.attribute === 'price' && x.targetProductCategory === 'jacket');
      expect(jacketPrice.scope).toBe('product');
      expect(jacketPrice.expectedValue).toBe(90);
      const shoePrice = c.find((x: any) => x.attribute === 'price' && x.targetProductCategory === 'running shoes');
      expect(shoePrice.scope).toBe('product');
      expect(shoePrice.expectedValue).toBe(110);
      const cartBudget = c.find((x: any) => x.attribute === 'cart_total_price');
      expect(cartBudget.scope).toBe('cart');
      expect(cartBudget.expectedValue).toBe(180);
    } else if (i === 1) {
      expect(json.cartEvaluation.calculatedCartTotal).toBe(270);
      expect(json.cartEvaluation.statedCartTotal).toBe(270);
      expect(json.cartEvaluation.cartHardGateState).toBe('HARD_GATE_FAIL');
    } else if (i === 2) {
      expect(json.cartEvaluation.calculatedCartTotal).toBe(275);
      expect(json.cartEvaluation.statedCartTotal).toBe(275);
      const c = json.rawUpstreamArtifacts.promptAnalysis.constraints;
      const waterproof = c.find((x: any) => x.attribute === 'water_resistance' && x.targetProductCategory === 'jacket');
      expect(waterproof.polarity).toBe('negative');
    } else if (i === 3) {
      expect(json.cartEvaluation.calculatedCartTotal).toBe(263);
      expect(json.cartEvaluation.statedCartTotal).toBe(263);
      const c = json.rawUpstreamArtifacts.promptAnalysis.constraints;
      const jacketQty = c.find((x: any) => x.attribute === 'quantity' && x.targetProductCategory === 'jacket');
      expect(jacketQty.expectedValue).toBe(1);
      const shoeQty = c.find((x: any) => x.attribute === 'quantity' && x.targetProductCategory === 'running shoes');
      expect(shoeQty.expectedValue).toBe(2);
      const shoePrice = c.find((x: any) => x.attribute === 'price' && x.targetProductCategory === 'running shoes');
      expect(shoePrice.expectedValue).toBe(90);
    } else if (i === 4) {
      expect(json.cartEvaluation.calculatedCartTotal).toBe(263);
      expect(json.cartEvaluation.statedCartTotal).toBe(253);
      expect(json.cartEvaluation.totalDisagreement).toBe(true);
      expect(json.inputs.conversation.unresolved).toHaveLength(0);
      const c = json.rawUpstreamArtifacts.promptAnalysis.constraints;
      expect(c.some((x: any) => x.attribute === 'conversation_issue')).toBe(false);
    }
  }
});
