import React, { useState } from 'react';
import { QaAssessmentReport } from './QaAssessmentReport';
import type { ReportExportDataParams } from '../services/evaluation/reportExportHelper';
import {
  Printer,
  Download,
  Copy,
  Check,
  Shield,
  Layers,
  FileText,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Info,
  Table,
  ExternalLink,
  MessageSquareQuote,
  Bot,
  FileCheck,
  BookOpen,
  ListChecks,
} from 'lucide-react';
import {
  EvaluatorInput,
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  ExtractedClaim,
  VerificationEngineResult,
  RubricEngineResult,
  ClaimSupportAnalysisResult,
  ClaimSupportRecord,
  RootCauseAnalysisResult,
  SeverityAndScoringResult,
  RecommendationEngineResult,
  FinalEvaluationResult,
  FinalVerdictState,
  HardGateState,
  SeverityRating,
  ResultTab,
} from '../types/evaluation';
import {
  buildExtractedClaimMap,
  formatReadableClaimStatement,
  buildExportJsonPayload,
  buildExportMarkdownReport,
  buildConciseProfessionalReport,
  buildDetailedProfessionalReport,
  buildProfessionalEvaluationReport,
  generateReportId,
} from '../services/evaluation/reportExportHelper';

interface ReportExportViewProps {
  conversationAssessments?: ReportExportDataParams[];
  isInputsModified?: boolean;
  inputs: EvaluatorInput;
  promptAnalysis: UserPromptAnalysisResult | null;
  claimAnalysis: LlmOutputClaimAnalysisResult | null;
  verificationResult: VerificationEngineResult | null;
  rubricResult: RubricEngineResult | null;
  claimSupportResult: ClaimSupportAnalysisResult | null;
  rootCauseResult: RootCauseAnalysisResult | null;
  severityAndScoringResult: SeverityAndScoringResult | null;
  recommendationResult: RecommendationEngineResult | null;
  finalEvaluationResult: FinalEvaluationResult | null;
  onSelectTab: (tab: ResultTab) => void;
}

export const ReportExportView: React.FC<ReportExportViewProps> = ({
  inputs,
  promptAnalysis,
  claimAnalysis,
  verificationResult,
  rubricResult,
  claimSupportResult,
  rootCauseResult,
  severityAndScoringResult,
  recommendationResult,
  finalEvaluationResult,
  onSelectTab,
  conversationAssessments,
  isInputsModified,
}) => {
  const [reportMode, setReportMode] = useState<'concise' | 'detailed' | 'technical'>('concise');
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [copiedConcise, setCopiedConcise] = useState(false);
  const [copiedDetailed, setCopiedDetailed] = useState(false);

  if (!finalEvaluationResult) {
    return (
      <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
        <FileCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <div className="text-base font-semibold text-slate-200">
          Evaluation Report Awaiting Pipeline Execution
        </div>
        <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1.5 leading-relaxed">
          Provide the User Prompt and LLM Output and click "RUN EVALUATION" to automatically run all pipeline stages and generate the audit-ready evaluation report.
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

  const reportId = generateReportId(finalEvaluationResult.evaluatedAt);
  const formattedDate = new Date(finalEvaluationResult.evaluatedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  // Map upstream extracted claims by claimId for deterministic claim statement reconstruction
  const extractedClaimMap = buildExtractedClaimMap(claimAnalysis?.claims);

  const getReadableClaimStatement = (supportRec: ClaimSupportRecord): string =>
    formatReadableClaimStatement(supportRec, extractedClaimMap);

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

  // Export A: Print / Save as PDF
  const handlePrint = () => {
    window.print();
  };

  // Export B: Export complete structured JSON
  const handleExportJson = () => {
    const payload = buildExportJsonPayload({
      reportId,
      inputs,
      promptAnalysis,
      claimAnalysis,
      verificationResult,
      rubricResult,
      claimSupportResult,
      rootCauseResult,
      severityAndScoringResult,
      recommendationResult,
      finalEvaluationResult,
    });

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${reportId.toLowerCase()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export C: Copy clean Markdown summary to clipboard
  const handleCopyMarkdown = () => {
    const md = buildExportMarkdownReport({
      reportId,
      inputs,
      promptAnalysis,
      claimAnalysis,
      verificationResult,
      rubricResult,
      claimSupportResult,
      rootCauseResult,
      severityAndScoringResult,
      recommendationResult,
      finalEvaluationResult,
    });

    navigator.clipboard.writeText(md);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 2000);
  };

  // Export D: Concise Professional prose report
  const conciseReport = buildConciseProfessionalReport({
    reportId,
    inputs,
    promptAnalysis,
    claimAnalysis,
    verificationResult,
    rubricResult,
    claimSupportResult,
    rootCauseResult,
    severityAndScoringResult,
    recommendationResult,
    finalEvaluationResult,
  });

  // Export E: Detailed Professional requirement-by-requirement audit report
  const detailedReport = buildDetailedProfessionalReport({
    reportId,
    inputs,
    promptAnalysis,
    claimAnalysis,
    verificationResult,
    rubricResult,
    claimSupportResult,
    rootCauseResult,
    severityAndScoringResult,
    recommendationResult,
    finalEvaluationResult,
  });

  const handleCopyConciseReport = () => {
    navigator.clipboard.writeText(conciseReport.plainText);
    setCopiedConcise(true);
    setTimeout(() => setCopiedConcise(false), 2000);
  };

  const handleCopyDetailedReport = () => {
    navigator.clipboard.writeText(detailedReport.plainText);
    setCopiedDetailed(true);
    setTimeout(() => setCopiedDetailed(false), 2000);
  };

  return (
    <div className="space-y-6">
      
      {/* REPORT MODE TOGGLE & EXPORT ACTION TOOLBAR (Hidden during print) */}
      <div className="no-print p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono block">
              Evaluation Report &amp; Export
            </span>
            <p className="text-xs text-slate-400 mt-0.5">
              {reportMode === 'concise'
                ? 'Concise natural language QA evaluation ready for submission.'
                : reportMode === 'detailed'
                ? 'Expanded requirement-by-requirement audit with product analysis and context.'
                : 'Exhaustive engineering audit with full constraint matrix, root causes, and traceability.'}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setReportMode('concise')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                reportMode === 'concise'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Concise Report</span>
            </button>
            <button
              type="button"
              onClick={() => setReportMode('detailed')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                reportMode === 'detailed'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Detailed Report</span>
            </button>
            <button
              type="button"
              onClick={() => setReportMode('technical')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                reportMode === 'technical'
                  ? 'bg-slate-800 text-emerald-400 font-semibold border border-slate-700/80 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Technical Audit Report</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Action: Copy Concise Report */}
          <button
            type="button"
            onClick={handleCopyConciseReport}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer ${
              reportMode === 'concise'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title="Copy concise professional report plain-text"
          >
            {copiedConcise ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span className="text-white">Copied Concise!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Concise Report</span>
              </>
            )}
          </button>

          {/* Action: Copy Detailed Report */}
          <button
            type="button"
            onClick={handleCopyDetailedReport}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer ${
              reportMode === 'detailed'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title="Copy detailed requirement-by-requirement report plain-text"
          >
            {copiedDetailed ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span className="text-white">Copied Detailed!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Detailed Report</span>
              </>
            )}
          </button>

          {/* Copy Technical Markdown */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
            title="Copy structured technical markdown report"
          >
            {copiedMarkdown ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-medium">Copied Markdown!</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy Technical Markdown</span>
              </>
            )}
          </button>

          {/* Export JSON */}
          <button
            type="button"
            onClick={handleExportJson}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
            title="Download full machine-readable JSON artifact"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          {/* Print / Save as PDF */}
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. CONCISE PROFESSIONAL REPORT DOCUMENT VIEW */}
      {/* ========================================================================= */}
      <QaAssessmentReport params={{inputs,promptAnalysis,claimAnalysis,verificationResult,rubricResult,claimSupportResult,rootCauseResult,severityAndScoringResult,recommendationResult,finalEvaluationResult}} conversationAssessments={conversationAssessments} stale={isInputsModified} />
      {reportMode === 'concise' && (
        <div className="print-clean-card p-6 md:p-8 rounded-xl bg-slate-950 border border-slate-800 space-y-6 text-slate-200">
          
          {/* CONCISE REPORT HEADER */}
          <div className="border-b border-slate-800 pb-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-emerald-400 font-semibold block">
                  Quality Assurance Evaluation Assessment
                </span>
                <h1 className="text-xl md:text-2xl font-bold text-slate-100 mt-1">
                  Shopping Assistant Response Evaluation
                </h1>
              </div>

              <div className="text-left sm:text-right font-mono text-xs text-slate-400 space-y-0.5 shrink-0">
                <div><span className="text-slate-500">Report ID:</span> <strong className="text-slate-200">{reportId}</strong></div>
                <div><span className="text-slate-500">Date:</span> {conciseReport.generatedDate}</div>
                <div><span className="text-slate-500">Items Evaluated:</span> {summary.totalProductsEvaluated}</div>
              </div>
            </div>

            {/* Authoritative Overall Verdict Banner */}
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                finalVerdict === 'PASS'
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-100'
                  : finalVerdict === 'FAIL'
                  ? 'bg-rose-950/40 border-rose-800 text-rose-100'
                  : 'bg-amber-950/40 border-amber-800 text-amber-100'
              }`}
            >
              <div className="flex items-center gap-3">
                {finalVerdict === 'PASS' ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
                ) : finalVerdict === 'FAIL' ? (
                  <XCircle className="w-7 h-7 text-rose-400 shrink-0" />
                ) : (
                  <HelpCircle className="w-7 h-7 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    QA Analyst Assessment
                  </div>
                  <div className="text-lg font-bold font-mono tracking-tight">
                    Overall Assessment: {finalVerdict}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700 text-slate-200 font-semibold">
                  Severity: {summary.overallSeverity}
                </span>
              </div>
            </div>
          </div>

          {/* OVERALL ASSESSMENT NARRATIVE */}
          <div className="space-y-2 border-b border-slate-800 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Overall Assessment
            </h2>
            <p className="text-sm text-slate-200 leading-relaxed font-sans">
              {conciseReport.executiveSummary}
            </p>
          </div>

          {/* KEY FINDINGS */}
          <div className="space-y-2.5 border-b border-slate-800 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Key Findings
            </h2>
            <ul className="space-y-2 text-sm text-slate-300 font-sans">
              {conciseReport.findings.map((finding, idx) => (
                <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="text-emerald-400 font-bold mt-0.5">•</span>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* PRODUCT-SPECIFIC ASSESSMENTS */}
          <div className="space-y-3 border-b border-slate-800 pb-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Product-Specific Assessments
              </h2>
              <span className="text-xs font-mono text-slate-500">
                Independent Item Isolation
              </span>
            </div>

            <div className="space-y-3">
              {conciseReport.productAssessments.map((pa) => (
                <div
                  key={pa.productId}
                  className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 space-y-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-semibold text-slate-100 flex items-center gap-2">
                      <span>{pa.productName}</span>
                    </div>
                    <div>
                      {getVerdictBadge(pa.verdict as FinalVerdictState)}
                    </div>
                  </div>

                  <p className="text-slate-300 leading-relaxed font-sans text-xs sm:text-sm">
                    {pa.narrative}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* RECOMMENDED CORRECTIVE ACTIONS */}
          <div className="space-y-2.5 border-b border-slate-800 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Recommended Corrective Actions
            </h2>
            <ol className="space-y-2 text-sm text-slate-300 font-sans">
              {conciseReport.correctiveActions.map((action, idx) => (
                <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="font-mono text-emerald-400 font-semibold">{idx + 1}.</span>
                  <span>{action}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* FINAL CONCLUSION */}
          <div className="space-y-2 border-b border-slate-800 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Final Conclusion
            </h2>
            <p className="text-sm text-slate-200 leading-relaxed font-sans">
              {conciseReport.conclusion}
            </p>
          </div>

          {/* ASSESSMENT LIMITATIONS */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2 text-xs">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Assessment Limitations
            </h4>
            <ul className="space-y-1.5 text-slate-400 text-xs leading-relaxed font-sans">
              {conciseReport.assessmentLimitations.map((lim, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-slate-500">•</span>
                  <span>{lim}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DETAILED PROFESSIONAL REPORT DOCUMENT VIEW */}
      {/* ========================================================================= */}
      {reportMode === 'detailed' && (
        <div className="print-clean-card p-6 md:p-8 rounded-xl bg-slate-950 border border-slate-800 space-y-6 text-slate-200">
          
          {/* DETAILED REPORT HEADER */}
          <div className="border-b border-slate-800 pb-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-emerald-400 font-semibold block">
                  Detailed QA Audit &amp; Constraint Verification
                </span>
                <h1 className="text-xl md:text-2xl font-bold text-slate-100 mt-1">
                  Shopping Assistant Response Evaluation — Detailed Audit
                </h1>
              </div>

              <div className="text-left sm:text-right font-mono text-xs text-slate-400 space-y-0.5 shrink-0">
                <div><span className="text-slate-500">Report ID:</span> <strong className="text-slate-200">{reportId}</strong></div>
                <div><span className="text-slate-500">Date:</span> {detailedReport.generatedDate}</div>
                <div><span className="text-slate-500">Items Evaluated:</span> {summary.totalProductsEvaluated}</div>
              </div>
            </div>

            {/* Authoritative Overall Verdict Banner */}
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                finalVerdict === 'PASS'
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-100'
                  : finalVerdict === 'FAIL'
                  ? 'bg-rose-950/40 border-rose-800 text-rose-100'
                  : 'bg-amber-950/40 border-amber-800 text-amber-100'
              }`}
            >
              <div className="flex items-center gap-3">
                {finalVerdict === 'PASS' ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
                ) : finalVerdict === 'FAIL' ? (
                  <XCircle className="w-7 h-7 text-rose-400 shrink-0" />
                ) : (
                  <HelpCircle className="w-7 h-7 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    Comprehensive QA Verdict
                  </div>
                  <div className="text-lg font-bold font-mono tracking-tight">
                    Overall Assessment: {finalVerdict}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded bg-slate-900/80 border border-slate-700 text-slate-200 font-semibold">
                  Severity: {summary.overallSeverity}
                </span>
              </div>
            </div>
          </div>

          {/* CUSTOMER REQUEST & ASSISTANT RECOMMENDATION CONTEXT */}
          <div className="space-y-3 border-b border-slate-800 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Customer Request &amp; Assistant Recommendation Context
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
                <div className="text-xs font-mono text-emerald-400 font-semibold flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Customer Prompt</span>
                </div>
                <div className="text-xs text-slate-200 font-mono bg-slate-950/60 p-2.5 rounded border border-slate-800/80 whitespace-pre-wrap leading-relaxed">
                  {inputs.userPrompt}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
                <div className="text-xs font-mono text-sky-400 font-semibold flex items-center gap-1.5">
                  <MessageSquareQuote className="w-3.5 h-3.5" />
                  <span>Assistant Output</span>
                </div>
                <div className="text-xs text-slate-200 font-mono bg-slate-950/60 p-2.5 rounded border border-slate-800/80 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {inputs.llmOutput}
                </div>
              </div>
            </div>
          </div>

          {/* OVERALL ASSESSMENT NARRATIVE */}
          <div className="space-y-2 border-b border-slate-800 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Overall Assessment
            </h2>
            <p className="text-sm text-slate-200 leading-relaxed font-sans">
              {detailedReport.executiveSummary}
            </p>
          </div>

          {/* KEY FINDINGS */}
          <div className="space-y-2.5 border-b border-slate-800 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Key Findings
            </h2>
            <ul className="space-y-2 text-sm text-slate-300 font-sans">
              {detailedReport.keyFindings.map((finding, idx) => (
                <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="text-emerald-400 font-bold mt-0.5">•</span>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* REQUIREMENT-BY-REQUIREMENT EVALUATION */}
          <div className="space-y-3 border-b border-slate-800 pb-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Requirement-by-Requirement Evaluation
              </h2>
              <span className="text-xs font-mono text-slate-500">
                {detailedReport.evaluatedRequirements.length} Criteria Evaluated
              </span>
            </div>

            <div className="space-y-2.5">
              {detailedReport.evaluatedRequirements.map((req, idx) => {
                const isPass = req.status === 'PASS';
                const isFail = req.status === 'FAIL';
                return (
                  <div
                    key={`${req.constraintId}-${idx}`}
                    className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-200 text-sm">
                          "{req.sourceText}"
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                          {req.productName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800/60 text-slate-500">
                          {req.type.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-slate-300 leading-relaxed font-sans">
                        {req.evidenceOrDetails}
                      </p>
                    </div>

                    <div className="shrink-0 self-start">
                      {isPass ? (
                        <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          Satisfied
                        </span>
                      ) : isFail ? (
                        <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-rose-950 text-rose-300 border border-rose-700 flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          Violated
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-amber-950 text-amber-300 border border-amber-700 flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                          Unconfirmed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PRODUCT-SPECIFIC ANALYSIS */}
          <div className="space-y-3 border-b border-slate-800 pb-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Product-Specific Analysis
              </h2>
              <span className="text-xs font-mono text-slate-500">
                Independent Isolation
              </span>
            </div>

            <div className="space-y-4">
              {detailedReport.productAnalyses.map((pa) => (
                <div
                  key={pa.productId}
                  className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-slate-800/80 pb-2.5">
                    <div>
                      <span className="font-semibold text-slate-100 text-base">
                        {pa.productName}
                      </span>
                      <span className="text-xs text-slate-400 font-mono ml-2">
                        ({pa.verdictLabel})
                      </span>
                    </div>
                    <div>
                      {getVerdictBadge(pa.verdict as FinalVerdictState)}
                    </div>
                  </div>

                  <p className="text-slate-300 leading-relaxed font-sans text-xs sm:text-sm">
                    {pa.narrative}
                  </p>

                  {/* Isolated Actionable Guidance */}
                  {pa.isolatedCorrectiveActions.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                        Actionable Guidance:
                      </div>
                      <ul className="space-y-1 text-xs text-slate-300">
                        {pa.isolatedCorrectiveActions.map((act, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-emerald-400">•</span>
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* MULTI-PRODUCT & CART SCOPE NOTE */}
          {detailedReport.cartVerificationNote && (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1.5 text-xs">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                Multi-Product &amp; Shopping Cart Scope
              </h4>
              <p className="text-slate-400 leading-relaxed font-sans">
                {detailedReport.cartVerificationNote}
              </p>
            </div>
          )}

          {/* RECOMMENDED CORRECTIVE ACTIONS */}
          <div className="space-y-2.5 border-b border-slate-800 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Recommended Corrective Actions
            </h2>
            <ol className="space-y-2 text-sm text-slate-300 font-sans">
              {detailedReport.prioritizedCorrectiveActions.map((action, idx) => (
                <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                  <span className="font-mono text-emerald-400 font-semibold">{idx + 1}.</span>
                  <span>{action}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* FINAL CONCLUSION */}
          <div className="space-y-2 border-b border-slate-800 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Final Conclusion
            </h2>
            <p className="text-sm text-slate-200 leading-relaxed font-sans">
              {detailedReport.conclusion}
            </p>
          </div>

          {/* ASSESSMENT LIMITATIONS */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2 text-xs">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Assessment Scope &amp; Limitations
            </h4>
            <ul className="space-y-1.5 text-slate-400 text-xs leading-relaxed font-sans">
              {detailedReport.assessmentLimitations.map((lim, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-slate-500">•</span>
                  <span>{lim}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TECHNICAL AUDIT REPORT DOCUMENT CONTAINER (Print-optimized) */}
      {/* ========================================================================= */}
      {reportMode === 'technical' && (
      <div className="print-clean-card p-6 rounded-xl bg-slate-950 border border-slate-800 space-y-6">
        
        {/* SECTION 1: REPORT HEADER */}
        <div className="border-b border-slate-800 pb-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 uppercase tracking-wider">
                <span>AI Shopping Assistant Evaluation</span>
                <span>·</span>
                <span>Audit Specification v1.1</span>
              </div>
              <h1 className="text-xl font-bold text-slate-100 mt-1">
                AI Shopping Assistant Evaluation Report
              </h1>
            </div>

            <div className="text-left sm:text-right font-mono text-xs text-slate-400 space-y-0.5">
              <div><span className="text-slate-500">Report ID:</span> <strong className="text-slate-200">{reportId}</strong></div>
              <div><span className="text-slate-500">Timestamp:</span> {formattedDate}</div>
              <div><span className="text-slate-500">Products Evaluated:</span> {summary.totalProductsEvaluated}</div>
            </div>
          </div>

          {/* Prominent Overall Verdict Bar */}
          <div
            className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              finalVerdict === 'PASS'
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-100'
                : finalVerdict === 'FAIL'
                ? 'bg-rose-950/40 border-rose-800/80 text-rose-100'
                : 'bg-amber-950/40 border-amber-800/80 text-amber-100'
            }`}
          >
            <div className="flex items-center gap-3">
              {finalVerdict === 'PASS' ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              ) : finalVerdict === 'FAIL' ? (
                <XCircle className="w-8 h-8 text-rose-400 shrink-0" />
              ) : (
                <HelpCircle className="w-8 h-8 text-amber-400 shrink-0" />
              )}
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Authoritative Evaluation Verdict
                </div>
                <div className="text-xl font-black font-mono tracking-tight">
                  OVERALL VERDICT: {finalVerdict}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="px-2 py-1 rounded bg-slate-900/80 border border-slate-700/80 text-slate-200">
                Severity: {summary.overallSeverity}
              </span>
              <span className="px-2 py-1 rounded bg-slate-900/80 border border-slate-700/80 text-slate-200">
                Score: {summary.averageEvaluatedEvidenceScore !== null ? `${summary.averageEvaluatedEvidenceScore}/100` : 'N/A'}
              </span>
              <span className="px-2 py-1 rounded bg-slate-900/80 border border-slate-700/80 text-slate-200">
                Gates: {summary.hardGateDistribution.pass}P · {summary.hardGateDistribution.fail}F · {summary.hardGateDistribution.indeterminate}U
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 2: ORIGINAL EVALUATION INPUTS */}
        <div className="space-y-3 border-b border-slate-800 pb-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <MessageSquareQuote className="w-3.5 h-3.5 text-cyan-400" />
              1. Original Evaluation Inputs (Strictly 2 Inputs)
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              Evaluator Contract Grounding
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* User Prompt */}
            <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono uppercase text-cyan-400 font-semibold block">
                Shopper Prompt
              </span>
              <p className="text-xs text-slate-200 font-sans leading-relaxed whitespace-pre-wrap">
                {inputs.userPrompt}
              </p>
            </div>

            {/* LLM Output */}
            <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-[10px] font-mono uppercase text-violet-400 font-semibold block">
                Assistant Response
              </span>
              <p className="text-xs text-slate-200 font-sans leading-relaxed whitespace-pre-wrap">
                {inputs.llmOutput}
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 3: EXECUTIVE EVALUATION SUMMARY */}
        <div className="space-y-3 border-b border-slate-800 pb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            2. Executive Evaluation Summary
          </h3>

          <div className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800 space-y-2 text-xs">
            <p className="text-slate-200 leading-relaxed font-sans">
              <strong>Verdict Determination:</strong> {verdictRationale}
            </p>
            
            <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="text-slate-400">
                Confirmed Hard Failures: <strong className={summary.totalConfirmedFailures > 0 ? "text-rose-400" : "text-emerald-400"}>{summary.totalConfirmedFailures}</strong>
              </div>
              <div className="text-slate-400">
                Unresolved Unknown: <strong className={summary.totalUnresolvedUnknown > 0 ? "text-amber-400" : "text-slate-400"}>{summary.totalUnresolvedUnknown}</strong>
              </div>
              <div className="text-slate-400">
                Unverified Factual Claims: <strong className="text-sky-400">{summary.totalUnverifiedFactualClaims}</strong>
              </div>
            </div>

            <div className="p-2 rounded bg-slate-950 text-[11px] font-mono text-slate-400 border border-slate-800">
              <span className="text-amber-300 font-semibold">Semantic Invariants: </span>
              UNKNOWN ≠ FAIL · UNVERIFIED ≠ FALSE · Numeric evidence scores cannot soften or override an authoritative hard-gate failure.
            </div>
          </div>
        </div>

        {/* SECTION 4: PRODUCT-LEVEL RESULTS */}
        <div className="space-y-3 border-b border-slate-800 pb-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              3. Product-Level Results (Strict Product Isolation)
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              {productVerdicts.length} Product(s) Evaluated
            </span>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs font-mono border border-slate-800 rounded-lg overflow-hidden">
              <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Product (ID)</th>
                  <th className="py-2.5 px-3">Verdict</th>
                  <th className="py-2.5 px-3">Hard Gate</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Score</th>
                  <th className="py-2.5 px-3">Hard Satisfaction</th>
                  <th className="py-2.5 px-3">Remediation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                {productVerdicts.map((pv) => (
                  <tr key={pv.productId} className="hover:bg-slate-900/30">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">
                      {pv.productName} <span className="text-slate-500 text-[10px]">({pv.productId})</span>
                    </td>
                    <td className="py-2.5 px-3">{getVerdictBadge(pv.verdict)}</td>
                    <td className="py-2.5 px-3">{getHardGateBadge(pv.hardGateState)}</td>
                    <td className="py-2.5 px-3">{getSeverityBadge(pv.severity)}</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">
                      {pv.evaluatedEvidenceScore !== null ? `${pv.evaluatedEvidenceScore}/100` : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {pv.confirmedHardSatisfactionPercent}%{' '}
                      <span className="text-slate-500 text-[10px]">
                        ({pv.passedHardCount}P · {pv.failedHardCount}F · {pv.unknownHardCount}U)
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-xs">
                      {pv.remediationSummary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 5: REQUIREMENT / CONSTRAINT FINDINGS */}
        <div className="space-y-3 border-b border-slate-800 pb-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <Table className="w-3.5 h-3.5 text-cyan-400" />
              4. Requirement &amp; Constraint Verification Matrix
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              UNKNOWN requirements are not counted as failures
            </span>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs font-mono border border-slate-800 rounded-lg overflow-hidden">
              <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2.5">ID</th>
                  <th className="py-2 px-2.5">Requirement</th>
                  <th className="py-2 px-2.5">Product</th>
                  <th className="py-2 px-2.5">Type</th>
                  <th className="py-2 px-2.5">Status</th>
                  <th className="py-2 px-2.5">Evidence from Output</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 text-[11px]">
                {verificationResult?.records.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-900/30">
                    <td className="py-2 px-2.5 font-bold text-slate-400">{v.constraintId}</td>
                    <td className="py-2 px-2.5 text-slate-200">{v.constraintEvidence}</td>
                    <td className="py-2 px-2.5 text-slate-300">{v.productName}</td>
                    <td className="py-2 px-2.5 text-slate-400 uppercase text-[10px]">{v.constraintType}</td>
                    <td className="py-2 px-2.5">
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          v.status === 'PASS'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : v.status === 'FAIL'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-slate-400 font-sans">
                      {v.claimEvidence.length > 0 ? v.claimEvidence.join(', ') : 'Evidence absent from response'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 6: CLAIM SUPPORT & TRUTH CONTEXT */}
        <div className="space-y-3 border-b border-slate-800 pb-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-violet-400" />
              5. Claim Support &amp; Truth Context
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              UNVERIFIED ≠ FALSE
            </span>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs font-mono border border-slate-800 rounded-lg overflow-hidden">
              <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2.5">Claim ID</th>
                  <th className="py-2 px-2.5">Product</th>
                  <th className="py-2 px-2.5">Claim Statement</th>
                  <th className="py-2 px-2.5">Nature</th>
                  <th className="py-2 px-2.5">Response Support</th>
                  <th className="py-2 px-2.5">External Truth Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 text-[11px]">
                {claimSupportResult?.records.map((c) => (
                  <tr key={c.claimId} className="hover:bg-slate-900/30">
                    <td className="py-2 px-2.5 font-bold text-violet-400 whitespace-nowrap">{c.claimId}</td>
                    <td className="py-2 px-2.5 text-slate-300 whitespace-nowrap">{c.productName || 'General'}</td>
                    <td className="py-2 px-2.5 text-slate-200 font-sans">
                      <div className="font-medium text-slate-100">{getReadableClaimStatement(c)}</div>
                      {c.sourceEvidence && c.sourceEvidence !== c.statement && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Evidence: &ldquo;{c.sourceEvidence}&rdquo;
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-slate-400 text-[10px] uppercase whitespace-nowrap">{c.nature}</td>
                    <td className="py-2 px-2.5 whitespace-nowrap">
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-900 text-slate-300 border border-slate-800">
                        {c.responseSupport}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 whitespace-nowrap">
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-950 text-sky-300 border border-sky-800">
                        {c.externalTruthStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-2.5 rounded bg-sky-950/20 border border-sky-900/40 text-[11px] text-sky-300/90 leading-relaxed">
            <strong>Context Notice:</strong> UNVERIFIED means independent external catalog verification was not performed in this session. UNVERIFIED does NOT mean false or hallucinated.
          </div>
        </div>

        {/* SECTION 7: ROOT-CAUSE FINDINGS */}
        <div className="space-y-3 border-b border-slate-800 pb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            6. Empirical Root-Cause Diagnostics
          </h3>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs font-mono border border-slate-800 rounded-lg overflow-hidden">
              <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2.5">Cause ID</th>
                  <th className="py-2 px-2.5">Product</th>
                  <th className="py-2 px-2.5">Code</th>
                  <th className="py-2 px-2.5">Category</th>
                  <th className="py-2 px-2.5">Role</th>
                  <th className="py-2 px-2.5">Diagnostic Explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 text-[11px]">
                {rootCauseSummary.allCauses.map((rc) => (
                  <tr key={rc.causeId} className="hover:bg-slate-900/30">
                    <td className="py-2 px-2.5 font-bold text-slate-400">{rc.causeId}</td>
                    <td className="py-2 px-2.5 text-slate-300">{rc.productName}</td>
                    <td className="py-2 px-2.5 font-bold text-amber-400">{rc.code}</td>
                    <td className="py-2 px-2.5 text-slate-300">{rc.category}</td>
                    <td className="py-2 px-2.5 uppercase text-[10px] text-slate-400">{rc.role}</td>
                    <td className="py-2 px-2.5 text-slate-300 font-sans">{rc.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 8: ACTIONABLE RECOMMENDATIONS */}
        <div className="space-y-3 border-b border-slate-800 pb-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-emerald-400" />
              7. Prioritized Actionable Recommendations
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              Ranked by Authoritative Priority
            </span>
          </div>

          <div className="space-y-2">
            {prioritizedNextActions.map((rec, idx) => (
              <div
                key={rec.recommendationId || idx}
                className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
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

        {/* SECTION 9: TRACEABILITY */}
        <div className="space-y-3 border-b border-slate-800 pb-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              8. End-to-End Traceability Matrix
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              Verified Pipeline References
            </span>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs font-mono border border-slate-800 rounded-lg overflow-hidden">
              <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2.5">Product</th>
                  <th className="py-2 px-2.5">Constraints</th>
                  <th className="py-2 px-2.5">Claims</th>
                  <th className="py-2 px-2.5">Verifications</th>
                  <th className="py-2 px-2.5">Rubric Criteria</th>
                  <th className="py-2 px-2.5">Root Causes</th>
                  <th className="py-2 px-2.5">Recommendations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 text-[11px]">
                {traceability.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/30">
                    <td className="py-2 px-2.5 font-bold text-slate-200">{item.productName}</td>
                    <td className="py-2 px-2.5 text-cyan-400">{item.constraintIds.join(', ') || '—'}</td>
                    <td className="py-2 px-2.5 text-violet-400">{item.claimIds.join(', ') || '—'}</td>
                    <td className="py-2 px-2.5 text-emerald-400">{item.verificationIds.join(', ') || '—'}</td>
                    <td className="py-2 px-2.5 text-slate-400">{item.rubricCriterionIds.join(', ') || '—'}</td>
                    <td className="py-2 px-2.5 text-rose-400">{item.rootCauseIds.join(', ') || '—'}</td>
                    <td className="py-2 px-2.5 text-amber-400">{item.recommendationIds.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 10: REPORT INVARIANTS & LIMITATIONS */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2 text-xs">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            9. Report Grounding Invariants &amp; Audit Limitations
          </h4>
          <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed">
            <li><strong>Hard gates are authoritative:</strong> Numeric evidence scores cannot soften, override, or compensate for hard-gate failures.</li>
            <li><strong>UNKNOWN is not FAIL:</strong> Missing evidence is documented as unconfirmed requirement context, not as an affirmative product failure.</li>
            <li><strong>UNVERIFIED is not FALSE:</strong> Unverified factual claims are marked as informational context and do not override satisfied hard gates.</li>
            <li><strong>Numeric evidence scores are not probabilities:</strong> The 0–100 evidence score represents confirmed coverage and requirement satisfaction, not probability of correctness or product quality.</li>
            <li><strong>Closed evaluation boundary:</strong> Findings are derived exclusively from the human-supplied User Prompt and LLM Output. External web lookup or product catalog verification was not performed.</li>
          </ul>
        </div>

      </div>
      )}

    </div>
  );
};
