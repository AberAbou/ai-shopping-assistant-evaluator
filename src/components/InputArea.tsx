import React from 'react';
import { Play, MessageSquareQuote, Bot, ArrowRight, Info, Loader2, AlertCircle } from 'lucide-react';

export const MAX_USER_PROMPT_LENGTH = 20000;
export const MAX_LLM_OUTPUT_LENGTH = 50000;

interface InputAreaProps {
  userPrompt: string;
  setUserPrompt: (val: string) => void;
  llmOutput: string;
  setLlmOutput: (val: string) => void;
  onRunEvaluation: () => void;
  isEvaluating: boolean;
  statusMessage?: string | null;
  validationError?: string | null;
  onClearValidationError?: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({
  userPrompt,
  setUserPrompt,
  llmOutput,
  setLlmOutput,
  onRunEvaluation,
  isEvaluating,
  statusMessage,
  validationError,
  onClearValidationError,
}) => {
  const promptTrimmed = userPrompt.trim();
  const outputTrimmed = llmOutput.trim();

  const promptWordCount = promptTrimmed ? promptTrimmed.split(/\s+/).length : 0;
  const outputWordCount = outputTrimmed ? outputTrimmed.split(/\s+/).length : 0;

  const isPromptTooLong = userPrompt.length > MAX_USER_PROMPT_LENGTH;
  const isOutputTooLong = llmOutput.length > MAX_LLM_OUTPUT_LENGTH;

  const isBothEmpty = !promptTrimmed && !outputTrimmed;
  const isPromptEmpty = !promptTrimmed;
  const isOutputEmpty = !outputTrimmed;

  const canRun = !isEvaluating && !isPromptEmpty && !isOutputEmpty && !isPromptTooLong && !isOutputTooLong;

  return (
    <section className="space-y-4">
      {/* Informational Guidance Callout */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="text-slate-200 font-medium">Evaluator Contract (Strictly 2 Inputs):</span> Provide only the shopper's original prompt and the assistant's response. All intent structures, constraints, hard/soft boundaries, and exclusions are extracted automatically.
        </div>
      </div>

      {/* Validation Alert Callout if active */}
      {validationError && (
        <div className="bg-rose-950/60 border border-rose-800/80 rounded-lg p-3 text-xs text-rose-200 flex items-start justify-between gap-3 animate-fade-in shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-rose-100">Input Validation Error: </span>
              {validationError}
            </div>
          </div>
          {onClearValidationError && (
            <button
              type="button"
              onClick={onClearValidationError}
              className="text-rose-400 hover:text-rose-200 text-xs px-2 py-0.5 rounded hover:bg-rose-900/40 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Exactly Two Large Input Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* LEFT PANEL: User Prompt */}
        <div
          className={`flex flex-col bg-slate-900/90 border rounded-xl overflow-hidden shadow-sm transition-colors ${
            isPromptTooLong
              ? 'border-rose-700/80 focus-within:border-rose-500'
              : 'border-slate-800 focus-within:border-slate-700'
          }`}
        >
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquareQuote className="w-4 h-4 text-cyan-400" />
              <div>
                <h2 className="text-sm font-semibold text-slate-200">User Prompt</h2>
                <p className="text-xs text-slate-400">Original shopping request submitted by the user.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isPromptTooLong && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                  Limit exceeded
                </span>
              )}
              <div
                className={`text-[11px] font-mono tabular-nums ${
                  isPromptTooLong ? 'text-rose-400 font-bold' : 'text-slate-400'
                }`}
              >
                {promptWordCount} words · {userPrompt.length.toLocaleString()} / {MAX_USER_PROMPT_LENGTH.toLocaleString()} max chars
              </div>
            </div>
          </div>
          
          <div className="p-3.5 flex-1 flex flex-col">
            <textarea
              value={userPrompt}
              onChange={(e) => {
                setUserPrompt(e.target.value);
                if (validationError && onClearValidationError) onClearValidationError();
              }}
              placeholder="Enter the original shopping request (e.g., 'fragrance-free organic sunscreen under $25')..."
              rows={8}
              className={`w-full h-full min-h-[170px] bg-slate-950/70 border rounded-lg p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 resize-y font-sans leading-relaxed break-words ${
                isPromptTooLong
                  ? 'border-rose-700 focus:ring-rose-500/50 focus:border-rose-500'
                  : 'border-slate-800/80 focus:ring-emerald-500/50 focus:border-emerald-500/50'
              }`}
            />
          </div>
        </div>

        {/* RIGHT PANEL: LLM Output */}
        <div
          className={`flex flex-col bg-slate-900/90 border rounded-xl overflow-hidden shadow-sm transition-colors ${
            isOutputTooLong
              ? 'border-rose-700/80 focus-within:border-rose-500'
              : 'border-slate-800 focus-within:border-slate-700'
          }`}
        >
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-violet-400" />
              <div>
                <h2 className="text-sm font-semibold text-slate-200">LLM Output</h2>
                <p className="text-xs text-slate-400">Response generated by the shopping assistant.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOutputTooLong && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                  Limit exceeded
                </span>
              )}
              <div
                className={`text-[11px] font-mono tabular-nums ${
                  isOutputTooLong ? 'text-rose-400 font-bold' : 'text-slate-400'
                }`}
              >
                {outputWordCount} words · {llmOutput.length.toLocaleString()} / {MAX_LLM_OUTPUT_LENGTH.toLocaleString()} max chars
              </div>
            </div>
          </div>

          <div className="p-3.5 flex-1 flex flex-col">
            <textarea
              value={llmOutput}
              onChange={(e) => {
                setLlmOutput(e.target.value);
                if (validationError && onClearValidationError) onClearValidationError();
              }}
              placeholder="Paste the shopping assistant's response (product recommendations, descriptions, prices)..."
              rows={8}
              className={`w-full h-full min-h-[170px] bg-slate-950/70 border rounded-lg p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 resize-y font-sans leading-relaxed break-words ${
                isOutputTooLong
                  ? 'border-rose-700 focus:ring-rose-500/50 focus:border-rose-500'
                  : 'border-slate-800/80 focus:ring-violet-500/50 focus:border-violet-500/50'
              }`}
            />
          </div>
        </div>

      </div>

      {/* Primary Action Button Area */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
        <div className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400">Input Readiness:</span>
          {canRun ? (
            <span className="text-emerald-400 font-medium flex items-center gap-1">
              ✓ Both inputs ready for evaluation (Prompt + Assistant Response)
            </span>
          ) : isBothEmpty ? (
            <span className="text-slate-400">
              Provide both User Prompt and LLM Output above to evaluate.
            </span>
          ) : isPromptEmpty ? (
            <span className="text-amber-400">
              User Prompt required (original shopping request)
            </span>
          ) : isOutputEmpty ? (
            <span className="text-amber-400">
              LLM Output required (assistant response to evaluate)
            </span>
          ) : isPromptTooLong || isOutputTooLong ? (
            <span className="text-rose-400">
              Character limit exceeded. Shorten inputs to proceed.
            </span>
          ) : (
            <span className="text-slate-400">
              Ready
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onRunEvaluation}
          disabled={!canRun}
          className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-medium text-sm tracking-wide shadow-md shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isEvaluating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>EVALUATING PIPELINE...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>RUN EVALUATION</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* Informational Status Banner */}
      {statusMessage && (
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-start gap-2 animate-fade-in break-words">
          <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            {statusMessage}
          </div>
        </div>
      )}
    </section>
  );
};
