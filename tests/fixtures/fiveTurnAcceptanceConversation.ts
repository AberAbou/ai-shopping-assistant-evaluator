export const fiveTurnAcceptanceTurns = [
  {
    id: 'T1',
    userPrompt: 'I need 1 lightweight waterproof jacket suitable for running, priced strictly under $90, and 1 pair of running shoes priced strictly under $110. My total cart budget is strictly under $180.',
    llmOutput: 'I recommend 1 RunShield lightweight waterproof running jacket for $80 and 1 pair of RunFlex running shoes for $95. The jacket is lightweight, waterproof, and designed for running. The shoes are designed for running. The cart total is $175.',
  },
  {
    id: 'T2',
    userPrompt: 'Increase the running shoes to 2 pairs. Keep the jacket, individual price limits, and total budget unchanged.',
    llmOutput: 'I recommend 1 RunShield lightweight waterproof running jacket for $80 and 2 pairs of RunFlex running shoes at $95 per pair. The jacket is lightweight, waterproof, and designed for running. The shoes are designed for running. The cart total is $270.',
  },
  {
    id: 'T3',
    userPrompt: 'Replace the waterproof jacket with 1 lightweight, breathable, non-waterproof jacket suitable for running. Increase my total cart budget to strictly under $280. Keep both pairs of running shoes and all individual price limits unchanged.',
    llmOutput: 'I recommend 1 AirFlow lightweight breathable running jacket for $85 and 2 pairs of RunFlex running shoes at $95 per pair. The jacket is lightweight, breathable, not waterproof, and designed for running. The shoes are designed for running. The cart total is $275.',
  },
  {
    id: 'T4',
    userPrompt: 'The running shoes must now cost strictly under $90 per pair. Keep 2 pairs of shoes, the same jacket requirements, the jacket price limit, and the total cart budget unchanged.',
    llmOutput: 'I recommend 1 AirFlow lightweight breathable running jacket for $85 and 2 pairs of RunFlex running shoes at $89 per pair. The jacket is lightweight, breathable, not waterproof, and designed for running. The shoes are designed for running. The cart total is $263.',
  },
  {
    id: 'T5',
    userPrompt: 'Confirm my final cart, including all quantities, unit prices, and the total. Keep all my latest requirements unchanged.',
    llmOutput: 'Your final cart contains 1 AirFlow lightweight breathable running jacket for $85 and 2 pairs of RunFlex running shoes at $89 per pair. The jacket is lightweight, breathable, not waterproof, and designed for running. The shoes are designed for running. Your final cart total is $253.',
  },
];
