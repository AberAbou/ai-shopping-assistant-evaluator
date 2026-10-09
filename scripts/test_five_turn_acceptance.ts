import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateConversation } from '../src/services/evaluation/conversationEvaluation';
import { shoppingConstraints, cartRequest } from '../src/services/evaluation/shoppingCartSemantics';
import { fiveTurnAcceptanceTurns } from '../tests/fixtures/fiveTurnAcceptanceConversation';

test('Five-turn acceptance transcript: exact progression and verdicts', async () => {
  const results = await evaluateConversation(fiveTurnAcceptanceTurns);
  assert.equal(results.length, 5);

  // Turn 1
  const t1 = results[0];
  assert.equal(t1.finalEvaluationResult.finalVerdict, 'PASS');
  assert.equal(t1.finalEvaluationResult.summary.cartHardGateState, 'HARD_GATE_PASS');
  assert.equal(t1.verificationResult!.cartEvaluation?.calculatedCartTotal, 175);
  assert.equal(t1.verificationResult!.cartEvaluation?.statedCartTotal, 175);
  const t1Constraints = t1.promptAnalysis!.constraints;
  const t1JacketPrice = t1Constraints.find(c => c.attribute === 'price' && c.targetProductCategory === 'jacket');
  assert.ok(t1JacketPrice, 'Jacket price constraint must be product-scoped for jacket');
  assert.equal(t1JacketPrice.operator, '<');
  assert.equal(t1JacketPrice.expectedValue, 90);
  const t1ShoePrice = t1Constraints.find(c => c.attribute === 'price' && c.targetProductCategory === 'running shoes');
  assert.ok(t1ShoePrice, 'Shoe price constraint must be product-scoped for running shoes');
  assert.equal(t1ShoePrice.operator, '<');
  assert.equal(t1ShoePrice.expectedValue, 110);
  const t1CartBudget = t1Constraints.find(c => c.attribute === 'cart_total_price');
  assert.ok(t1CartBudget, 'Cart budget must be cart-scoped');
  assert.equal(t1CartBudget.scope, 'cart');
  assert.equal(t1CartBudget.expectedValue, 180);

  // Turn 2
  const t2 = results[1];
  assert.equal(t2.finalEvaluationResult.finalVerdict, 'FAIL');
  assert.equal(t2.finalEvaluationResult.summary.cartHardGateState, 'HARD_GATE_FAIL');
  assert.equal(t2.verificationResult!.cartEvaluation?.calculatedCartTotal, 270);
  assert.equal(t2.verificationResult!.cartEvaluation?.statedCartTotal, 270);
  // Individual limits still pass, cart fails
  const t2CartVerif = t2.verificationResult!.records.find(v => v.constraintAttribute === 'cart_total_price');
  assert.ok(t2CartVerif);
  assert.equal(t2CartVerif.status, 'FAIL');
  const t2ShoeVerif = t2.verificationResult!.records.find(v => v.constraintAttribute === 'price' && v.productId === 'P2');
  assert.ok(t2ShoeVerif);
  assert.equal(t2ShoeVerif.status, 'PASS');

  // Turn 3
  const t3 = results[2];
  assert.equal(t3.finalEvaluationResult.finalVerdict, 'PASS');
  assert.equal(t3.finalEvaluationResult.summary.cartHardGateState, 'HARD_GATE_PASS');
  assert.equal(t3.verificationResult!.cartEvaluation?.calculatedCartTotal, 275);
  assert.equal(t3.verificationResult!.cartEvaluation?.statedCartTotal, 275);
  const t3Waterproof = t3.promptAnalysis!.constraints.find(c => c.attribute === 'water_resistance' && c.targetProductCategory === 'jacket');
  assert.ok(t3Waterproof);
  assert.equal(t3Waterproof.polarity, 'negative');

  // Turn 4
  const t4 = results[3];
  assert.equal(t4.finalEvaluationResult.finalVerdict, 'PASS');
  assert.equal(t4.finalEvaluationResult.summary.cartHardGateState, 'HARD_GATE_PASS');
  assert.equal(t4.verificationResult!.cartEvaluation?.calculatedCartTotal, 263);
  assert.equal(t4.verificationResult!.cartEvaluation?.statedCartTotal, 263);
  const t4JacketQty = t4.promptAnalysis!.constraints.find(c => c.attribute === 'quantity' && c.targetProductCategory === 'jacket');
  assert.ok(t4JacketQty);
  assert.equal(t4JacketQty.expectedValue, 1, 'Jacket quantity must remain 1');
  const t4ShoeQty = t4.promptAnalysis!.constraints.find(c => c.attribute === 'quantity' && c.targetProductCategory === 'running shoes');
  assert.ok(t4ShoeQty);
  assert.equal(t4ShoeQty.expectedValue, 2, 'Shoe quantity must remain 2');
  const t4ShoePrice = t4.promptAnalysis!.constraints.find(c => c.attribute === 'price' && c.targetProductCategory === 'running shoes');
  assert.ok(t4ShoePrice);
  assert.equal(t4ShoePrice.expectedValue, 90, 'Shoe price limit revised to strictly under $90');

  // Turn 5
  const t5 = results[4];
  assert.equal(t5.finalEvaluationResult.finalVerdict, 'INDETERMINATE');
  assert.equal(t5.finalEvaluationResult.summary.cartHardGateState, 'HARD_GATE_INDETERMINATE');
  assert.equal(t5.verificationResult!.cartEvaluation?.calculatedCartTotal, 263);
  assert.equal(t5.verificationResult!.cartEvaluation?.statedCartTotal, 253);
  assert.equal(t5.verificationResult!.cartEvaluation?.totalDisagreement, true);
  assert.equal(t5.inputs.conversation.unresolved.length, 0, 'No spurious unresolved clarification issues');
  const t5Issues = t5.promptAnalysis!.constraints.filter(c => c.attribute === 'conversation_issue');
  assert.equal(t5Issues.length, 0, 'No spurious conversation_issue constraints');
});

test('Defect 1: Compound initial requests properly isolate per-product budgets vs cart budget', () => {
  const input = 'I need 1 lightweight waterproof jacket suitable for running, priced strictly under $90, and 1 pair of running shoes priced strictly under $110. My total cart budget is strictly under $180.';
  const constraints = shoppingConstraints(input);
  const jacketPrice = constraints.find(c => c.attribute === 'price' && c.targetProductCategory === 'jacket');
  assert.ok(jacketPrice);
  assert.equal(jacketPrice.scope, 'product');
  assert.equal(jacketPrice.expectedValue, 90);

  const shoePrice = constraints.find(c => c.attribute === 'price' && c.targetProductCategory === 'running shoes');
  assert.ok(shoePrice);
  assert.equal(shoePrice.scope, 'product');
  assert.equal(shoePrice.expectedValue, 110);

  const cartBudget = constraints.find(c => c.attribute === 'cart_total_price');
  assert.ok(cartBudget);
  assert.equal(cartBudget.scope, 'cart');
  assert.equal(cartBudget.expectedValue, 180);
});

test('Defect 2: Quantity retention language does not invent multi-product quantity confusion', () => {
  const text = 'The running shoes must now cost strictly under $90 per pair. Keep 2 pairs of shoes, the same jacket requirements, the jacket price limit, and the total cart budget unchanged.';
  const req = cartRequest(text);
  const shoeItem = req.items.find(i => i.category === 'running shoes');
  assert.ok(shoeItem);
  assert.equal(shoeItem.quantity, 2);

  const jacketItem = req.items.find(i => i.category === 'jacket');
  assert.ok(jacketItem);
  assert.equal(jacketItem.quantity, null, 'Jacket quantity in clause must not copy shoes count');
  assert.equal(jacketItem.hasInvalidQuantity, false);
});

test('Defect 3: Confirmation follow-up preserves latest requirements without spurious constraints', async () => {
  const turns = [
    fiveTurnAcceptanceTurns[0],
    fiveTurnAcceptanceTurns[3], // T4 state with active requirements
    fiveTurnAcceptanceTurns[4], // T5 confirmation
  ];
  const results = await evaluateConversation(turns);
  const finalTurn = results[results.length - 1];
  assert.equal(finalTurn.inputs.conversation.unresolved.length, 0);
  assert.equal(finalTurn.promptAnalysis!.constraints.some(c => c.attribute === 'conversation_issue'), false);
  assert.equal(finalTurn.verificationResult!.cartEvaluation?.calculatedCartTotal, 263);
  assert.equal(finalTurn.verificationResult!.cartEvaluation?.statedCartTotal, 253);
});

test('Adversarial 1: Punctuation and phrasing variants for compound product & cart budgets', () => {
  const variants = [
    '1 jacket (under $90) and 1 pair of shoes (under $110); cart total under $180',
    '1 jacket, priced under $90, plus 1 pair of shoes, priced under $110. Total budget under $180.',
    'Under $90 for 1 jacket and under $110 for 1 pair of shoes. Cart budget under $180.',
  ];
  for (const v of variants) {
    const c = shoppingConstraints(v);
    const jacket = c.find(x => x.targetProductCategory === 'jacket');
    assert.ok(jacket, `Jacket price found in ${v}`);
    assert.equal(jacket.scope, 'product');
    assert.equal(jacket.expectedValue, 90);

    const shoes = c.find(x => x.targetProductCategory === 'running shoes');
    assert.ok(shoes, `Shoes price found in ${v}`);
    assert.equal(shoes.scope, 'product');
    assert.equal(shoes.expectedValue, 110);

    const cart = c.find(x => x.scope === 'cart' && x.attribute === 'cart_total_price');
    assert.ok(cart, `Cart total found in ${v}`);
    assert.equal(cart.expectedValue, 180);
  }
});

test('Adversarial 2: Retention does not invent quantity from preceding noun counts', () => {
  const text = 'Keep 3 pairs of socks, the same running shoes, and the same jacket unchanged.';
  const req = cartRequest(text);
  const socks = req.items.find(i => i.category === 'socks');
  assert.ok(socks);
  assert.equal(socks.quantity, 3);
  const shoes = req.items.find(i => i.category === 'running shoes');
  assert.equal(shoes?.quantity, null);
  const jacket = req.items.find(i => i.category === 'jacket');
  assert.equal(jacket?.quantity, null);
});

test('Adversarial 3: Confirmation turn with explicit new constraint is NOT ignored', async () => {
  const turns = [
    fiveTurnAcceptanceTurns[0],
    {
      id: 'T2',
      userPrompt: 'Confirm my final cart. My total budget must now be strictly under $150.',
      llmOutput: fiveTurnAcceptanceTurns[0].llmOutput, // total $175
    },
  ];
  const results = await evaluateConversation(turns);
  const t2 = results[1];
  assert.equal(t2.finalEvaluationResult.finalVerdict, 'FAIL');
  const budgetC = t2.promptAnalysis!.constraints.find(c => c.attribute === 'cart_total_price' && c.expectedValue === 150);
  assert.ok(budgetC, 'Explicit new constraint in confirmation turn must be captured');
});
