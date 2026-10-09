// Targeted reproduction of the reported replacement semantics, with an
// additional product to assert retained requirement and evidence isolation.
export const jacketReplacementTurns=[
  {id:'T1',userPrompt:'I need 1 lightweight waterproof jacket and 1 pair of running shorts. My total budget must be under $120. All items must be suitable for running.',llmOutput:'I recommend 1 lightweight waterproof RainFit jacket at $60 and 1 pair of RunFit running shorts at $30. All items are designed for running. The total is $90.'},
  {id:'T2',userPrompt:'Replace the waterproof jacket with 1 breathable, non-waterproof jacket. Keep the shorts and my original budget unchanged.',llmOutput:'I recommend 1 lightweight breathable non-waterproof TrailAir jacket at $60 and 1 pair of RunFit running shorts at $30. All items are designed for running. The total is $90.'},
  {id:'T3',userPrompt:'Please confirm the final shopping cart, quantities, individual prices, and total.',llmOutput:'Your final cart contains 1 lightweight breathable non-waterproof TrailAir jacket at $60 and 1 pair of RunFit running shorts at $30. All items are designed for running. The total is $90.'},
];
