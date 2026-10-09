// Verbatim transcript from PR #9 review 5473237472.
export const pr9ExactReplacementTurns=[
  {id:'T1',userPrompt:'I need 1 waterproof running jacket and 1 pair of running shoes. Each product must cost under $100.',llmOutput:'I recommend 1 TrailGuard waterproof running jacket for $80 and 1 pair of RunFlex running shoes for $70. The jacket is waterproof and designed for running, and the shoes are designed for running.'},
  {id:'T2',userPrompt:'Replace the waterproof running jacket with 1 breathable, non-waterproof running jacket. Keep the running shoes and the original per-product budget unchanged.',llmOutput:'I recommend 1 TrailGuard waterproof running jacket for $80 and 1 pair of RunFlex running shoes for $70. The jacket is waterproof and designed for running, and the shoes are designed for running.'},
  {id:'T3',userPrompt:'Please correct the jacket recommendation to satisfy my latest requirements. Keep the same running shoes.',llmOutput:'I recommend 1 AirFlow breathable running jacket for $85 and 1 pair of RunFlex running shoes for $70. The AirFlow jacket is breathable, not waterproof, and designed for running. The RunFlex shoes are designed for running.'},
];
