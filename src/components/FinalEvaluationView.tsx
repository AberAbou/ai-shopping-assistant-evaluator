import React from 'react';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Shield,
  Layers,
  FileText,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  Info,
  Table,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';
import {
  FinalEvaluationResult,
  FinalVerdictState,
  HardGateState,
  SeverityRating,
  ResultTab,
} from '../types/evaluation';

interface FinalEvaluationViewProps {
  finalEvaluationResult: FinalEvaluationResult | null;
  onSelectTab: (tab: ResultTab) => void;
}

export const FinalEvaluationView: React.FC<FinalEvaluationViewProps> = ({
  finalEvaluationResult,
  onSelectTab,
}) => {
  if (!finalEvaluationResult) {
    return (
      <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
        <Shield className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <div className="text-base font-semibold text-slate-200">
          Final Integrated Evaluation Awaiting Pipeline Execution
        </div>
        <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1.5 leading-relaxed">
          Provide the User Prompt and LLM Output and click "RUN EVALUATION" to automatically run all pipeline stages and generate the final integrated verdict and report.
        </p>
      </div>
    );
  }

  const {
    finalVerdict,
    verdictRationale,
    summary,
    productVerdicts,
    requirementCoverage,
    claimContext,
    rootCauseSummary,
    prioritizedNextActions,
    traceability,
  } = finalEvaluationResult;

  const getVerdictBadge = (v: FinalVerdictState) => {
    switch (v) {
      case 'PASS':
        return (
          <span className="px-3 py-1 rounded-md text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1.5 shadow-sm">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            PASS
          </span>
        );
      case 'FAIL':
        return (
          <span className="px-3 py-1 rounded-md text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700 flex items-center gap-1.5 shadow-sm">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            FAIL
          </span>
        );
      case 'INDETERMINATE':
        return (
          <span className="px-3 py-1 rounded-md text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-700 flex items-center gap-1.5 shadow-sm">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            INDETERMINATE
          </span>
        );
    }
  };

  const getHardGateBadge = (hg: HardGateState) => {
    switch (hg) {
      case 'HARD_GATE_PASS':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            HARD GATE PASS
          </span>
        );
      case 'HARD_GATE_FAIL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">
            HARD GATE FAIL
          </span>
        );
      case 'HARD_GATE_INDETERMINATE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
            HARD GATE INDETERMINATE
          </span>
        );
    }
  };

  const getSeverityBadge = (sev: SeverityRating) => {
    switch (sev) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">
            CRITICAL
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-800">
            HIGH
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
            MEDIUM
          </span>
        );
      case 'LOW':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-950 text-blue-300 border border-blue-800">
            LOW
          </span>
        );
      case 'INFORMATIONAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-950 text-sky-300 border border-sky-800">
            INFORMATIONAL
          </span>
        );
      case 'NONE':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
            NONE
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. TOP HEADER & SUBTITLE */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              Final Integrated Evaluation &amp; Verdict Report
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              Checkpoint 10 Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative integration layer combining findings from Checkpoints 2–9 without overriding hard gates or inventing external product facts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
          <button
            type="button"
            onClick={() => onSelectTab('report_export')}
            className="px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>AUDIT REPORT &amp; EXPORT</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
            HARD GATES AUTHORITATIVE
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
            UNKNOWN ≠ FAIL
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
            UNVERIFIED ≠ FALSE
          </span>
        </div>
      </div>

      {/* 2. LARGE FINAL VERDICT BANNER */}
      <div
        className={`p-5 rounded-xl border relative overflow-hidden transition-all ${
          finalVerdict === 'PASS'
            ? 'bg-gradient-to-r from-emerald-950/60 to-slate-950 border-emerald-800/80 shadow-lg shadow-emerald-950/20'
            : finalVerdict === 'FAIL'
            ? 'bg-gradient-to-r from-rose-950/60 to-slate-950 border-rose-800/80 shadow-lg shadow-rose-950/20'
            : 'bg-gradient-to-r from-amber-950/60 to-slate-950 border-amber-800/80 shadow-lg shadow-amber-950/20'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex-shrink-0">
              {finalVerdict === 'PASS' ? (
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              ) : finalVerdict === 'FAIL' ? (
                <XCircle className="w-10 h-10 text-rose-400" />
              ) : (
                <HelpCircle className="w-10 h-10 text-amber-400" />
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Response-Level Evaluation Verdict
                </span>
                {getVerdictBadge(finalVerdict)}
              </div>
              <h2
                className={`text-2xl font-black font-mono tracking-tight ${
                  finalVerdict === 'PASS'
                    ? 'text-emerald-300'
                    : finalVerdict === 'FAIL'
                    ? 'text-rose-300'
                    : 'text-amber-300'
                }`}
              >
                VERDICT: {finalVerdict}
              </h2>
              <p className="text-xs text-slate-300 font-sans leading-relaxed max-w-3xl pt-1">
                {verdictRationale}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-2 border-t md:border-t-0 md:border-l border-slate-800/80 pt-3 md:pt-0 md:pl-5 flex-shrink-0">
            <div className="text-[11px] font-mono text-slate-400 text-left md:text-right">
              <span className="block text-slate-500 text-[10px]">EVALUATOR DECISION BASIS</span>
              <span className="font-semibold text-slate-200">
                {finalVerdict === 'PASS'
                  ? 'All Mandatory Gates Satisfied'
                  : finalVerdict === 'FAIL'
                  ? 'Confirmed Mandatory Failure'
                  : 'Unresolved Mandatory Evidence'}
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 text-left md:text-right">
              Hard gates strictly authoritative
            </div>
          </div>
        </div>

        {/* Semantic Invariant Banner */}
        <div className="mt-4 pt-3 border-t border-slate-800/70 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 font-mono">
          <span>• Hard-gate state cannot be softened or overridden by numeric score.</span>
          <span>• UNKNOWN requirements are not counted as failures.</span>
          <span>• UNVERIFIED claims are not assumed false.</span>
        </div>
      </div>

      {/* 3. RESPONSE-LEVEL SUMMARY METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* Products Evaluated */}
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 block">Products</span>
          <div className="text-lg font-bold font-mono text-slate-100 tabular-nums">
            {summary.totalProductsEvaluated}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">Options in response</span>
        </div>

        {/* Hard Gate Distribution */}
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 block">Hard Gates</span>
          <div className="text-sm font-bold font-mono text-slate-200 pt-0.5">
            <span className="text-emerald-400">{summary.hardGateDistribution.pass}P</span> ·{' '}
            <span className={summary.hardGateDistribution.fail > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
              {summary.hardGateDistribution.fail}F
            </span>{' '}
            ·{' '}
            <span className={summary.hardGateDistribution.indeterminate > 0 ? 'text-amber-400' : 'text-slate-400'}>
              {summary.hardGateDistribution.indeterminate}U
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block">Distribution</span>
        </div>

        {/* Overall Severity */}
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 block">Severity</span>
          <div className="pt-0.5">{getSeverityBadge(summary.overallSeverity)}</div>
          <span className="text-[10px] text-slate-500 block truncate">Diagnostic level</span>
        </div>

        {/* Average Evidence Score */}
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 block">Evidence Score</span>
          <div className="text-lg font-bold font-mono text-slate-100 tabular-nums">
            {summary.averageEvaluatedEvidenceScore !== null ? (
              <>
                <span className="text-emerald-400">{summary.averageEvaluatedEvidenceScore}</span>
                <span className="text-xs text-slate-500">/100</span>
              </>
            ) : (
              <span className="text-xs font-semibold text-amber-400">N/A</span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">Not a probability</span>
        </div>

        {/* Confirmed Failures */}
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 block">Failures</span>
          <div
            className={`text-lg font-bold font-mono tabular-nums ${
              summary.totalConfirmedFailures > 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {summary.totalConfirmedFailures}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">Confirmed breaches</span>
        </div>

        {/* Unresolved / UNKNOWN */}
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 block">Unknown</span>
          <div
            className={`text-lg font-bold font-mono tabular-nums ${
              summary.totalUnresolvedUnknown > 0 ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            {summary.totalUnresolvedUnknown}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">UNKNOWN ≠ FAIL</span>
        </div>

        {/* Unverified Factual Claims */}
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] font-mono uppercase text-slate-500 block">Unverified</span>
          <div className="text-lg font-bold font-mono text-sky-400 tabular-nums">
            {summary.totalUnverifiedFactualClaims}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">UNVERIFIED ≠ FALSE</span>
        </div>
      </div>

      {/* 3B. SHOPPING CART EVALUATION (Checkpoint 14C.1) */}
      {finalEvaluationResult.cartEvaluation?.hasCartEvaluation && (
        <div className="p-4 rounded-xl border border-indigo-800/60 bg-gradient-to-r from-indigo-950/40 via-slate-950 to-slate-950 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-900/40 pb-2.5">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-300 font-mono flex items-center gap-2">
                Shopping Cart Evaluation & Combined Budget
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400">Cart Gate:</span>
              {getHardGateBadge(finalEvaluationResult.cartEvaluation.cartHardGateState)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Calculated Cart Total</span>
              <div className="text-lg font-bold font-mono text-slate-100 tabular-nums">
                {finalEvaluationResult.cartEvaluation.calculatedCartTotal !== null
                  ? `$${finalEvaluationResult.cartEvaluation.calculatedCartTotal}`
                  : 'N/A (Incomplete)'}
              </div>
              <span className="text-[10px] text-slate-500 block">Sum of (Qty × Unit Price)</span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Effective Cart Total</span>
              <div className="text-lg font-bold font-mono text-indigo-300 tabular-nums">
                {finalEvaluationResult.cartEvaluation.effectiveCartTotal !== null
                  ? `$${finalEvaluationResult.cartEvaluation.effectiveCartTotal}`
                  : 'Unknown'}
              </div>
              <span className="text-[10px] text-slate-500 block">
                {finalEvaluationResult.cartEvaluation.ambiguousStatedTotal
                  ? 'Stated Total: Ambiguous amount or unsupported currency'
                  : finalEvaluationResult.cartEvaluation.statedCartTotal !== null
                  ? `Stated Total: $${finalEvaluationResult.cartEvaluation.statedCartTotal}`
                  : 'Evaluated Total'}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Cart Budget Constraint</span>
              <div className="text-sm font-semibold font-mono text-slate-200 pt-0.5 truncate">
                {finalEvaluationResult.cartEvaluation.verifications.find(v => v.constraintAttribute === 'cart_total_price')?.constraintEvidence || 'No combined budget stated'}
              </div>
              <span className="text-[10px] text-slate-500 block truncate">
                Status: {finalEvaluationResult.cartEvaluation.verifications.find(v => v.constraintAttribute === 'cart_total_price')?.status || 'Not specified'}
              </span>
            </div>
          </div>

          {/* Cart Item Breakdown Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Quantity</th>
                  <th className="py-2 px-3">Unit Price</th>
                  <th className="py-2 px-3 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {finalEvaluationResult.cartEvaluation.cartItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40">
                    <td className="py-2 px-3 text-slate-200 font-semibold">{item.productName}</td>
                    <td className="py-2 px-3 text-slate-400">{item.quantity ?? 'Unknown'}</td>
                    <td className="py-2 px-3 text-slate-300">
                      {item.unitPrice !== null ? `$${item.unitPrice}` : 'Missing'}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-200">
                      {item.lineTotal !== null ? `$${item.lineTotal}` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-300 font-sans leading-relaxed pt-0.5">
            {finalEvaluationResult.cartEvaluation.rationale}
          </p>
        </div>
      )}

      {/* 4. PRODUCT-LEVEL VERDICTS (Preserving Product Isolation) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            Product-Level Authoritative Verdicts ({productVerdicts.length})
          </h4>
          <span className="text-[11px] text-slate-500 font-mono">
            Product isolation preserved · No cross-contamination
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {productVerdicts.map((pv) => (
            <div
              key={pv.productId}
              className={`p-4 rounded-xl border bg-slate-950/70 space-y-3 transition-colors ${
                pv.verdict === 'PASS'
                  ? 'border-emerald-900/60'
                  : pv.verdict === 'FAIL'
                  ? 'border-rose-900/60'
                  : 'border-amber-900/60'
              }`}
            >
              {/* Product Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-bold text-slate-100">{pv.productName}</span>
                  <span className="text-xs font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                    {pv.productId}
                  </span>
                  {getVerdictBadge(pv.verdict)}
                  {getHardGateBadge(pv.hardGateState)}
                  {getSeverityBadge(pv.severity)}
                </div>

                <div className="flex items-center gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase block">Hard Satisfaction</span>
                    <span className="font-semibold text-slate-200">
                      {pv.confirmedHardSatisfactionPercent}%{' '}
                      <span className="text-[11px] text-slate-400">
                        ({pv.passedHardCount}P · {pv.failedHardCount}F · {pv.unknownHardCount}U)
                      </span>
                    </span>
                  </div>
                  <div className="border-l border-slate-800 pl-3">
                    <span className="text-slate-500 text-[10px] uppercase block">Evidence Score</span>
                    <span className="font-semibold text-emerald-400">
                      {pv.evaluatedEvidenceScore !== null ? `${pv.evaluatedEvidenceScore}/100` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Rationale & Remediation */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Product Verdict Rationale:</span>
                  <p className="text-slate-300 leading-relaxed font-sans mt-0.5">{pv.rationale}</p>
                </div>

                {/* Key Root Cause Chips & Remediation Summary */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-500 font-mono text-[10px]">Diagnostic Causes:</span>
                    {pv.keyRootCauseCodes.length > 0 ? (
                      pv.keyRootCauseCodes.map((code, idx) => (
                        <span
                          key={idx}
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                        >
                          {code}
                        </span>
                      ))
                    ) : (
                      <span className="font-mono text-[10px] text-slate-500">None</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="text-slate-500 font-mono text-[10px]">Action:</span>
                    <span className="truncate max-w-md">{pv.remediationSummary}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. REQUIREMENT COVERAGE SUMMARY & CLAIM CONTEXT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* LEFT: Requirement Coverage Summary */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <Table className="w-3.5 h-3.5 text-cyan-400" />
              Requirement Coverage Breakdown
            </h4>
            <span className="text-[10px] font-mono text-slate-500">
              {requirementCoverage.confirmedSatisfied.length +
                requirementCoverage.confirmedFailed.length +
                requirementCoverage.unknownRequirements.length}{' '}
              Evaluated
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div className="p-2 rounded bg-slate-900 border border-emerald-900/40">
              <span className="text-slate-500 block text-[10px]">SATISFIED</span>
              <span className="font-bold text-emerald-400 text-base">
                {requirementCoverage.confirmedSatisfied.length}
              </span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-rose-900/40">
              <span className="text-slate-500 block text-[10px]">FAILED</span>
              <span
                className={`font-bold text-base ${
                  requirementCoverage.confirmedFailed.length > 0 ? 'text-rose-400' : 'text-slate-400'
                }`}
              >
                {requirementCoverage.confirmedFailed.length}
              </span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-amber-900/40">
              <span className="text-slate-500 block text-[10px]">UNKNOWN</span>
              <span
                className={`font-bold text-base ${
                  requirementCoverage.unknownRequirements.length > 0 ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                {requirementCoverage.unknownRequirements.length}
              </span>
            </div>
          </div>

          {/* Explicit Invariant Note */}
          <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-900/40 text-[11px] text-amber-300/90 leading-relaxed">
            <strong>Mandatory Invariant:</strong> UNKNOWN requirements are not counted as failures. Missing evidence is not diagnosed as a product defect.
          </div>

          {/* Sample breakdown items */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs scrollbar-thin">
            {requirementCoverage.confirmedFailed.map((item, idx) => (
              <div
                key={`fail-${idx}`}
                className="p-2 rounded bg-rose-950/20 border border-rose-900/30 flex items-start justify-between gap-2"
              >
                <div>
                  <span className="text-rose-300 font-medium block">{item.sourceText}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Product: {item.productName} · Stated: {item.evidenceInOutput.join(', ') || 'N/A'}
                  </span>
                </div>
                <span className="font-mono text-[10px] font-bold text-rose-400 bg-rose-950 px-1.5 py-0.2 rounded border border-rose-800">
                  FAIL
                </span>
              </div>
            ))}
            {requirementCoverage.unknownRequirements.map((item, idx) => (
              <div
                key={`unk-${idx}`}
                className="p-2 rounded bg-slate-900/60 border border-slate-800 flex items-start justify-between gap-2"
              >
                <div>
                  <span className="text-slate-300 block">{item.sourceText}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Product: {item.productName} · Evidence absent from response
                  </span>
                </div>
                <span className="font-mono text-[10px] font-semibold text-amber-400 bg-amber-950 px-1.5 py-0.2 rounded border border-amber-800">
                  UNKNOWN
                </span>
              </div>
            ))}
            {requirementCoverage.confirmedSatisfied.map((item, idx) => (
              <div
                key={`pass-${idx}`}
                className="p-2 rounded bg-emerald-950/20 border border-emerald-900/30 flex items-start justify-between gap-2"
              >
                <div>
                  <span className="text-emerald-300 font-medium block">{item.sourceText}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Product: {item.productName} · Stated: {item.evidenceInOutput.join(', ')}
                  </span>
                </div>
                <span className="font-mono text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800">
                  PASS
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Claim Support & External Verification Context */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-violet-400" />
              Claim Support &amp; Truth Context
            </h4>
            <span className="text-[10px] font-mono text-slate-500">
              {claimContext.totalExtractedClaims} Total Claims Extracted
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">SUPPORTED</span>
              <span className="font-bold text-slate-200 text-base">
                {claimContext.internallySupportedClaims}
              </span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">CONTRADICTED</span>
              <span
                className={`font-bold text-base ${
                  claimContext.internallyContradictedClaims > 0 ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                {claimContext.internallyContradictedClaims}
              </span>
            </div>
            <div className="p-2 rounded bg-slate-900 border border-sky-900/40">
              <span className="text-slate-500 block text-[10px]">UNVERIFIED</span>
              <span className="font-bold text-sky-400 text-base">
                {claimContext.externallyUnverifiedFactualClaims}
              </span>
            </div>
          </div>

          {/* Explicit Truth Invariant Note */}
          <div className="p-2.5 rounded-lg bg-sky-950/20 border border-sky-900/40 text-[11px] text-sky-300/90 leading-relaxed">
            <strong>Mandatory Invariant:</strong> UNVERIFIED claims are not assumed false. Unverified claims remain informational context and do not override satisfied hard gates.
          </div>

          <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/80 space-y-2 text-xs">
            <span className="text-[10px] font-mono uppercase text-slate-400 block font-semibold">
              External Catalog Truth Boundary
            </span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              This evaluator does not perform independent external catalog web lookup. Factual assertions (such as specifications or material percentages) remain marked as unverified informational context.
            </p>
          </div>
        </div>

      </div>

      {/* 6. ROOT-CAUSE SUMMARY */}
      <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Empirical Root-Cause Summary ({rootCauseSummary.allCauses.length})
          </h4>
          <span className="text-[11px] text-slate-500 font-mono">
            {rootCauseSummary.primaryCauses.length} Primary · {rootCauseSummary.contributingCauses.length} Contributing
          </span>
        </div>

        {rootCauseSummary.allCauses.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {rootCauseSummary.allCauses.map((rc) => (
              <div
                key={rc.causeId}
                className={`p-3 rounded-lg border bg-slate-900/50 space-y-1.5 ${
                  rc.code === 'NO_FAILURE'
                    ? 'border-emerald-900/40'
                    : rc.role === 'primary'
                    ? 'border-rose-900/40'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded ${
                        rc.code === 'NO_FAILURE'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : rc.role === 'primary'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {rc.code}
                    </span>
                    <span className="text-slate-300">{rc.category}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">
                    {rc.role} · {rc.productName}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed font-sans">{rc.explanation}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500 font-mono p-4 text-center">
            No diagnostic root causes recorded.
          </div>
        )}
      </div>

      {/* 7. PRIORITIZED NEXT ACTIONS (From Checkpoint 9) */}
      <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-emerald-400" />
            Prioritized Actionable Remediation ({prioritizedNextActions.length})
          </h4>
          <button
            type="button"
            onClick={() => onSelectTab('recommendations')}
            className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>View Full Recommendations Tab</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-2">
          {prioritizedNextActions.slice(0, 5).map((rec, idx) => (
            <div
              key={rec.recommendationId || idx}
              className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      rec.priority === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-300 border-rose-800'
                        : rec.priority === 'HIGH'
                        ? 'bg-rose-950/80 text-rose-400 border-rose-800'
                        : rec.priority === 'MEDIUM'
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : rec.priority === 'LOW'
                        ? 'bg-blue-950 text-blue-300 border-blue-800'
                        : rec.priority === 'INFORMATIONAL'
                        ? 'bg-sky-950 text-sky-300 border-sky-800'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    }`}
                  >
                    {rec.priority}
                  </span>
                  <span className="font-semibold text-slate-200">{rec.title}</span>
                  <span className="text-[10px] font-mono text-slate-500">[{rec.productName}]</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">{rec.action}</p>
                <p className="text-slate-500 text-[10px] italic">{rec.reason}</p>
              </div>

              <div className="text-[10px] font-mono text-slate-500 sm:text-right flex-shrink-0">
                <span>{rec.type}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 8. TRACEABILITY REFERENCES */}
      <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            End-to-End Pipeline Traceability Matrix
          </h4>
          <span className="text-[10px] font-mono text-slate-500">
            Checkpoints 2–9 Verified Traceability
          </span>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 px-3">Constraints</th>
                <th className="py-2 px-3">Claims</th>
                <th className="py-2 px-3">Verifications</th>
                <th className="py-2 px-3">Rubric Criteria</th>
                <th className="py-2 px-3">Root Causes</th>
                <th className="py-2 pl-3">Recommendations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {traceability.map((item, idx) => (
                <tr key={idx} className="text-[11px] text-slate-300 hover:bg-slate-900/40">
                  <td className="py-2.5 pr-3 font-semibold text-slate-200">
                    {item.productName} ({item.productId})
                  </td>
                  <td className="py-2.5 px-3 text-cyan-400">
                    {item.constraintIds.length > 0 ? item.constraintIds.join(', ') : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-violet-400">
                    {item.claimIds.length > 0 ? item.claimIds.join(', ') : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-emerald-400">
                    {item.verificationIds.length > 0 ? item.verificationIds.join(', ') : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400">
                    {item.rubricCriterionIds.length > 0 ? item.rubricCriterionIds.join(', ') : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-rose-400">
                    {item.rootCauseIds.length > 0 ? item.rootCauseIds.join(', ') : '—'}
                  </td>
                  <td className="py-2.5 pl-3 text-amber-400">
                    {item.recommendationIds.length > 0 ? item.recommendationIds.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
