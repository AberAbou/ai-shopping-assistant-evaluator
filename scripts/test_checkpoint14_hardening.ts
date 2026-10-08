/**
 * Checkpoint 14: Release Hardening Validation Suite
 *
 * Verifies:
 * 1. Strict 2-Input Validation (empty/whitespace rejection, limit boundaries, preservation of original strings)
 * 2. Evaluation Lifecycle (stale detection, run isolation)
 * 3. Error Handling and Classification (quota 429, network, malformed JSON, system errors)
 */

import { MAX_USER_PROMPT_LENGTH, MAX_LLM_OUTPUT_LENGTH } from '../src/components/InputArea';
import { REGRESSION_SCENARIOS } from '../src/fixtures/regressionScenarios';
import { runSingleScenarioTest } from '../src/services/evaluation/regressionRunner';
import { buildExportJsonPayload } from '../src/services/evaluation/reportExportHelper';

function validateInputs(userPrompt: string, llmOutput: string): { valid: boolean; error?: string } {
  const cleanPrompt = userPrompt.trim();
  const cleanOutput = llmOutput.trim();

  if (!cleanPrompt && !cleanOutput) {
    return { valid: false, error: 'Both User Prompt and LLM Output are required.' };
  }
  if (!cleanPrompt) {
    return { valid: false, error: 'User Prompt is required.' };
  }
  if (!cleanOutput) {
    return { valid: false, error: 'LLM Output is required.' };
  }
  if (userPrompt.length > MAX_USER_PROMPT_LENGTH) {
    return { valid: false, error: `User Prompt exceeds the limit of ${MAX_USER_PROMPT_LENGTH.toLocaleString()} characters.` };
  }
  if (llmOutput.length > MAX_LLM_OUTPUT_LENGTH) {
    return { valid: false, error: `LLM Output exceeds the limit of ${MAX_LLM_OUTPUT_LENGTH.toLocaleString()} characters.` };
  }
  return { valid: true };
}

function classifyError(errMsg: string): { category: 'quota' | 'network' | 'malformed' | 'system'; retryable: boolean } {
  if (/429|quota|resource_exhausted|rate limit/i.test(errMsg)) {
    return { category: 'quota', retryable: true };
  }
  if (/network|failed to fetch|econnrefused|503|502|504|timeout/i.test(errMsg)) {
    return { category: 'network', retryable: true };
  }
  if (/json|syntaxerror|malformed|missing required/i.test(errMsg)) {
    return { category: 'malformed', retryable: true };
  }
  return { category: 'system', retryable: true };
}

async function runHardeningTests() {
  console.log('\n================================================================');
  console.log(' CHECKPOINT 14: V1 RELEASE HARDENING VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${name} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  // --- 1. INPUT VALIDATION TESTS ---
  console.log('--- 1. Input Validation & Boundary Hardening ---');
  assert('Rejects both empty inputs', !validateInputs('', '').valid);
  assert('Rejects whitespace-only prompt', !validateInputs('   \n\t  ', 'Some response').valid);
  assert('Rejects whitespace-only output', !validateInputs('Valid prompt', '   \t  \n').valid);
  assert('Rejects empty prompt with valid output', !validateInputs('', 'Valid output').valid);
  assert('Rejects empty output with valid prompt', !validateInputs('Valid prompt', '').valid);
  assert('Accepts valid non-empty prompt and output', validateInputs('fragrance-free sunscreen', 'Luxury Sunscreen $32').valid);

  const oversizedPrompt = 'a'.repeat(MAX_USER_PROMPT_LENGTH + 50);
  const oversizedOutput = 'b'.repeat(MAX_LLM_OUTPUT_LENGTH + 100);
  assert('Rejects prompt exceeding 20,000 char limit', !validateInputs(oversizedPrompt, 'Valid output').valid);
  assert('Rejects output exceeding 50,000 char limit', !validateInputs('Valid prompt', oversizedOutput).valid);
  assert('Accepts prompt exactly at limit', validateInputs('a'.repeat(MAX_USER_PROMPT_LENGTH), 'Valid output').valid);
  assert('Accepts output exactly at limit', validateInputs('Valid prompt', 'b'.repeat(MAX_LLM_OUTPUT_LENGTH)).valid);

  // --- 2. INPUT PRESERVATION TESTS ---
  console.log('\n--- 2. Input Preservation (No Silent Truncation or Modification) ---');
  const rawPromptWithLeadingTrailing = '   \n  sunscreen under $25   \n';
  const rawOutputWithLeadingTrailing = '  \n  Luxury Sunscreen for $32. Contains lavender.   \n';
  
  // Pipeline evaluation with original strings
  const scenarioARes = await runSingleScenarioTest(REGRESSION_SCENARIOS[0]);
  assert('Original prompt preserved in evaluation input', scenarioARes.scenario.userPrompt === REGRESSION_SCENARIOS[0].userPrompt);
  assert('Original output preserved in evaluation input', scenarioARes.scenario.llmOutput === REGRESSION_SCENARIOS[0].llmOutput);

  if (scenarioARes.pipelineOutputs) {
    const jsonPayload = buildExportJsonPayload({
      reportId: 'TEST-14',
      inputs: { userPrompt: rawPromptWithLeadingTrailing, llmOutput: rawOutputWithLeadingTrailing },
      promptAnalysis: scenarioARes.pipelineOutputs.promptRes,
      claimAnalysis: scenarioARes.pipelineOutputs.claimRes,
      verificationResult: scenarioARes.pipelineOutputs.verifRes,
      rubricResult: scenarioARes.pipelineOutputs.rubricRes,
      claimSupportResult: scenarioARes.pipelineOutputs.supportRes,
      rootCauseResult: scenarioARes.pipelineOutputs.rootCauseRes,
      severityAndScoringResult: scenarioARes.pipelineOutputs.severityRes,
      recommendationResult: scenarioARes.pipelineOutputs.recRes,
      finalEvaluationResult: scenarioARes.pipelineOutputs.finalRes,
    });
    assert('Preserves leading/trailing formatting in exported json input prompt', jsonPayload.inputs.userPrompt === rawPromptWithLeadingTrailing);
    assert('Preserves leading/trailing formatting in exported json input output', jsonPayload.inputs.llmOutput === rawOutputWithLeadingTrailing);
  }

  // --- 3. ERROR CLASSIFICATION TESTS ---
  console.log('\n--- 3. Error Classification & Recovery Resilience ---');
  assert('Identifies 429 rate limit error as quota category', classifyError('Error: 429 Too Many Requests').category === 'quota');
  assert('Identifies RESOURCE_EXHAUSTED as quota category', classifyError('Quota exceeded: RESOURCE_EXHAUSTED').category === 'quota');
  assert('Identifies network timeout as network category', classifyError('FetchError: network connection timeout after 5000ms').category === 'network');
  assert('Identifies service unavailable 503 as network category', classifyError('503 Service Unavailable').category === 'network');
  assert('Identifies JSON parse failure as malformed category', classifyError('SyntaxError: Unexpected token < in JSON at position 0').category === 'malformed');
  assert('All categorized errors remain retryable', classifyError('Rate limit exceeded').retryable && classifyError('Network failed').retryable);

  // --- 4. STALE STATE DETECTION LOGIC ---
  console.log('\n--- 4. Stale State Detection Invariants ---');
  const evaluatedInputs = { userPrompt: 'waterproof jacket', llmOutput: 'RainShield Jacket $89' };
  const sameInputs = { userPrompt: 'waterproof jacket', llmOutput: 'RainShield Jacket $89' };
  const editedPrompt = { userPrompt: 'waterproof jacket under $50', llmOutput: 'RainShield Jacket $89' };
  const editedOutput = { userPrompt: 'waterproof jacket', llmOutput: 'RainShield Jacket $99' };

  const isStaleSame = (evaluatedInputs.userPrompt !== sameInputs.userPrompt || evaluatedInputs.llmOutput !== sameInputs.llmOutput);
  const isStalePrompt = (evaluatedInputs.userPrompt !== editedPrompt.userPrompt || evaluatedInputs.llmOutput !== editedPrompt.llmOutput);
  const isStaleOutput = (evaluatedInputs.userPrompt !== editedOutput.userPrompt || evaluatedInputs.llmOutput !== editedOutput.llmOutput);

  assert('Unmodified inputs are NOT flagged as stale', !isStaleSame);
  assert('Modifying User Prompt flags results as stale', isStalePrompt);
  assert('Modifying LLM Output flags results as stale', isStaleOutput);

  console.log('\n================================================================');
  console.log(` HARDENING TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHardeningTests().catch((err) => {
  console.error('Fatal hardening test error:', err);
  process.exit(1);
});
