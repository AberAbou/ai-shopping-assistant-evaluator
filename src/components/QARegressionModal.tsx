import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  X,
  Clock,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  REGRESSION_SCENARIOS,
  RegressionScenario,
} from '../fixtures/regressionScenarios';
import {
  runRegressionSuite,
  RegressionSuiteResult,
} from '../services/evaluation/regressionRunner';

interface QARegressionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadScenario: (scenario: RegressionScenario) => void;
}

export const QARegressionModal: React.FC<QARegressionModalProps> = ({
  isOpen,
  onClose,
  onLoadScenario,
}) => {
  const [suiteResult, setSuiteResult] = useState<RegressionSuiteResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeScenarioKey, setActiveScenarioKey] = useState<string>('A');

  if (!isOpen) return null;

  const handleRunAll = async () => {
    setIsRunning(true);
    try {
      const res = await runRegressionSuite();
      setSuiteResult(res);
    } catch (err) {
      console.error('QA Suite error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const selectedScenario = REGRESSION_SCENARIOS.find((s) => s.key === activeScenarioKey) || REGRESSION_SCENARIOS[0];
  const selectedResult = suiteResult?.scenarioResults.find(
    (r) => r.scenario.key === activeScenarioKey
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">
                  Evaluator QA &amp; Regression Test Suite
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                  Checkpoint 13
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated verification protecting core invariants across Scenarios A–F
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunAll}
              disabled={isRunning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Running Suite...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>{suiteResult ? 'Re-run Suite' : 'Run Suite Now'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Suite Status Bar */}
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-4 text-slate-300">
            <span>
              Scenarios:{' '}
              <strong className="text-white">
                {suiteResult ? `${suiteResult.passedScenarios} / ${suiteResult.totalScenarios}` : '6 total'}
              </strong>
            </span>
            <span>
              Assertions:{' '}
              <strong className="text-white">
                {suiteResult ? `${suiteResult.passedAssertions} / ${suiteResult.totalAssertions}` : '101 total'}
              </strong>
            </span>
            {suiteResult && (
              <span className="text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {suiteResult.durationMs}ms
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {suiteResult ? (
              suiteResult.failedScenarios === 0 ? (
                <span className="px-2.5 py-1 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ALL 6 SCENARIOS PASSED
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded bg-rose-950/80 text-rose-400 border border-rose-800 font-medium flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  {suiteResult.failedScenarios} SCENARIO(S) FAILED
                </span>
              )
            ) : (
              <span className="text-slate-500">Suite ready for execution</span>
            )}
          </div>
        </div>

        {/* Content: Left Tabs (Scenarios A-F), Right Details */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[380px]">
          {/* Scenario Selector */}
          <div className="md:col-span-4 border-r border-slate-800 bg-slate-950/30 p-3 overflow-y-auto space-y-1.5">
            {REGRESSION_SCENARIOS.map((sc) => {
              const res = suiteResult?.scenarioResults.find((r) => r.scenario.key === sc.key);
              const isSelected = activeScenarioKey === sc.key;
              return (
                <button
                  key={sc.key}
                  type="button"
                  onClick={() => setActiveScenarioKey(sc.key)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-slate-800/90 border-slate-700 text-white shadow-sm'
                      : 'bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-200">
                        {sc.shortLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {sc.summary}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {res ? (
                      res.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        {sc.expected.overallVerdict}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Core Invariants Quick Check */}
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1 px-1">
              <span className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">
                Protected Invariants:
              </span>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Hard gates authoritative</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>UNKNOWN is NOT FAIL</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>UNVERIFIED is NOT FALSE</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Product isolation preserved</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Contradictions unresolved</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Readable claims audited</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Report &amp; export verified</span>
              </div>
            </div>
          </div>

          {/* Scenario Details & Assertions */}
          <div className="md:col-span-8 p-5 overflow-y-auto space-y-4 bg-slate-900/60">
            {/* Header info */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {selectedScenario.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedScenario.summary}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onLoadScenario(selectedScenario);
                  onClose();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer shrink-0"
              >
                <span>Load in Evaluator</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Prompt & Output preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-cyan-400 block mb-1">
                  Shopper Prompt:
                </span>
                <p className="text-slate-300 leading-relaxed font-sans">
                  {selectedScenario.userPrompt}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-violet-400 block mb-1">
                  LLM Output:
                </span>
                <p className="text-slate-300 leading-relaxed font-sans line-clamp-4">
                  {selectedScenario.llmOutput}
                </p>
              </div>
            </div>

            {/* Expected Invariant Targets */}
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-2">
                Expected Invariant Profile:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Verdict</span>
                  <span className="text-emerald-400 font-semibold">{selectedScenario.expected.overallVerdict}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Hard Gate</span>
                  <span className="text-slate-300">{selectedScenario.expected.hardGateState}</span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Confirmed Fails</span>
                  <span className="text-slate-300">
                    {selectedScenario.expected.expectedConfirmedFailures ?? selectedScenario.expected.minConfirmedFailures ?? 'N/A'}
                  </span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Root Cause</span>
                  <span className="text-cyan-400">{selectedScenario.expected.expectedPrimaryRootCause ?? 'N/A'}</span>
                </div>
              </div>
              {selectedScenario.expected.notes && (
                <p className="text-[11px] text-slate-400 mt-2 font-sans italic">
                  Note: {selectedScenario.expected.notes}
                </p>
              )}
            </div>

            {/* Assertions Table if run */}
            {selectedResult && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    Semantic Assertions ({selectedResult.assertions.filter((a) => a.passed).length} / {selectedResult.assertions.length})
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    Executed in {selectedResult.durationMs}ms
                  </span>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {selectedResult.assertions.map((a, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded-lg border text-xs flex items-start gap-2.5 ${
                        a.passed
                          ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                          : 'bg-rose-950/30 border-rose-800/60 text-rose-300'
                      }`}
                    >
                      {a.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-200">{a.name}</div>
                        {!a.passed && (
                          <div className="mt-1 text-[11px] font-mono text-rose-300/90">
                            <div>Expected: {JSON.stringify(a.expected)}</div>
                            <div>Actual:   {JSON.stringify(a.actual)}</div>
                          </div>
                        )}
                        {a.message && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{a.message}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>Automated CLI execution: <code className="text-emerald-400 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">npm test</code></span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
