/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
import { AlertTriangle, AlertOctagon, RotateCw, CheckCircle2 } from 'lucide-react';
import { Header } from './components/Header';
import { InputArea, MAX_USER_PROMPT_LENGTH, MAX_LLM_OUTPUT_LENGTH } from './components/InputArea';
import { ResultsDashboard } from './components/ResultsDashboard';
import { QARegressionModal } from './components/QARegressionModal';
import { REGRESSION_SCENARIOS, RegressionScenario } from './fixtures/regressionScenarios';
import {
  EvaluatorInput,
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  VerificationEngineResult,
  RubricEngineResult,
  ClaimSupportAnalysisResult,
  RootCauseAnalysisResult,
  SeverityAndScoringResult,
  RecommendationEngineResult,
  FinalEvaluationResult,
} from './types/evaluation';
import { analyzeUserPrompt } from './services/evaluation/promptAnalysisService';
import { analyzeLlmOutput } from './services/evaluation/claimAnalysisService';
import { runConstraintVerification } from './services/evaluation/verificationService';
import { runRubricEvaluation } from './services/evaluation/rubricService';
import { runClaimSupportAnalysis } from './services/evaluation/claimSupportService';
import { runRootCauseAnalysis } from './services/evaluation/rootCauseService';
import { runSeverityAndScoringAnalysis } from './services/evaluation/severityScoringService';
import { runRecommendationAnalysis } from './services/evaluation/recommendationService';
import { runFinalEvaluationAnalysis } from './services/evaluation/finalVerdictService';

export interface EvaluationErrorState {
  title: string;
  message: string;
  category: 'quota' | 'network' | 'malformed' | 'system' | 'validation';
  isUserCorrectable: boolean;
  retryable: boolean;
}

export default function App() {
  // CRITICAL PRODUCT REQUIREMENT:
  // Exactly two inputs provided by the human evaluator.
  // Original strings are strictly preserved across evaluations, reports, and retries.
  const [userPrompt, setUserPrompt] = useState<string>('');
  const [llmOutput, setLlmOutput] = useState<string>('');
  
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<EvaluationErrorState | null>(null);

  // Snapshot of inputs that generated current evaluation results
  const [lastEvaluatedInputs, setLastEvaluatedInputs] = useState<{ userPrompt: string; llmOutput: string } | null>(null);

  // Run lifecycle ID to prevent stale or out-of-order async responses from overwriting newer evaluations
  const activeRunIdRef = useRef<number>(0);

  // Structured Pipeline States
  const [promptAnalysis, setPromptAnalysis] = useState<UserPromptAnalysisResult | null>(null);
  const [claimAnalysis, setClaimAnalysis] = useState<LlmOutputClaimAnalysisResult | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationEngineResult | null>(null);
  const [rubricResult, setRubricResult] = useState<RubricEngineResult | null>(null);
  const [claimSupportResult, setClaimSupportResult] = useState<ClaimSupportAnalysisResult | null>(null);
  const [rootCauseResult, setRootCauseResult] = useState<RootCauseAnalysisResult | null>(null);
  const [severityAndScoringResult, setSeverityAndScoringResult] = useState<SeverityAndScoringResult | null>(null);
  const [recommendationResult, setRecommendationResult] = useState<RecommendationEngineResult | null>(null);
  const [finalEvaluationResult, setFinalEvaluationResult] = useState<FinalEvaluationResult | null>(null);
  const [isQAModalOpen, setIsQAModalOpen] = useState<boolean>(false);

  // Detect whether inputs have been modified since the last completed evaluation
  const isInputsModified = Boolean(
    finalEvaluationResult &&
    lastEvaluatedInputs &&
    (userPrompt !== lastEvaluatedInputs.userPrompt || llmOutput !== lastEvaluatedInputs.llmOutput)
  );

  const clearPipelineResults = () => {
    setPromptAnalysis(null);
    setClaimAnalysis(null);
    setVerificationResult(null);
    setRubricResult(null);
    setClaimSupportResult(null);
    setRootCauseResult(null);
    setSeverityAndScoringResult(null);
    setRecommendationResult(null);
    setFinalEvaluationResult(null);
    setLastEvaluatedInputs(null);
  };

  // Canonical Scenario Loader: Populates ONLY the two allowed inputs (Scenarios A–F)
  const handleLoadScenario = (scenario: RegressionScenario) => {
    // Invalidate any in-flight runs
    activeRunIdRef.current++;
    setIsEvaluating(false);

    setUserPrompt(scenario.userPrompt);
    setLlmOutput(scenario.llmOutput);
    setStatusMessage(scenario.statusMessage);
    setValidationError(null);
    setEvaluationError(null);
    clearPipelineResults();
  };

  const handleLoadTestA = () => {
    const sc = REGRESSION_SCENARIOS.find((s) => s.key === 'A');
    if (sc) handleLoadScenario(sc);
  };

  const handleLoadTestB = () => {
    const sc = REGRESSION_SCENARIOS.find((s) => s.key === 'B');
    if (sc) handleLoadScenario(sc);
  };

  const handleLoadTestC = () => {
    const sc = REGRESSION_SCENARIOS.find((s) => s.key === 'C');
    if (sc) handleLoadScenario(sc);
  };

  const handleLoadTestD = () => {
    const sc = REGRESSION_SCENARIOS.find((s) => s.key === 'D');
    if (sc) handleLoadScenario(sc);
  };

  const handleLoadTestE = () => {
    const sc = REGRESSION_SCENARIOS.find((s) => s.key === 'E');
    if (sc) handleLoadScenario(sc);
  };

  const handleLoadTestF = () => {
    const sc = REGRESSION_SCENARIOS.find((s) => s.key === 'F');
    if (sc) handleLoadScenario(sc);
  };

  const handleClear = () => {
    activeRunIdRef.current++;
    setIsEvaluating(false);
    setUserPrompt('');
    setLlmOutput('');
    setStatusMessage(null);
    setValidationError(null);
    setEvaluationError(null);
    clearPipelineResults();
  };

  const handleClearResultsOnly = () => {
    activeRunIdRef.current++;
    setIsEvaluating(false);
    clearPipelineResults();
    setStatusMessage('Previous evaluation results cleared. Current inputs preserved.');
  };

  const handleRunEvaluation = async () => {
    // 1. Prevent duplicate submissions while an evaluation is already active
    if (isEvaluating) {
      return;
    }

    setValidationError(null);
    setEvaluationError(null);

    // 2. Input Validation (trim ONLY for emptiness checks; preserve original strings)
    const cleanPrompt = userPrompt.trim();
    const cleanOutput = llmOutput.trim();

    if (!cleanPrompt && !cleanOutput) {
      setValidationError('Both User Prompt and LLM Output are required. Please enter the original shopping request and assistant response.');
      return;
    }
    if (!cleanPrompt) {
      setValidationError('User Prompt is required. Please enter the shopper\'s original request.');
      return;
    }
    if (!cleanOutput) {
      setValidationError('LLM Output is required. Please paste the shopping assistant\'s response to evaluate.');
      return;
    }
    if (userPrompt.length > MAX_USER_PROMPT_LENGTH) {
      setValidationError(`User Prompt exceeds the limit of ${MAX_USER_PROMPT_LENGTH.toLocaleString()} characters (${userPrompt.length.toLocaleString()} entered). Please shorten the prompt to proceed.`);
      return;
    }
    if (llmOutput.length > MAX_LLM_OUTPUT_LENGTH) {
      setValidationError(`LLM Output exceeds the limit of ${MAX_LLM_OUTPUT_LENGTH.toLocaleString()} characters (${llmOutput.length.toLocaleString()} entered). Please shorten the assistant response to proceed.`);
      return;
    }

    // 3. Evaluation Lifecycle: Clear previous run results immediately
    clearPipelineResults();

    const currentRunId = ++activeRunIdRef.current;
    setIsEvaluating(true);
    setStatusMessage('Executing Prompt Analysis, Claim Extraction, Verification, Dynamic Rubric, Claim Support, Root Causes, Severity Scoring, Actionable Recommendations, and Final Evaluation...');

    try {
      // Step A: Analyze User Prompt (using original userPrompt string)
      const promptPromise = analyzeUserPrompt(userPrompt);

      // Step B: Extract LLM Claims (using original llmOutput string)
      const claimPromise = analyzeLlmOutput(llmOutput);

      const [promptRes, claimRes] = await Promise.all([promptPromise, claimPromise]);

      // Guard against stale runs
      if (activeRunIdRef.current !== currentRunId) return;

      setPromptAnalysis(promptRes);
      setClaimAnalysis(claimRes);

      if (claimRes && promptRes.constraints.length > 0) {
        // Step C: Run Constraint-vs-Claim Verification
        const verifRes = await runConstraintVerification(
          promptRes.constraints,
          claimRes.products,
          claimRes.claims
        );
        if (activeRunIdRef.current !== currentRunId) return;
        setVerificationResult(verifRes);

        // Step D: Dynamic Rubric Generation & Hard-Gate Evaluation
        const rubricRes = await runRubricEvaluation(
          promptRes.constraints,
          claimRes.products,
          verifRes
        );
        if (activeRunIdRef.current !== currentRunId) return;
        setRubricResult(rubricRes);

        // Step E: Claim Support & Hallucination-Risk Analysis
        const supportRes = await runClaimSupportAnalysis(
          claimRes.claims,
          claimRes.products,
          llmOutput
        );
        if (activeRunIdRef.current !== currentRunId) return;
        setClaimSupportResult(supportRes);

        // Step F: Root-Cause / Failure Mode Classification
        const rootCauseRes = await runRootCauseAnalysis(
          promptRes,
          claimRes,
          verifRes,
          rubricRes,
          supportRes,
          userPrompt,
          llmOutput
        );
        if (activeRunIdRef.current !== currentRunId) return;
        setRootCauseResult(rootCauseRes);

        // Step G: Severity Classification & Transparent Product Scoring
        const severityScoringRes = await runSeverityAndScoringAnalysis(
          promptRes,
          claimRes,
          verifRes,
          rubricRes,
          supportRes,
          rootCauseRes
        );
        if (activeRunIdRef.current !== currentRunId) return;
        setSeverityAndScoringResult(severityScoringRes);

        // Step H: Actionable Recommendations & Remediation
        const recRes = await runRecommendationAnalysis(
          promptRes,
          claimRes,
          verifRes,
          rubricRes,
          supportRes,
          rootCauseRes,
          severityScoringRes
        );
        if (activeRunIdRef.current !== currentRunId) return;
        setRecommendationResult(recRes);

        // Step I: Final Integrated Evaluation & Verdict
        const finalRes = await runFinalEvaluationAnalysis(
          promptRes,
          claimRes,
          verifRes,
          rubricRes,
          supportRes,
          rootCauseRes,
          severityScoringRes,
          recRes,
          userPrompt,
          llmOutput
        );
        if (activeRunIdRef.current !== currentRunId) return;
        setFinalEvaluationResult(finalRes);

        // Record successful run inputs
        setLastEvaluatedInputs({ userPrompt, llmOutput });

        const scoreSummaryText = severityScoringRes.overallSummary.evaluatedEvidenceScore !== null
          ? ` · Score: ${severityScoringRes.overallSummary.evaluatedEvidenceScore}/100`
          : ' · Score: NOT ENOUGH EVIDENCE';

        setStatusMessage(
          `FINAL INTEGRATED EVALUATION COMPLETE: Verdict ${finalRes.finalVerdict} · Severity ${severityScoringRes.responseSeverity.overallSeverity}${scoreSummaryText} · ${recRes.recommendations.length} action(s) across ${recRes.productsList.length} product(s) · Hard gates strictly authoritative.`
        );
      } else {
        // Guard against incomplete states being rendered as success
        clearPipelineResults();
        setStatusMessage(
          `PROMPT ANALYSIS INSUFFICIENT: Extracted ${promptRes.constraints.length} constraints. Ensure the User Prompt contains actionable shopping requirements.`
        );
      }
    } catch (err: any) {
      if (activeRunIdRef.current !== currentRunId) return;

      console.error('Evaluation pipeline failed:', err);

      // Prevent partial or corrupted states from being rendered as a successful evaluation
      clearPipelineResults();

      // Classify error to distinguish user-correctable from system issues
      const errMsg = err?.message || String(err || 'Failed to complete evaluation');
      let errorCategory: 'quota' | 'network' | 'malformed' | 'system' = 'system';
      let errorTitle = 'Evaluation Pipeline Interruption';
      let userFriendlyMessage = errMsg;
      let isRetryable = true;

      if (/429|quota|resource_exhausted|rate limit/i.test(errMsg)) {
        errorCategory = 'quota';
        errorTitle = 'Model Rate Limit or Quota Exceeded';
        userFriendlyMessage = 'The AI model service reached its rate limit or quota threshold. Your prompt and assistant response have been preserved. Please wait a few moments and retry.';
      } else if (/network|failed to fetch|econnrefused|503|502|504|timeout/i.test(errMsg)) {
        errorCategory = 'network';
        errorTitle = 'Service Connection Unavailable';
        userFriendlyMessage = 'Unable to connect to the evaluation service or the request timed out. Your inputs have been preserved. You can retry immediately.';
      } else if (/json|syntaxerror|malformed|missing required/i.test(errMsg)) {
        errorCategory = 'malformed';
        errorTitle = 'Structured Output Processing Error';
        userFriendlyMessage = 'The evaluation service produced an unexpected or malformed response structure. Retrying will invoke the resilient deterministic evaluator.';
      }

      setEvaluationError({
        category: errorCategory,
        title: errorTitle,
        message: userFriendlyMessage,
        isUserCorrectable: false,
        retryable: isRetryable,
      });

      setStatusMessage(`Evaluation interrupted: ${errorTitle}. Click "Retry Evaluation" to run again.`);
    } finally {
      if (activeRunIdRef.current === currentRunId) {
        setIsEvaluating(false);
      }
    }
  };

  const currentInputs: EvaluatorInput = {
    userPrompt,
    llmOutput,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header Bar */}
      <Header
        onLoadTestA={handleLoadTestA}
        onLoadTestB={handleLoadTestB}
        onLoadTestC={handleLoadTestC}
        onLoadTestD={handleLoadTestD}
        onLoadTestE={handleLoadTestE}
        onLoadTestF={handleLoadTestF}
        onClear={handleClear}
        onOpenQAModal={() => setIsQAModalOpen(true)}
        hasInputs={Boolean(userPrompt.trim() || llmOutput.trim())}
      />

      {/* Main Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Exactly Two Evaluator Inputs Area */}
        <InputArea
          userPrompt={userPrompt}
          setUserPrompt={setUserPrompt}
          llmOutput={llmOutput}
          setLlmOutput={setLlmOutput}
          onRunEvaluation={handleRunEvaluation}
          isEvaluating={isEvaluating}
          statusMessage={statusMessage}
          validationError={validationError}
          onClearValidationError={() => setValidationError(null)}
        />

        {/* System Error & Recovery Callout Banner */}
        {evaluationError && (
          <div className="bg-rose-950/70 border border-rose-800 rounded-xl p-4 text-xs text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md animate-fade-in break-words">
            <div className="flex items-start gap-3">
              <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-rose-100 text-sm">
                    {evaluationError.title}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-rose-900/60 text-rose-300 border border-rose-700">
                    {evaluationError.category}
                  </span>
                </div>
                <p className="text-rose-300/90 leading-relaxed">
                  {evaluationError.message}
                </p>
                <p className="text-[11px] text-rose-400">
                  Your prompt and assistant response have been preserved. You can edit them or retry immediately.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {evaluationError.retryable && (
                <button
                  type="button"
                  onClick={handleRunEvaluation}
                  disabled={isEvaluating}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-medium text-xs shadow transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Retry Evaluation</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setEvaluationError(null)}
                className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Inputs Modified / Stale Results Alert Banner */}
        {isInputsModified && (
          <div className="bg-amber-950/50 border border-amber-800/90 rounded-xl p-4 text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-fade-in break-words">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-100 text-sm flex items-center gap-2">
                  <span>Inputs Modified Since Last Evaluation</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-900/60 text-amber-300 border border-amber-700">
                    STALE RESULTS
                  </span>
                </div>
                <p className="text-amber-300/80 mt-1 leading-relaxed">
                  The results shown below correspond to previously evaluated inputs. Re-run evaluation to evaluate your updated inputs, or clear the outdated results.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={handleRunEvaluation}
                disabled={isEvaluating}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-xs transition-colors cursor-pointer shadow"
              >
                Re-evaluate Updated Inputs
              </button>
              <button
                type="button"
                onClick={handleClearResultsOnly}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs transition-colors cursor-pointer"
              >
                Clear Outdated Results
              </button>
            </div>
          </div>
        )}

        {/* Evaluation Results Dashboard */}
        <ResultsDashboard
          inputs={currentInputs}
          promptAnalysis={promptAnalysis}
          claimAnalysis={claimAnalysis}
          verificationResult={verificationResult}
          rubricResult={rubricResult}
          claimSupportResult={claimSupportResult}
          rootCauseResult={rootCauseResult}
          severityAndScoringResult={severityAndScoringResult}
          recommendationResult={recommendationResult}
          finalEvaluationResult={finalEvaluationResult}
          isInputsModified={isInputsModified}
        />

      </main>

      {/* Automated QA & Regression Test Suite Modal */}
      <QARegressionModal
        isOpen={isQAModalOpen}
        onClose={() => setIsQAModalOpen(false)}
        onLoadScenario={handleLoadScenario}
      />

      {/* Minimal, Disciplined Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>AI Shopping Assistant Evaluator</span>
            <span>·</span>
            <span>Checkpoint 14: V1 Release Hardening Active</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400 flex-wrap">
            <span>Input Contract: User Prompt + LLM Output Only</span>
            <span>·</span>
            <span>Verdict: PASS / FAIL / INDETERMINATE · Hard Gate Authoritative · UNKNOWN ≠ FAIL · UNVERIFIED ≠ FALSE</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
