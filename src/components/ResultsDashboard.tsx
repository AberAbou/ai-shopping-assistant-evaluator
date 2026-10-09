import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ShieldAlert,
  ListChecks,
  Table,
  Cpu,
  HelpCircle,
  Copy,
  Check,
  Compass,
  ArrowUpRight,
  MinusCircle,
  Clock,
  Tag,
  Package,
  CheckCircle,
  XCircle,
  AlertOctagon,
  Shield,
  Info,
  Layers,
  Wrench,
  Search,
  Filter,
  Lightbulb,
  Award,
  FileCheck,
} from 'lucide-react';
import {
  UserPromptAnalysisResult,
  LlmOutputClaimAnalysisResult,
  VerificationEngineResult,
  RubricEngineResult,
  ClaimSupportAnalysisResult,
  RootCauseAnalysisResult,
  SeverityAndScoringResult,
  SeverityRating,
  ProductSeverityResult,
  ProductEvaluationScore,
  EvaluatorInput,
  HardGateState,
  RootCauseCode,
  RootCauseRole,
  RecommendationEngineResult,
  ActionableRecommendation,
  RecommendationType,
  RecommendationPriority,
  ProductRecommendationSummary,
  FinalEvaluationResult,
  ResultTab,
} from '../types/evaluation';
import { FinalEvaluationView } from './FinalEvaluationView';
import { ReportExportView } from './ReportExportView';
import type { ReportExportDataParams } from '../services/evaluation/reportExportHelper';

interface ResultsDashboardProps {
  conversationAssessments?: ReportExportDataParams[];
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
  isInputsModified?: boolean;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
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
  isInputsModified = false,
  conversationAssessments,
}) => {
  const [activeTab, setActiveTab] = useState<ResultTab>('overview');
  const [copiedJson, setCopiedJson] = useState(false);
  
  // Filters
  const [claimFilter, setClaimFilter] = useState<'all' | 'factual' | 'subjective' | 'contradicted' | 'high_priority'>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRubricProductId, setSelectedRubricProductId] = useState<string>('all');
  const [rootCauseFilter, setRootCauseFilter] = useState<'all' | 'primary' | 'contributing'>('all');
  const [recPriorityFilter, setRecPriorityFilter] = useState<string>('all');
  const [recTypeFilter, setRecTypeFilter] = useState<string>('all');
  const [recProductFilter, setRecProductFilter] = useState<string>('all');

  const isFinalEvaluationDone = Boolean(finalEvaluationResult);
  const isRecommendationsDone = Boolean(recommendationResult);
  const isSeverityScoringDone = Boolean(severityAndScoringResult);
  const isRootCauseDone = Boolean(rootCauseResult);
  const isClaimSupportDone = Boolean(claimSupportResult);
  const isRubricEvaluated = Boolean(rubricResult);
  const isVerified = Boolean(verificationResult);
  const isPromptAnalyzed = Boolean(promptAnalysis);
  const isClaimAnalyzed = Boolean(claimAnalysis);

  const rawJsonDisplay = {
    metadata: {
      evaluatorVersion: "1.0.0-shell",
      status: isFinalEvaluationDone
        ? "FINAL_INTEGRATED_EVALUATION_COMPLETE"
        : isRecommendationsDone
        ? "RECOMMENDATIONS_COMPLETE_FINAL_EVALUATION_NOT_YET_GENERATED"
        : isSeverityScoringDone
        ? "SEVERITY_AND_SCORING_COMPLETE_RECOMMENDATIONS_NOT_YET_GENERATED_FINAL_EVALUATION_NOT_YET_RUN"
        : isRootCauseDone
        ? "ROOT_CAUSE_ANALYSIS_COMPLETE_RECOMMENDATIONS_NOT_YET_GENERATED_FULL_EVALUATION_NOT_YET_RUN"
        : isClaimSupportDone
        ? "CLAIM_SUPPORT_ANALYSIS_COMPLETE_EXTERNAL_TRUTH_NOT_PERFORMED_FULL_EVALUATION_NOT_YET_RUN"
        : isRubricEvaluated
        ? "RUBRIC_AND_HARD_GATE_EVALUATION_COMPLETE_FULL_EVALUATION_NOT_YET_RUN"
        : isVerified
        ? "CONSTRAINT_VERIFICATION_COMPLETE_FINAL_SCORING_NOT_YET_RUN"
        : isPromptAnalyzed && isClaimAnalyzed
        ? "PROMPT_AND_CLAIM_ANALYSIS_COMPLETE_FULL_EVALUATION_NOT_YET_RUN"
        : "awaiting_evaluation",
      inputContract: "EXACTLY_TWO_INPUTS",
      externalTruthVerificationConducted: false,
    },
    evaluatorInputs: {
      userPromptLength: inputs.userPrompt.length,
      llmOutputLength: inputs.llmOutput.length,
    },
    promptAnalysis: promptAnalysis || null,
    claimAnalysis: claimAnalysis || null,
    verificationResult: verificationResult || null,
    rubricResult: rubricResult || null,
    claimSupportResult: claimSupportResult || null,
    rootCauseResult: rootCauseResult || null,
    severityAndScoringResult: severityAndScoringResult || null,
    recommendationResult: recommendationResult || null,
    finalEvaluationResult: finalEvaluationResult || null,
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(rawJsonDisplay, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const tabs: { id: ResultTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'overview', label: '1. Overview', icon: <Activity className="w-3.5 h-3.5" /> },
    {
      id: 'constraints',
      label: '2. Constraint Matrix',
      icon: <Table className="w-3.5 h-3.5" />,
      badge: verificationResult
        ? `${verificationResult.records.length}`
        : promptAnalysis
        ? `${promptAnalysis.constraints.length}`
        : undefined,
    },
    {
      id: 'claims',
      label: '3. Claim Support & Evidence',
      icon: <FileText className="w-3.5 h-3.5" />,
      badge: claimSupportResult
        ? `${claimSupportResult.records.length}`
        : claimAnalysis
        ? `${claimAnalysis.claims.length}`
        : undefined,
    },
    {
      id: 'rubric',
      label: '4. Rubric & Hard Gates',
      icon: <ListChecks className="w-3.5 h-3.5" />,
      badge: rubricResult ? `${rubricResult.productsList.length} prod` : undefined,
    },
    {
      id: 'root_cause',
      label: '5. Root Cause Diagnostics',
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
      badge: rootCauseResult ? `${rootCauseResult.records.length} diag` : undefined,
    },
    {
      id: 'severity_scoring',
      label: '6. Severity & Scoring',
      icon: <Layers className="w-3.5 h-3.5" />,
      badge: severityAndScoringResult
        ? `${severityAndScoringResult.responseSeverity.overallSeverity}`
        : undefined,
    },
    {
      id: 'recommendations',
      label: '7. Recommendations',
      icon: <Lightbulb className="w-3.5 h-3.5" />,
      badge: recommendationResult
        ? `${recommendationResult.recommendations.length} recs`
        : undefined,
    },
    {
      id: 'final_evaluation',
      label: '8. Final Evaluation',
      icon: <Award className="w-3.5 h-3.5" />,
      badge: finalEvaluationResult ? finalEvaluationResult.finalVerdict : undefined,
    },
    { id: 'raw_json', label: '9. Raw JSON', icon: <Cpu className="w-3.5 h-3.5" /> },
    {
      id: 'report_export',
      label: '10. Report & Export',
      icon: <FileCheck className="w-3.5 h-3.5" />,
      badge: finalEvaluationResult ? 'Audit' : undefined,
    },
  ];

  const intent = promptAnalysis?.intent;
  const products = claimAnalysis?.products || [];
  const records = verificationResult?.records || [];
  const overallSummary = verificationResult?.overallSummary;

  const rubricProductList = rubricResult?.productsList || [];
  const rubricOverall = rubricResult?.overallSummary;

  const claimSupportRecords = claimSupportResult?.records || [];
  const claimSupportOverall = claimSupportResult?.overallSummary;

  const rootCauseRecords = rootCauseResult?.records || [];
  const rootCauseOverall = rootCauseResult?.overallSummary;
  const rootCauseProductList = rootCauseResult?.productsList || [];

  const responseSeverity = severityAndScoringResult?.responseSeverity;
  const productSeverities = severityAndScoringResult?.productSeverities || {};
  const productScores = severityAndScoringResult?.productScores || {};
  const scoringOverall = severityAndScoringResult?.overallSummary;
  const scoringProductsList = severityAndScoringResult?.productsList || [];

  const recommendationsList = recommendationResult?.recommendations || [];
  const recommendationSummaries = recommendationResult?.productSummaries || {};
  const recommendationOverall = recommendationResult?.overallSummary;
  const recommendationProductsList = recommendationResult?.productsList || [];

  const filteredRecommendations = recommendationsList.filter((r) => {
    if (recPriorityFilter !== 'all' && r.priority !== recPriorityFilter) return false;
    if (recTypeFilter !== 'all' && r.type !== recTypeFilter) return false;
    if (recProductFilter !== 'all' && r.productId !== recProductFilter) return false;
    return true;
  });

  const filteredClaimSupport = claimSupportRecords.filter((r) => {
    if (claimFilter === 'factual') return r.nature === 'factual';
    if (claimFilter === 'subjective') return r.nature === 'subjective';
    if (claimFilter === 'contradicted') return r.internalConsistency === 'CONTRADICTED';
    if (claimFilter === 'high_priority') return r.verificationPriority === 'HIGH';
    return true;
  });

  const filteredRecords = records.filter((r) => {
    if (productFilter !== 'all' && r.productId !== productFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  const displayedRubricEvaluations = selectedRubricProductId === 'all'
    ? rubricProductList
    : rubricProductList.filter((p) => p.productId === selectedRubricProductId);

  const filteredRootCauseRecords = rootCauseRecords.filter((r) => {
    if (rootCauseFilter === 'primary') return r.role === 'primary';
    if (rootCauseFilter === 'contributing') return r.role === 'contributing';
    return true;
  });

  const getHardGateBadge = (state: HardGateState) => {
    switch (state) {
      case 'HARD_GATE_PASS':
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/80 inline-flex items-center gap-1.5 shadow-sm">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            HARD_GATE_PASS
          </span>
        );
      case 'HARD_GATE_FAIL':
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700/80 inline-flex items-center gap-1.5 shadow-sm">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            HARD_GATE_FAIL
          </span>
        );
      case 'HARD_GATE_INDETERMINATE':
      default:
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-700/80 inline-flex items-center gap-1.5 shadow-sm">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            HARD_GATE_INDETERMINATE
          </span>
        );
    }
  };

  const getCauseCodeBadge = (code: RootCauseCode) => {
    if (code === 'NO_FAILURE') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-emerald-400" />
          NO_OBSERVED_FAILURE
        </span>
      );
    }
    if (code === 'HC-01' || code === 'NC-01') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
          <XCircle className="w-3 h-3 text-rose-400" />
          {code}
        </span>
      );
    }
    if (code === 'INT-01' || code === 'CAT-01') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
          <Compass className="w-3 h-3 text-amber-400" />
          {code}
        </span>
      );
    }
    if (code === 'FAC-01') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1">
          <AlertOctagon className="w-3 h-3 text-purple-400" />
          {code}
        </span>
      );
    }
    if (code === 'SAF-01') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
          <ShieldAlert className="w-3 h-3 text-rose-400" />
          {code}
        </span>
      );
    }
    if (code === 'RET-01' || code === 'DAT-01') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-amber-300 border border-slate-700 flex items-center gap-1">
          <HelpCircle className="w-3 h-3 text-amber-400" />
          {code}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-900 text-slate-300 border border-slate-800">
        {code}
      </span>
    );
  };

  const getRoleBadge = (role: RootCauseRole, code?: RootCauseCode) => {
    if (code === 'NO_FAILURE') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800/80">
          PRIMARY
        </span>
      );
    }
    return role === 'primary' ? (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-950 text-rose-300 border border-rose-800/80">
        PRIMARY
      </span>
    ) : (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-slate-800 text-slate-400 border border-slate-700">
        CONTRIBUTING
      </span>
    );
  };

  const getSeverityBadge = (severity: SeverityRating) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700 inline-flex items-center gap-1.5 shadow-sm">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            CRITICAL
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-800 inline-flex items-center gap-1.5 shadow-sm">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            HIGH
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800 inline-flex items-center gap-1.5 shadow-sm">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            MEDIUM
          </span>
        );
      case 'LOW':
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-blue-950 text-blue-300 border border-blue-800 inline-flex items-center gap-1.5 shadow-sm">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            LOW
          </span>
        );
      case 'INFORMATIONAL':
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-sky-950 text-sky-300 border border-sky-800 inline-flex items-center gap-1.5 shadow-sm">
            <Info className="w-3.5 h-3.5 text-sky-400" />
            INFORMATIONAL
          </span>
        );
      case 'NONE':
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 inline-flex items-center gap-1.5 shadow-sm">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            NONE (SATISFIED)
          </span>
        );
      case 'INDETERMINATE':
      default:
        return (
          <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-slate-900 text-slate-400 border border-slate-700 inline-flex items-center gap-1.5 shadow-sm">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            INDETERMINATE
          </span>
        );
    }
  };

  const getRecommendationPriorityBadge = (priority: RecommendationPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-700 flex items-center gap-1">
            <AlertOctagon className="w-3 h-3 text-rose-400" />
            CRITICAL
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-800 flex items-center gap-1">
            <XCircle className="w-3 h-3 text-rose-400" />
            HIGH
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            MEDIUM
          </span>
        );
      case 'LOW':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-950 text-blue-300 border border-blue-800 flex items-center gap-1">
            <Info className="w-3 h-3 text-blue-400" />
            LOW
          </span>
        );
      case 'INFORMATIONAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-950 text-sky-300 border border-sky-800 flex items-center gap-1">
            <Info className="w-3 h-3 text-sky-400" />
            INFORMATIONAL
          </span>
        );
      case 'NONE':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            NONE
          </span>
        );
    }
  };

  const getRecommendationTypeBadge = (type: RecommendationType) => {
    switch (type) {
      case 'ADDRESS_SAFETY_SENSITIVITY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">
            SAFETY / ALLERGEN
          </span>
        );
      case 'HONOR_NEGATIVE_CONSTRAINT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">
            NEGATIVE EXCLUSION
          </span>
        );
      case 'CORRECT_OR_REPLACE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-800">
            CORRECT OR REPLACE
          </span>
        );
      case 'IMPROVE_INTENT_ALIGNMENT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
            INTENT ALIGNMENT
          </span>
        );
      case 'RESOLVE_CONTRADICTION':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">
            RESOLVE CONTRADICTION
          </span>
        );
      case 'IMPROVE_PRODUCT_SELECTION':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950 text-amber-300 border border-amber-800">
            PRODUCT SELECTION
          </span>
        );
      case 'PROVIDE_OR_OBTAIN_EVIDENCE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-yellow-950 text-yellow-300 border border-yellow-800">
            PROVIDE EVIDENCE (UNKNOWN)
          </span>
        );
      case 'VERIFY_EXTERNAL_FACT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-950 text-sky-300 border border-sky-800">
            EXTERNAL VERIFICATION
          </span>
        );
      case 'NO_REMEDIATION_REQUIRED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
            CLEAN PASS (SATISFIED)
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800">
            {type}
          </span>
        );
    }
  };

  return (
    <section className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      
      {/* Top Results Header & Navigation */}
      <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-100">
              Evaluation Results
            </h2>
            {isInputsModified && isFinalEvaluationDone && (
              <span className="text-xs font-mono font-semibold text-amber-300 bg-amber-950/90 border border-amber-700 px-2 py-0.5 rounded flex items-center gap-1.5 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                OUTDATED (INPUTS MODIFIED)
              </span>
            )}
            {isFinalEvaluationDone ? (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                FINAL EVALUATION COMPLETE
              </span>
            ) : isRecommendationsDone ? (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                RECOMMENDATIONS COMPLETE
              </span>
            ) : isSeverityScoringDone ? (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                SEVERITY &amp; SCORING COMPLETE
              </span>
            ) : isRootCauseDone ? (
              <span className="text-xs font-mono text-rose-400 bg-rose-950/60 border border-rose-800/80 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                ROOT-CAUSE DIAGNOSTICS COMPLETE
              </span>
            ) : isClaimSupportDone ? (
              <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                CLAIM SUPPORT &amp; RISK COMPLETE
              </span>
            ) : isRubricEvaluated ? (
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                RUBRIC + HARD-GATE COMPLETE
              </span>
            ) : (
              <span className="text-xs font-mono text-slate-400 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded">
                Awaiting Run
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {isFinalEvaluationDone
              ? `Final integrated evaluation complete · Verdict: ${finalEvaluationResult?.finalVerdict} · Hard gates strictly authoritative`
              : isRecommendationsDone
              ? "Actionable, traceable, evidence-bound recommendations derived strictly from observed findings · Hard gates strictly authoritative"
              : isSeverityScoringDone
              ? "Severity classification and transparent scoring summary · Hard gates strictly authoritative"
              : isRootCauseDone
              ? "Observable failure modes classified directly from structured constraint, claim, and rubric evidence"
              : "Structured analysis generated automatically from User Prompt & LLM Output"}
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950/80 rounded-lg border border-slate-800/80">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/80 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 bg-emerald-950/80 text-emerald-300 rounded border border-emerald-800/50">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global State Banner */}
      <div className="bg-slate-950/40 border-b border-slate-800/70 px-5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {isFinalEvaluationDone ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-emerald-300 font-medium">
                FINAL INTEGRATED EVALUATION COMPLETE (CHECKPOINT 10)
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-200 font-mono font-bold">
                Verdict: {finalEvaluationResult?.finalVerdict}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">
                Hard Gates Authoritative · UNKNOWN ≠ FAIL · UNVERIFIED ≠ FALSE
              </span>
            </>
          ) : isRecommendationsDone ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-emerald-300 font-medium">
                RECOMMENDATIONS &amp; REMEDIATION COMPLETE (CHECKPOINT 9)
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">
                {recommendationsList.length} Actionable Recommendation(s) Generated
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-amber-300/90 font-medium">
                FINAL INTEGRATED EVALUATION PENDING
              </span>
            </>
          ) : isSeverityScoringDone ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-emerald-300 font-medium">
                SEVERITY &amp; SCORING COMPLETE (CHECKPOINT 8)
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">
                RECOMMENDATIONS NOT YET GENERATED
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-amber-300/90 font-medium">
                FINAL EVALUATION NOT YET RUN
              </span>
            </>
          ) : isRootCauseDone ? (
            <>
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              <span className="text-rose-300 font-medium">
                ROOT-CAUSE ANALYSIS COMPLETE
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">
                RECOMMENDATIONS NOT YET GENERATED
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-amber-300/90 font-medium">
                FULL EVALUATION NOT YET RUN
              </span>
            </>
          ) : isClaimSupportDone ? (
            <>
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="text-cyan-300 font-medium">
                CLAIM SUPPORT ANALYSIS COMPLETE
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-amber-300/90 font-medium">
                FULL EVALUATION NOT YET RUN
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-600 animate-pulse"></span>
              <span className="text-slate-400">Status: <strong className="text-slate-300 font-medium">Awaiting evaluation run</strong> · No evaluation performed yet</span>
            </>
          )}
        </div>
        <div className="text-[11px] text-slate-400 flex items-center gap-2 font-mono">
          <span>Grounded In Observable Pipeline Evidence</span>
        </div>
      </div>

      {/* TAB CONTENT AREAS */}
      <div className="p-5 sm:p-6 min-h-[460px] bg-slate-900/30">
        
        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            
            {/* Top Scorecard Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Verdict Card */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${isFinalEvaluationDone ? 'bg-slate-950/70 border-emerald-900/40' : isRecommendationsDone ? 'bg-slate-950/70 border-emerald-900/40' : isSeverityScoringDone ? 'bg-slate-950/70 border-emerald-900/40' : isRubricEvaluated ? 'bg-slate-950/70 border-emerald-900/40' : 'bg-slate-950/60 border-dashed border-slate-800'}`}>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Evaluation Status</span>
                    <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className={`mt-2 text-base font-bold tracking-tight font-mono ${
                    isFinalEvaluationDone
                      ? finalEvaluationResult?.finalVerdict === 'PASS'
                        ? 'text-emerald-400'
                        : finalEvaluationResult?.finalVerdict === 'FAIL'
                        ? 'text-rose-400'
                        : 'text-amber-400'
                      : isRecommendationsDone
                      ? 'text-emerald-400'
                      : isSeverityScoringDone
                      ? 'text-emerald-400'
                      : isRubricEvaluated
                      ? 'text-emerald-400'
                      : 'text-slate-500'
                  }`}>
                    {isFinalEvaluationDone
                      ? `FINAL VERDICT: ${finalEvaluationResult?.finalVerdict}`
                      : isRecommendationsDone
                      ? 'RECOMMENDATIONS COMPLETE'
                      : isSeverityScoringDone
                      ? 'SEVERITY & SCORING'
                      : isRubricEvaluated
                      ? 'RUBRIC EVALUATED'
                      : 'UNEVALUATED'}
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400">
                  {isFinalEvaluationDone
                    ? `Hard gates authoritative · ${finalEvaluationResult?.summary.totalConfirmedFailures} confirmed fail · ${finalEvaluationResult?.summary.totalUnresolvedUnknown} unknown`
                    : isRecommendationsDone
                    ? `${recommendationsList.length} actionable recommendation(s) generated across response`
                    : isSeverityScoringDone
                    ? `Diagnostic severity ${responseSeverity?.overallSeverity || 'NONE'} · Recommendations pending`
                    : isRubricEvaluated
                    ? 'Hard gates calculated · Final overall verdict pending'
                    : 'Computed from constraint & claim gates'}
                </div>
              </div>

              {/* Evaluated Evidence Score */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${isSeverityScoringDone ? 'bg-slate-950/70 border-emerald-900/40' : 'bg-slate-950/60 border-dashed border-slate-800'}`}>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Average Evaluated Evidence Score</span>
                    {isSeverityScoringDone && responseSeverity ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-300">
                        SEV: {responseSeverity.overallSeverity}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500">0–100 SCALE</span>
                    )}
                  </div>
                  {isSeverityScoringDone && scoringOverall ? (
                    <div className="mt-2 flex items-baseline gap-1.5">
                      {scoringOverall.evaluatedEvidenceScore !== null ? (
                        <>
                          <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                            {scoringOverall.evaluatedEvidenceScore}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">/ 100</span>
                        </>
                      ) : (
                        <span className="text-sm font-bold font-mono text-amber-400">
                          NOT ENOUGH EVIDENCE
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono text-slate-500 tabular-nums">—</span>
                      <span className="text-xs text-slate-500 font-mono">/ 100</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400">
                  {isSeverityScoringDone
                    ? 'Hard gate authoritative · UNKNOWN is not FAIL'
                    : 'Unevaluated · Staged for complete scoring engine'}
                </div>
              </div>

              {/* Hard Gate Summary */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${isRubricEvaluated ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-950/60 border-dashed border-slate-800'}`}>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Product Hard Gates</span>
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  {rubricOverall ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className="text-emerald-400 font-semibold">{rubricOverall.productsPassingHardGate} PASS</span>
                      <span className="text-rose-400 font-semibold">{rubricOverall.productsFailingHardGate} FAIL</span>
                      <span className="text-amber-400 font-semibold">{rubricOverall.productsIndeterminateHardGate} INDET</span>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-slate-500 font-mono">
                      Awaiting Rubric Run
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400">
                  {rubricOverall ? `${rubricOverall.totalProducts} product(s) evaluated independently` : 'Non-negotiable requirement gates'}
                </div>
              </div>

              {/* Root Cause Diagnostics Card */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${isRootCauseDone ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-950/60 border-dashed border-slate-800'}`}>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Root-Cause Diagnostics</span>
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  {rootCauseOverall ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className={`font-bold ${rootCauseOverall.productsWithFailures > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {rootCauseOverall.primaryIssuesCount} Primary
                      </span>
                      <span className="text-slate-400">{rootCauseOverall.contributingIssuesCount} Contributing</span>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-slate-500 font-mono">
                      Awaiting Diagnostics
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400">
                  {rootCauseOverall ? `${rootCauseOverall.totalDiagnosedIssues} issue(s) classified across response` : 'Observable failure taxonomy'}
                </div>
              </div>

            </div>

            {/* Checkpoint 9: Actionable Recommendations Overview Banner */}
            {isRecommendationsDone && recommendationOverall && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">Actionable Recommendations &amp; Remediation</h3>
                      <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
                        {recommendationOverall.totalRecommendations} Generated
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Traceable, evidence-bound guidance: {recommendationOverall.critical} Critical · {recommendationOverall.high} High · {recommendationOverall.medium} Medium · {recommendationOverall.low} Low · {recommendationOverall.informational} Info · {recommendationOverall.none} None
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 self-end md:self-auto">
                  <div className="text-right text-xs font-mono hidden sm:block">
                    <span className="text-rose-400 font-semibold">{recommendationOverall.productsRequiringCorrection} Need Fix</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className="text-amber-400 font-semibold">{recommendationOverall.productsRequiringMoreEvidence} Need Evidence</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('recommendations')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>View Recommendations</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Middle Row: Shopper Intent & Product Hard Gate Summaries */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              
              {/* Extracted Shopper Intent Card */}
              <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Shopper Intent (User Prompt)</h3>
                  </div>
                  {isPromptAnalyzed && (
                    <span className="text-[11px] text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-900/60">
                      Extracted
                    </span>
                  )}
                </div>

                {isPromptAnalyzed && intent ? (
                  <div className="py-3 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Category</span>
                      <span className="text-slate-100 font-semibold">{intent.targetCategory || 'Not specified'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Use Case / Activity</span>
                      <span className="text-slate-100 font-medium">{intent.useCaseOrActivity || 'None specified'}</span>
                    </div>
                    {intent.size && (
                      <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Size Requested</span>
                        <span className="text-cyan-400 font-mono font-semibold">{intent.size}</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Budget Limit</span>
                      <div className="text-right">
                        {intent.budget ? (
                          <span className="text-emerald-400 font-mono font-semibold">
                            Max ${intent.budget.maxAmount} {intent.budget.currency}
                          </span>
                        ) : (
                          <span className="text-slate-500">None specified</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Requested Attributes</span>
                      <div className="text-right flex flex-wrap justify-end gap-1.5 max-w-[65%]">
                        {intent.desiredAttributes.length > 0 ? (
                          intent.desiredAttributes.map((attr, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200 text-[11px]">
                              {attr}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">None</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-4 py-1">
                      <span className="text-slate-400">Exclusions</span>
                      <div className="text-right flex flex-wrap justify-end gap-1.5 max-w-[65%]">
                        {intent.explicitExclusions.length > 0 ? (
                          intent.explicitExclusions.map((excl, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-900/60 text-rose-300 text-[11px] flex items-center gap-1">
                              <MinusCircle className="w-3 h-3 text-rose-400" />
                              {excl}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center flex-1 flex flex-col items-center justify-center">
                    <Compass className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-500 max-w-sm">
                      Click "RUN EVALUATION" to extract shopper intent and atomic constraints.
                    </p>
                  </div>
                )}
              </div>

              {/* Product Rubric Hard Gate Card */}
              <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-slate-200">Product Hard-Gate Summary</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('rubric')}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                  >
                    View Rubric ({rubricProductList.length}) <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>

                {isRubricEvaluated && rubricProductList.length > 0 ? (
                  <div className="py-2 space-y-3 flex-1 overflow-y-auto max-h-[340px] pr-1">
                    {rubricProductList.map((pEval) => (
                      <div
                        key={pEval.productId}
                        className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800/80 flex flex-col gap-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-violet-300 bg-violet-950/80 border border-violet-800/50 px-1.5 py-0.2 rounded font-semibold">
                              {pEval.productId}
                            </span>
                            <span className="font-semibold text-slate-100 text-sm">
                              {pEval.productName}
                            </span>
                          </div>
                          <div>
                            {getHardGateBadge(pEval.hardGateState)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 font-mono text-[11px]">
                          <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                            <span className="text-slate-500 block text-[10px]">Hard Evidence Coverage</span>
                            <span className="text-emerald-400 font-bold">
                              {pEval.hardRequirementSummary.hardEvaluatedCoverage}%
                            </span>
                            <span className="text-slate-400 text-[10px] block mt-0.5">
                              ({pEval.hardRequirementSummary.hardPassCount} Pass / {pEval.hardRequirementSummary.hardFailCount} Fail / {pEval.hardRequirementSummary.hardUnknownCount} Unknown)
                            </span>
                          </div>

                          <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
                            <span className="text-slate-500 block text-[10px]">Soft Preference Match</span>
                            {pEval.softPreferenceSummary.state === 'EVALUATED' ? (
                              <>
                                <span className="text-cyan-400 font-bold">
                                  {pEval.softPreferenceSummary.softPreferenceScore}%
                                </span>
                                <span className="text-slate-400 text-[10px] block mt-0.5">
                                  ({pEval.softPreferenceSummary.softPassCount} Pass / {pEval.softPreferenceSummary.softFailCount} Fail)
                                </span>
                              </>
                            ) : pEval.softPreferenceSummary.state === 'INDETERMINATE' ? (
                              <span className="text-amber-400 font-bold">Indeterminate</span>
                            ) : (
                              <span className="text-slate-500 font-medium">Not Applicable</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center flex-1 flex flex-col items-center justify-center">
                    <Shield className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-500 max-w-sm">
                      Product-specific hard-gate evaluations will populate here once evaluation is run.
                    </p>
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: CONSTRAINT MATRIX */}
        {/* ========================================================================= */}
        {activeTab === 'constraints' && (
          <div className="space-y-4">
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Product-Specific Constraint Verification</h3>
                <p className="text-xs text-slate-400">
                  Every product evaluated independently against each constraint based ONLY on assistant claims.
                </p>
              </div>

              {isVerified && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[11px]">Product:</span>
                    <select
                      value={productFilter}
                      onChange={(e) => setProductFilter(e.target.value)}
                      className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Products ({products.length})</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                          {p.id}: {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[11px]">Status:</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Statuses ({records.length})</option>
                      <option value="PASS" className="bg-slate-900 text-emerald-400">PASS ({overallSummary?.totalPass})</option>
                      <option value="FAIL" className="bg-slate-900 text-rose-400">FAIL ({overallSummary?.totalFail})</option>
                      <option value="UNKNOWN" className="bg-slate-900 text-amber-400">UNKNOWN ({overallSummary?.totalUnknown})</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="border border-slate-800 rounded-lg overflow-x-auto bg-slate-950/60">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 border-b border-slate-800 text-slate-400 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">ID</th>
                    <th className="py-2.5 px-3">Constraint</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">Shopper Evidence</th>
                    <th className="py-2.5 px-3">Claim Evidence</th>
                    <th className="py-2.5 px-3">Verification Reason</th>
                    <th className="py-2.5 px-3 text-right">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredRecords.length > 0 ? (
                    filteredRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-[11px] font-semibold text-violet-300 bg-violet-950/80 px-2 py-0.5 rounded border border-violet-800/60">
                            {r.productId}: {r.productName}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 font-medium">{r.constraintId}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-slate-200 capitalize">{r.constraintAttribute}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-semibold ${
                            r.constraintType === 'hard'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/80'
                              : 'bg-cyan-950/80 text-cyan-400 border border-cyan-900/80'
                          }`}>
                            {r.constraintType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.conflictDetected ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800 flex items-center justify-center gap-1">
                              <AlertOctagon className="w-3 h-3 text-purple-400" />
                              CONFLICT
                            </span>
                          ) : r.status === 'PASS' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-800/80 flex items-center justify-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-400" />
                              PASS
                            </span>
                          ) : r.status === 'FAIL' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/90 text-rose-400 border border-rose-800/80 flex items-center justify-center gap-1">
                              <XCircle className="w-3 h-3 text-rose-400" />
                              FAIL
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-amber-300 border border-slate-700 flex items-center justify-center gap-1">
                              <HelpCircle className="w-3 h-3 text-amber-400" />
                              UNKNOWN
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                          "{r.constraintEvidence}"
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {r.claimEvidence.length > 0 ? (
                            <div className="space-y-0.5">
                              {r.claimEvidence.map((ev, eIdx) => (
                                <span key={eIdx} className="block text-slate-300">
                                  "{ev}"
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-600 italic">None stated</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-300 max-w-xs leading-relaxed">
                          {r.reason}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`text-[10px] font-mono uppercase px-1.5 py-0.2 rounded ${
                            r.method === 'deterministic'
                              ? 'bg-slate-900 text-slate-400 border border-slate-800'
                              : 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60'
                          }`}>
                            {r.method}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="text-slate-500 italic">
                      <td colSpan={9} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Table className="w-6 h-6 text-slate-600" />
                          <span className="text-slate-400">Constraint verification is inactive.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: CLAIM SUPPORT & EVIDENCE AUDIT */}
        {/* ========================================================================= */}
        {activeTab === 'claims' && (
          <div className="space-y-6">
            
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-900/40 text-amber-200/90 text-xs flex items-start gap-3 shadow-sm">
              <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold text-amber-300 block">
                  Evidentiary Support &amp; Truth-Verification Notice
                </span>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  <strong>UNVERIFIED</strong> indicates that no independent product evidence is available in this evaluator context. <em>It does NOT mean the claim is false or a hallucination.</em> Claims marked <strong>SUPPORTED</strong> have explicit textual backing in the assistant's response.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Factual Claim Support &amp; Consistency Audit</h3>
                <p className="text-xs text-slate-400">
                  Two-dimensional evidentiary classification: Response Support vs External Truth Status.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setClaimFilter('all')}
                  className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                    claimFilter === 'all'
                      ? 'bg-slate-800 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({claimSupportRecords.length})
                </button>
                <button
                  type="button"
                  onClick={() => setClaimFilter('factual')}
                  className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                    claimFilter === 'factual'
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Factual ({claimSupportRecords.filter(c => c.nature === 'factual').length})
                </button>
                <button
                  type="button"
                  onClick={() => setClaimFilter('subjective')}
                  className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                    claimFilter === 'subjective'
                      ? 'bg-violet-950/80 text-violet-300 border border-violet-800/50 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Subjective ({claimSupportRecords.filter(c => c.nature === 'subjective').length})
                </button>
                <button
                  type="button"
                  onClick={() => setClaimFilter('high_priority')}
                  className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                    claimFilter === 'high_priority'
                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  High Priority ({claimSupportRecords.filter(c => c.verificationPriority === 'HIGH').length})
                </button>
              </div>
            </div>

            <div className="border border-slate-800 rounded-lg overflow-x-auto bg-slate-950/60">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/90 border-b border-slate-800 text-slate-400 font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Claim ID</th>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">Nature</th>
                    <th className="py-2.5 px-3">Response Support</th>
                    <th className="py-2.5 px-3 text-center">Internal Consistency</th>
                    <th className="py-2.5 px-3 text-center">External Truth Status</th>
                    <th className="py-2.5 px-3 text-center">Priority</th>
                    <th className="py-2.5 px-3">Source Evidence</th>
                    <th className="py-2.5 px-3">Audit Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredClaimSupport.length > 0 ? (
                    filteredClaimSupport.map((cl) => (
                      <tr key={cl.claimId} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-400 font-semibold">{cl.claimId}</td>
                        <td className="py-2.5 px-3">
                          {cl.productId ? (
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-violet-950/80 text-violet-300 border border-violet-800/60">
                              {cl.productId}: {cl.productName || 'Item'}
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono text-[11px]">Response Scope</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {cl.nature === 'factual' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                              factual
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-purple-950/80 text-purple-300 border border-purple-800/60 font-semibold">
                              subjective
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            {cl.responseSupport}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {cl.internalConsistency === 'CONTRADICTED' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800 inline-flex items-center gap-1">
                              <AlertOctagon className="w-3 h-3 text-rose-400" />
                              CONTRADICTED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800">
                              CONSISTENT
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {cl.externalTruthStatus === 'UNVERIFIED' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60 inline-flex items-center gap-1">
                              <HelpCircle className="w-3 h-3 text-amber-400" />
                              UNVERIFIED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 bg-slate-900/60 border border-slate-800/60">
                              NOT_APPLICABLE
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            cl.verificationPriority === 'HIGH'
                              ? 'bg-rose-950/90 text-rose-300 border border-rose-800/80'
                              : cl.verificationPriority === 'MEDIUM'
                              ? 'bg-amber-950/90 text-amber-300 border border-amber-800/80'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}>
                            {cl.verificationPriority}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                          "{cl.sourceEvidence}"
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400 max-w-xs leading-relaxed">
                          {cl.reason}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="text-slate-500 italic">
                      <td colSpan={9} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FileText className="w-6 h-6 text-slate-600" />
                          <span className="text-slate-400">Claims analysis is inactive.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: RUBRIC & HARD GATES */}
        {/* ========================================================================= */}
        {activeTab === 'rubric' && (
          <div className="space-y-6">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Dynamic Rubric &amp; Hard-Gate Outcomes</h3>
                <p className="text-xs text-slate-400">
                  Synthesized criteria mapped directly from shopper constraints with separate hard-gate and soft-preference scoring.
                </p>
              </div>

              {rubricProductList.length > 1 && (
                <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 text-xs">
                  <span className="text-slate-500 text-[11px]">View Product:</span>
                  <select
                    value={selectedRubricProductId}
                    onChange={(e) => setSelectedRubricProductId(e.target.value)}
                    className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Products ({rubricProductList.length})</option>
                    {rubricProductList.map((p) => (
                      <option key={p.productId} value={p.productId} className="bg-slate-900 text-slate-200">
                        {p.productId}: {p.productName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {isRubricEvaluated && displayedRubricEvaluations.length > 0 ? (
              <div className="space-y-8">
                {displayedRubricEvaluations.map((pEval) => (
                  <div key={pEval.productId} className="space-y-4 p-5 rounded-xl bg-slate-950/70 border border-slate-800/90 shadow-sm">
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-bold text-violet-300 bg-violet-950 px-2 py-0.5 rounded border border-violet-800/60">
                            {pEval.productId}
                          </span>
                          <h4 className="text-base font-bold text-slate-100">
                            {pEval.productName}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Evaluated against {pEval.criteria.length} dynamic shopper criteria
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {getHardGateBadge(pEval.hardGateState)}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                      
                      <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/80">
                        <span className="text-[11px] text-slate-400 block font-sans">
                          Hard Requirement Evidence Coverage
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-xl font-bold text-emerald-400">
                            {pEval.hardRequirementSummary.hardEvaluatedCoverage}%
                          </span>
                          <span className="text-[11px] text-slate-500">coverage</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {pEval.hardRequirementSummary.hardPassCount} Pass · {pEval.hardRequirementSummary.hardFailCount} Fail · {pEval.hardRequirementSummary.hardUnknownCount} Unknown
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/80">
                        <span className="text-[11px] text-slate-400 block font-sans">
                          Soft Preference Satisfaction
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          {pEval.softPreferenceSummary.state === 'EVALUATED' ? (
                            <>
                              <span className="text-xl font-bold text-cyan-400">
                                {pEval.softPreferenceSummary.softPreferenceScore}%
                              </span>
                              <span className="text-[11px] text-slate-500">score</span>
                            </>
                          ) : pEval.softPreferenceSummary.state === 'INDETERMINATE' ? (
                            <span className="text-base font-bold text-amber-400 mt-0.5">Indeterminate</span>
                          ) : (
                            <span className="text-base font-bold text-slate-500 mt-0.5">Not Applicable</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {pEval.softPreferenceSummary.totalSoftCriteria === 0
                            ? 'No soft preferences in prompt'
                            : `${pEval.softPreferenceSummary.softPassCount} Pass · ${pEval.softPreferenceSummary.softFailCount} Fail · ${pEval.softPreferenceSummary.softUnknownCount} Unknown`}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/80">
                        <span className="text-[11px] text-slate-400 block font-sans">
                          Evidence Completeness (All Criteria)
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-xl font-bold text-slate-200">
                            {pEval.evidenceCompleteness}%
                          </span>
                          <span className="text-[11px] text-slate-500">addressed</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Missing evidence is preserved as UNKNOWN
                        </div>
                      </div>

                    </div>

                    <div className="border border-slate-800 rounded-lg overflow-x-auto bg-slate-950/60 mt-3">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-900/90 border-b border-slate-800 text-slate-400 font-medium">
                          <tr>
                            <th className="py-2.5 px-3">Criterion ID</th>
                            <th className="py-2.5 px-3">Title &amp; Requirement</th>
                            <th className="py-2.5 px-3">Type</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                            <th className="py-2.5 px-3">Prompt Evidence</th>
                            <th className="py-2.5 px-3">Assistant Claim Evidence</th>
                            <th className="py-2.5 px-3">Evaluation Reasoning</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-sans">
                          {pEval.criteria.map((c) => (
                            <tr key={c.criterionId} className="hover:bg-slate-900/40 transition-colors">
                              <td className="py-2.5 px-3 font-mono text-slate-400 font-semibold">
                                {c.criterionId}
                                <span className="text-[10px] text-slate-500 block font-normal">
                                  ({c.sourceConstraintId})
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-semibold text-slate-200 block">{c.title}</span>
                                <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                                  {c.expectedCondition}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-semibold ${
                                  c.requirementType === 'hard'
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/80'
                                    : 'bg-cyan-950/80 text-cyan-400 border border-cyan-900/80'
                                }`}>
                                  {c.requirementType}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {c.conflictDetected ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800 flex items-center justify-center gap-1">
                                    <AlertOctagon className="w-3 h-3 text-purple-400" />
                                    CONFLICT
                                  </span>
                                ) : c.verificationStatus === 'PASS' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-800/80 flex items-center justify-center gap-1">
                                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                                    PASS
                                  </span>
                                ) : c.verificationStatus === 'FAIL' ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/90 text-rose-400 border border-rose-800/80 flex items-center justify-center gap-1">
                                    <XCircle className="w-3 h-3 text-rose-400" />
                                    FAIL
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-amber-300 border border-slate-700 flex items-center justify-center gap-1">
                                    <HelpCircle className="w-3 h-3 text-amber-400" />
                                    UNKNOWN
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                                "{c.sourceEvidence}"
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                {c.verificationEvidence.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {c.verificationEvidence.map((ev, eIdx) => (
                                      <span key={eIdx} className="block text-slate-300">
                                        "{ev}"
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-600 italic">None stated</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-300 max-w-xs leading-relaxed">
                                {c.reasoning}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <ListChecks className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-300">Dynamic Rubric Awaiting Evaluation Run</div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: ROOT CAUSE DIAGNOSTICS (CHECKPOINT 7) */}
        {/* ========================================================================= */}
        {activeTab === 'root_cause' && (
          <div className="space-y-6">
            
            {/* Header & Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Root-Cause / Failure Mode Diagnostics
                </h3>
                <p className="text-xs text-slate-400">
                  Empirical classification of observed failure modes and indeterminate states grounded in pipeline evidence.
                </p>
              </div>

              {isRootCauseDone && (
                <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setRootCauseFilter('all')}
                    className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                      rootCauseFilter === 'all'
                        ? 'bg-slate-800 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({rootCauseRecords.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRootCauseFilter('primary')}
                    className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                      rootCauseFilter === 'primary'
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-800/50 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Primary ({rootCauseRecords.filter(r => r.role === 'primary').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRootCauseFilter('contributing')}
                    className={`px-2.5 py-1 rounded cursor-pointer transition-colors ${
                      rootCauseFilter === 'contributing'
                        ? 'bg-slate-800 text-slate-200 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Contributing ({rootCauseRecords.filter(r => r.role === 'contributing').length})
                  </button>
                </div>
              )}
            </div>

            {/* Response-Level Diagnostics Scorecard */}
            {rootCauseOverall && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-sans">
                    {rootCauseRecords.some(r => r.code === 'NO_FAILURE') && !rootCauseRecords.some(r => r.role === 'primary' && r.code !== 'NO_FAILURE')
                      ? 'Primary Diagnostics'
                      : 'Primary Failure Causes'}
                  </span>
                  <span className={`text-xl font-bold mt-1 block ${
                    rootCauseRecords.some(r => r.role === 'primary' && r.code !== 'NO_FAILURE')
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}>
                    {rootCauseOverall.primaryIssuesCount}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {rootCauseRecords.some(r => r.code === 'NO_FAILURE') && !rootCauseRecords.some(r => r.role === 'primary' && r.code !== 'NO_FAILURE')
                      ? 'All shopper requirements satisfied'
                      : 'Direct hard-gate drivers'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-sans">Contributing Causes</span>
                  <span className="text-xl font-bold text-slate-300 mt-1 block">
                    {rootCauseOverall.contributingIssuesCount}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Missing info &amp; contextual flags</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-sans">Internal Contradictions</span>
                  <span className="text-xl font-bold text-purple-400 mt-1 block">
                    {rootCauseOverall.totalContradictions}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Conflicting factual assertions</span>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-sans">Safety/Sensitivity Risks</span>
                  <span className="text-xl font-bold text-amber-400 mt-1 block">
                    {rootCauseOverall.totalSafetyRisks}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Unverified medical/allergen claims</span>
                </div>
              </div>
            )}

            {/* Diagnostic Records Table */}
            {isRootCauseDone && filteredRootCauseRecords.length > 0 ? (
              <div className="border border-slate-800 rounded-lg overflow-x-auto bg-slate-950/60">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/90 border-b border-slate-800 text-slate-400 font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Cause ID</th>
                      <th className="py-2.5 px-3">Code &amp; Category</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Shopper Evidence</th>
                      <th className="py-2.5 px-3">Assistant Evidence</th>
                      <th className="py-2.5 px-3">Diagnostic Explanation</th>
                      <th className="py-2.5 px-3 text-right">Linked IDs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredRootCauseRecords.map((rc) => (
                      <tr key={rc.causeId} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-400 font-semibold">{rc.causeId}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col gap-1 items-start">
                            {getCauseCodeBadge(rc.code)}
                            <span className="text-[10px] font-mono text-slate-400">
                              {rc.category}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {getRoleBadge(rc.role, rc.code)}
                        </td>
                        <td className="py-2.5 px-3">
                          {rc.productId ? (
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-violet-950/80 text-violet-300 border border-violet-800/60">
                              {rc.productId}: {rc.productName || 'Item'}
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono text-[11px]">Response Level</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                          {rc.shopperEvidence.length > 0 ? (
                            rc.shopperEvidence.map((ev, idx) => (
                              <span key={idx} className="block">"{ev}"</span>
                            ))
                          ) : (
                            <span className="text-slate-600 italic">None</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                          {rc.assistantEvidence.length > 0 ? (
                            rc.assistantEvidence.map((ev, idx) => (
                              <span key={idx} className="block text-slate-300">"{ev}"</span>
                            ))
                          ) : (
                            <span className="text-slate-600 italic">Missing from output</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-200 max-w-sm leading-relaxed">
                          {rc.explanation}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[10px] text-slate-400">
                          <div className="space-y-0.5">
                            {rc.constraintIds.length > 0 && (
                              <span className="block text-cyan-400">{rc.constraintIds.join(', ')}</span>
                            )}
                            {rc.claimIds.length > 0 && (
                              <span className="block text-violet-400">{rc.claimIds.join(', ')}</span>
                            )}
                            {rc.rubricCriterionIds.length > 0 && (
                              <span className="block text-emerald-400">{rc.rubricCriterionIds.join(', ')}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-300">Root-Cause Diagnostics Awaiting Evaluation Run</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Click "RUN EVALUATION" to automatically classify observed failure modes and indeterminate states.
                </p>
              </div>
            )}

            {/* Explicit Notice: Recommendations Not Yet Implemented */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Wrench className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-300 block">Engineering Recommendations:</span>
                  <span className="text-[11px] text-slate-500">
                    Actionable remediation steps (prompt engineering, catalog retrieval filtering, guardrail rules) are explicitly staged for the subsequent complete evaluator checkpoint.
                  </span>
                </div>
              </div>
              <span className="font-mono text-[10px] text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800 whitespace-nowrap">
                RECOMMENDATIONS: NOT YET IMPLEMENTED
              </span>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: SEVERITY & SCORING (CHECKPOINT 8) */}
        {/* ========================================================================= */}
        {activeTab === 'severity_scoring' && (
          <div className="space-y-6">
            
            {/* Context Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Severity Classification &amp; Transparent Product Scoring (Checkpoint 8)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Grounded diagnostic severity classifications and transparent multidimensional evidence scores. Hard gates are strictly authoritative; numeric scores cannot compensate for hard requirement failures.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                  HARD_GATE_AUTHORITATIVE
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  UNKNOWN ≠ FAIL
                </span>
              </div>
            </div>

            {/* Core Architectural Invariants Callout Box */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Hard Gates Authoritative</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  A high numeric score can never compensate for a failed mandatory requirement (e.g. price ceiling, negative exclusion). Hard-gate failure (HARD_GATE_FAIL) is authoritative and non-negotiable regardless of numeric score.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>UNKNOWN Is Not FAIL</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  UNKNOWN indicates missing or unaddressed evidence in the assistant response. It reduces evidence coverage and completeness, but is NEVER penalized as a confirmed violation.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
                  <Info className="w-3.5 h-3.5" />
                  <span>UNVERIFIED Context Only</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Material product claims lacking independent external catalog verification remain UNVERIFIED. They provide informational context and are NOT scored as false or fabricated.
                </p>
              </div>
            </div>

            {/* Response-Level Severity Summary Banner */}
            {isSeverityScoringDone && responseSeverity ? (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-medium">Response-Level Severity</span>
                      <div className="mt-1">
                        {getSeverityBadge(responseSeverity.overallSeverity)}
                      </div>
                    </div>
                    <div className="h-8 w-px bg-slate-800 hidden sm:block"></div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-medium">Average Evaluated Evidence Score</span>
                      <div className="mt-1 flex items-baseline gap-1">
                        {scoringOverall?.evaluatedEvidenceScore !== null ? (
                          <>
                            <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                              {scoringOverall?.evaluatedEvidenceScore}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">/ 100</span>
                          </>
                        ) : (
                          <span className="text-xs font-mono font-semibold text-amber-400">
                            NOT ENOUGH EVIDENCE
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Distribution Matrix */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-900/60 text-rose-300">
                      Crit: {responseSeverity.criticalProducts}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-900/60 text-rose-400">
                      High: {responseSeverity.highProducts}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-900/60 text-amber-300">
                      Med: {responseSeverity.mediumProducts}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-950/60 border border-blue-900/60 text-blue-300">
                      Low: {responseSeverity.lowProducts}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-sky-950/60 border border-sky-900/60 text-sky-300">
                      Info: {responseSeverity.informationalProducts}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-900/60 text-emerald-300">
                      None: {responseSeverity.noneProducts}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                      Indet: {responseSeverity.indeterminateProducts}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-300 flex items-start gap-2">
                  <span className="text-slate-500 font-semibold uppercase text-[10px] tracking-wider mt-0.5 whitespace-nowrap">Primary Diagnostic Rationale:</span>
                  <span className="leading-relaxed">{responseSeverity.primaryExplanation}</span>
                </div>
              </div>
            ) : null}

            {/* Product-by-Product Scoring & Severity Cards */}
            {isSeverityScoringDone && scoringProductsList.length > 0 ? (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Product Diagnostic &amp; Scoring Breakdowns ({scoringProductsList.length})</span>
                  <span className="text-[11px] text-slate-500 font-mono normal-case">Independent isolated evaluation</span>
                </div>

                {scoringProductsList.map((item) => {
                  const pId = item.productId;
                  const pName = item.productName;
                  const pSeverity = item.severity;
                  const pScore = item.score;
                  const pRubric = rubricResult?.productEvaluations[pId] || rubricResult?.productEvaluations[pName];
                  const hardGateState = pRubric?.hardGateState || (pScore.hardSatisfaction.failedHard > 0 ? 'HARD_GATE_FAIL' : pScore.hardSatisfaction.unknownHard > 0 ? 'HARD_GATE_INDETERMINATE' : 'HARD_GATE_PASS');

                  return (
                    <div key={pId} className="border border-slate-800 rounded-xl bg-slate-950/70 p-5 space-y-4 shadow-sm">
                      {/* Product Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {pId}
                          </span>
                          <h4 className="text-sm font-bold text-slate-100">
                            {pName}
                          </h4>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {getHardGateBadge(hardGateState)}
                          {getSeverityBadge(pSeverity.severity)}
                          <div className={`px-2.5 py-1 rounded text-xs font-mono font-bold border flex items-center gap-1.5 ${
                            pScore.scoreStatus === 'HARD_GATE_FAILED'
                              ? 'bg-rose-950 text-rose-300 border-rose-800'
                              : pScore.scoreStatus === 'NOT_ENOUGH_EVIDENCE'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          }`}>
                            <span>SCORE:</span>
                            {pScore.evaluatedEvidenceScore !== null ? (
                              <span>{pScore.evaluatedEvidenceScore} / 100</span>
                            ) : (
                              <span>N/A</span>
                            )}
                            {pScore.scoreStatus === 'HARD_GATE_FAILED' && (
                              <span className="text-[10px] text-rose-400 font-normal">(GATE FAIL AUTHORITATIVE)</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Severity Diagnostic Drivers & Explanation */}
                      <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Severity Diagnostic Rationale</span>
                            <p className="text-slate-200 leading-relaxed font-sans">{pSeverity.explanation}</p>
                          </div>
                          {pSeverity.driverCodes.length > 0 && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {pSeverity.driverCodes.map((code, idx) => (
                                <span key={idx} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  {code}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-slate-400 border-t border-slate-800/60">
                          <span>Confirmed Failures: <strong className={pSeverity.confirmedFailureCount > 0 ? "text-rose-400 font-bold" : "text-emerald-400"}>{pSeverity.confirmedFailureCount}</strong></span>
                          <span>·</span>
                          <span>Indeterminate Issues: <strong className={pSeverity.indeterminateIssueCount > 0 ? "text-amber-400" : "text-slate-400"}>{pSeverity.indeterminateIssueCount}</strong></span>
                          <span>·</span>
                          <span>Informational Claims: <strong className="text-sky-400">{pSeverity.informationalIssueCount}</strong></span>
                        </div>
                      </div>

                      {/* 5 Transparent Metric Dimensions Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                        {/* 1. Confirmed Hard Satisfaction & Decomposition */}
                        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1.5 col-span-1 sm:col-span-2 lg:col-span-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-mono uppercase text-slate-400 font-semibold">1. Confirmed Hard Satisfaction</div>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              Coverage: {pScore.hardSatisfaction.hardEvidenceCoveragePercent}%
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-bold font-mono text-slate-100">{pScore.hardSatisfaction.confirmedHardSatisfactionPercent}%</span>
                            <span className="text-[11px] text-slate-400 font-mono">({pScore.hardSatisfaction.passedHard} of {pScore.hardSatisfaction.totalHard})</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-800 text-[10px] font-mono text-center">
                            <div className="p-1 rounded bg-slate-950/80 border border-slate-800">
                              <span className="text-slate-500 block text-[9px]">PASS</span>
                              <span className="font-semibold text-emerald-400">{pScore.hardSatisfaction.passedHard} ({pScore.hardSatisfaction.confirmedHardSatisfactionPercent}%)</span>
                            </div>
                            <div className="p-1 rounded bg-slate-950/80 border border-slate-800">
                              <span className="text-slate-500 block text-[9px]">FAIL</span>
                              <span className={`font-semibold ${pScore.hardSatisfaction.failedHard > 0 ? 'text-rose-400' : 'text-slate-400'}`}>{pScore.hardSatisfaction.failedHard} ({pScore.hardSatisfaction.confirmedHardFailurePercent}%)</span>
                            </div>
                            <div className="p-1 rounded bg-slate-950/80 border border-slate-800">
                              <span className="text-slate-500 block text-[9px]">UNKNOWN</span>
                              <span className={`font-semibold ${pScore.hardSatisfaction.unknownHard > 0 ? 'text-amber-400' : 'text-slate-400'}`}>{pScore.hardSatisfaction.unknownHard} ({pScore.hardSatisfaction.hardUnknownPercent}%)</span>
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 italic pt-0.5">
                            UNKNOWN requirements are not counted as failures.
                          </div>
                        </div>

                        {/* 2. Soft Preference Match */}
                        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
                          <div className="text-[10px] font-mono uppercase text-slate-400 font-medium">2. Soft Match</div>
                          <div className="flex items-baseline gap-1">
                            {pScore.softSatisfaction.softPreferenceScorePercent !== null ? (
                              <span className="text-lg font-bold font-mono text-cyan-400">{pScore.softSatisfaction.softPreferenceScorePercent}%</span>
                            ) : (
                              <span className="text-sm font-semibold font-mono text-slate-500">N/A</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            State: {pScore.softSatisfaction.state}
                          </div>
                          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                            {pScore.softSatisfaction.passedSoft}P · {pScore.softSatisfaction.failedSoft}F · {pScore.softSatisfaction.unknownSoft}U
                          </div>
                        </div>

                        {/* 3. Evidence Completeness */}
                        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
                          <div className="text-[10px] font-mono uppercase text-slate-400 font-medium">3. Completeness</div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-bold font-mono text-slate-100">{pScore.evidenceCompleteness.evidenceCompletenessPercent}%</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {pScore.evidenceCompleteness.addressedCriteria}/{pScore.evidenceCompleteness.totalCriteria} addressed
                          </div>
                          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                            {pScore.evidenceCompleteness.missingCriteria} criteria unaddressed
                          </div>
                        </div>

                        {/* 4. Diagnostic Severity */}
                        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
                          <div className="text-[10px] font-mono uppercase text-slate-400 font-medium">4. Diagnostic Severity</div>
                          <div className="pt-0.5">
                            <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${
                              pSeverity.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border-rose-800' :
                              pSeverity.severity === 'HIGH' ? 'bg-rose-950 text-rose-400 border-rose-800' :
                              pSeverity.severity === 'MEDIUM' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                              pSeverity.severity === 'LOW' ? 'bg-blue-950 text-blue-300 border-blue-800' :
                              pSeverity.severity === 'NONE' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' :
                              'bg-slate-800 text-slate-300 border-slate-700'
                            }`}>
                              {pSeverity.severity}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono pt-1">
                            Hard Fail: {pScore.diagnosticSeverity.hasConfirmedHardFailure ? 'YES' : 'NO'}
                          </div>
                          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800 truncate">
                            Drivers: {pScore.diagnosticSeverity.severityDrivers.join(', ') || 'None'}
                          </div>
                        </div>

                        {/* 5. External Context */}
                        <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
                          <div className="text-[10px] font-mono uppercase text-slate-400 font-medium">5. External Context</div>
                          <div className="pt-0.5">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                              PENDING VERIF
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono pt-1">
                            Unverified: {pScore.externalVerificationContext.unverifiedMaterialClaimsCount} claims
                          </div>
                          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                            Claims not assumed false
                          </div>
                        </div>
                      </div>

                      {/* Transparent Formula Description Box */}
                      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-start gap-2.5 text-xs">
                        <Tag className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="text-[11px] font-mono font-semibold text-slate-300 block">Transparent Scoring Formula:</span>
                          <p className="text-[11px] font-mono text-slate-400 leading-relaxed">{pScore.scoreFormulaDescription}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <Layers className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-300">Severity &amp; Scoring Awaiting Evaluation Run</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Click "RUN EVALUATION" to calculate diagnostic severity and transparent multidimensional evidence scores.
                </p>
              </div>
            )}

            {/* Checkpoint 9: Actionable Recommendations Generated Notice */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Lightbulb className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-300 block">Actionable Recommendations &amp; Remediation Active:</span>
                  <span className="text-[11px] text-slate-500">
                    Structured recommendations derived from observed constraints, claims, and severity findings are available in Tab 7.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('recommendations')}
                className="font-mono text-[10px] text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900/80 px-2.5 py-1 rounded border border-emerald-800/80 whitespace-nowrap cursor-pointer flex items-center gap-1 transition-colors"
              >
                <span>VIEW RECOMMENDATIONS</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 7: ACTIONABLE RECOMMENDATIONS & REMEDIATION */}
        {/* ========================================================================= */}
        {activeTab === 'recommendations' && (
          <div className="space-y-6">

            {/* Top Header & Priority Distribution */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Actionable Recommendations &amp; Remediation
                  </h3>
                  {isRecommendationsDone && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {recommendationsList.length} Generated
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Traceable, evidence-bound guidance: what to correct, clarify, verify, or improve without overriding authoritative hard gates.
                </p>
              </div>

              {/* Priority Badges Count */}
              {isRecommendationsDone && recommendationOverall && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                  {recommendationOverall.critical > 0 && (
                    <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                      {recommendationOverall.critical} CRITICAL
                    </span>
                  )}
                  {recommendationOverall.high > 0 && (
                    <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800">
                      {recommendationOverall.high} HIGH
                    </span>
                  )}
                  {recommendationOverall.medium > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                      {recommendationOverall.medium} MEDIUM
                    </span>
                  )}
                  {recommendationOverall.low > 0 && (
                    <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                      {recommendationOverall.low} LOW
                    </span>
                  )}
                  {recommendationOverall.informational > 0 && (
                    <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                      {recommendationOverall.informational} INFO
                    </span>
                  )}
                  {recommendationOverall.none > 0 && (
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {recommendationOverall.none} CLEAN PASS
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Principles of Evidence-Bound Remediation — Taxonomy Reference Legend */}
            {isRecommendationsDone && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase tracking-wider text-[10px]">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    TAXONOMY REFERENCE LEGEND
                  </span>
                  <span className="text-[10px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                    Active States in Current Evaluation
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Card 1: CONFIRMED FAIL (Only if confirmed failures exist in the current evaluation) */}
                  {((recommendationOverall?.critical || 0) + (recommendationOverall?.high || 0) > 0 || (verificationResult?.records.some((v) => v.status === 'FAIL'))) ? (
                    <div className="p-3.5 rounded-lg bg-slate-950 border border-rose-900/40 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-rose-300 font-semibold font-mono text-[11px]">
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          CONFIRMED FAIL
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                          ACTIVE FINDING
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Observed requirement breach (e.g., stated price exceeds ceiling, or material violates exclusion). Emits <strong className="text-rose-300">CORRECT_OR_REPLACE</strong> or <strong className="text-rose-300">HONOR_NEGATIVE_CONSTRAINT</strong>.
                      </p>
                    </div>
                  ) : null}

                  {/* Card 2: UNKNOWN / MISSING (Only if UNKNOWN requirements exist in current evaluation) */}
                  {(verificationResult?.records.some((v) => v.status === 'UNKNOWN')) ? (
                    <div className="p-3.5 rounded-lg bg-slate-950 border border-amber-900/40 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-amber-300 font-semibold font-mono text-[11px]">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                          UNKNOWN / MISSING
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          ACTIVE FINDING
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Assistant omits evidence for a stated requirement. Emits <strong className="text-amber-300">PROVIDE_OR_OBTAIN_EVIDENCE</strong>. <span className="text-amber-400 font-mono font-medium">UNKNOWN ≠ FAIL</span>.
                      </p>
                    </div>
                  ) : null}

                  {/* Card 3: UNVERIFIED CLAIM (Only if unverified factual claims exist) */}
                  {(claimSupportResult?.records.some((c) => c.nature === 'factual' && c.externalTruthStatus === 'UNVERIFIED')) ? (
                    <div className="p-3.5 rounded-lg bg-slate-950 border border-sky-900/40 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-sky-300 font-semibold font-mono text-[11px]">
                          <Info className="w-3.5 h-3.5 text-sky-400" />
                          UNVERIFIED CLAIM
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800">
                          ACTIVE CONTEXT
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Factual product claim ungrounded against external catalog truth. Emits <strong className="text-sky-300">VERIFY_EXTERNAL_FACT</strong> (Informational). <span className="text-sky-400 font-mono font-medium">UNVERIFIED ≠ FALSE</span>.
                      </p>
                    </div>
                  ) : null}

                  {/* Card 4: CLEAN SATISFACTION (If clean pass with no failures and no missing evidence) */}
                  {((recommendationOverall?.none || 0) > 0) && (
                    <div className="p-3.5 rounded-lg bg-slate-950 border border-emerald-900/40 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-emerald-300 font-semibold font-mono text-[11px]">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          CLEAN SATISFACTION
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          ALL SATISFIED
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        All stated mandatory requirements are affirmatively satisfied. Emits <strong className="text-emerald-300">NO_REMEDIATION_REQUIRED</strong>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Filter Bar */}
            {isRecommendationsDone && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-slate-400 font-mono text-[11px]">Priority:</span>
                    <select
                      value={recPriorityFilter}
                      onChange={(e) => setRecPriorityFilter(e.target.value)}
                      className="bg-slate-900 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Priorities ({recommendationsList.length})</option>
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                      <option value="INFORMATIONAL">INFORMATIONAL</option>
                      <option value="NONE">NONE (Clean Pass)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-mono text-[11px]">Type:</span>
                    <select
                      value={recTypeFilter}
                      onChange={(e) => setRecTypeFilter(e.target.value)}
                      className="bg-slate-900 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Types</option>
                      <option value="ADDRESS_SAFETY_SENSITIVITY">Safety / Allergen</option>
                      <option value="HONOR_NEGATIVE_CONSTRAINT">Negative Exclusion</option>
                      <option value="CORRECT_OR_REPLACE">Correct or Replace</option>
                      <option value="IMPROVE_INTENT_ALIGNMENT">Intent Alignment</option>
                      <option value="RESOLVE_CONTRADICTION">Resolve Contradiction</option>
                      <option value="PROVIDE_OR_OBTAIN_EVIDENCE">Provide Evidence (Unknown)</option>
                      <option value="VERIFY_EXTERNAL_FACT">External Verification</option>
                      <option value="NO_REMEDIATION_REQUIRED">Clean Pass</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-mono text-[11px]">Product:</span>
                    <select
                      value={recProductFilter}
                      onChange={(e) => setRecProductFilter(e.target.value)}
                      className="bg-slate-900 text-slate-200 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Products</option>
                      {recommendationProductsList.map((p) => (
                        <option key={p.productId} value={p.productId}>
                          {p.productId}: {p.productName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-400">
                  Showing {filteredRecommendations.length} of {recommendationsList.length}
                </div>
              </div>
            )}

            {/* Recommendations List */}
            {isRecommendationsDone && filteredRecommendations.length > 0 ? (
              <div className="space-y-4">
                {filteredRecommendations.map((r) => (
                  <div
                    key={r.recommendationId}
                    className="p-4 sm:p-5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3.5 hover:border-slate-700/80 transition-colors"
                  >
                    {/* Top Row: ID, Badges, Product */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-200 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">
                          {r.recommendationId}
                        </span>
                        {getRecommendationPriorityBadge(r.priority)}
                        {getRecommendationTypeBadge(r.type)}
                      </div>

                      {r.productName && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Package className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-mono text-[11px] text-violet-300 bg-violet-950/80 px-1.5 py-0.2 rounded border border-violet-800/60">
                            {r.productId}
                          </span>
                          <span className="text-slate-300 font-medium">{r.productName}</span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <h4 className="text-sm font-semibold text-slate-100 leading-snug">
                      {r.title}
                    </h4>

                    {/* Action Required Box */}
                    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 flex items-start gap-2.5 text-xs">
                      <div className="w-5 h-5 rounded bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-emerald-400" />
                      </div>
                      <div className="space-y-1 flex-1">
                        <span className="text-[10px] font-mono uppercase font-bold text-emerald-400 tracking-wider block">
                          ACTION REQUIRED
                        </span>
                        <p className="text-slate-200 font-medium leading-relaxed">
                          {r.action}
                        </p>
                      </div>
                    </div>

                    {/* Reason / Rationale */}
                    <div className="text-xs text-slate-400 space-y-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider block">
                        EVALUATION RATIONALE
                      </span>
                      <p className="text-slate-300 leading-relaxed">
                        {r.reason}
                      </p>
                    </div>

                    {/* Evidence & Traceability Grid */}
                    <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Shopper Evidence Cited */}
                      <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/60 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span className="font-semibold text-slate-300">Shopper Requirement Cited</span>
                          {r.constraintIds.length > 0 && (
                            <span className="text-slate-400">{r.constraintIds.join(', ')}</span>
                          )}
                        </div>
                        <p className="text-slate-300 text-[11px] italic">
                          {r.shopperEvidence.length > 0 ? `"${r.shopperEvidence.join('", "')}"` : 'None cited'}
                        </p>
                      </div>

                      {/* Assistant Evidence Cited */}
                      <div className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/60 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span className="font-semibold text-slate-300">Assistant Statement Cited</span>
                          {r.claimIds.length > 0 && (
                            <span className="text-slate-400">{r.claimIds.join(', ')}</span>
                          )}
                        </div>
                        <p className="text-slate-300 text-[11px] italic">
                          {r.assistantEvidence.length > 0 ? `"${r.assistantEvidence.join('", "')}"` : 'Omitted from response'}
                        </p>
                      </div>
                    </div>

                    {/* Upstream Pipeline Traceability Badges */}
                    <div className="pt-2 flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-500">
                      <span>Traceability:</span>
                      {r.verificationIds.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          Verif: {r.verificationIds.join(', ')}
                        </span>
                      )}
                      {r.rubricCriterionIds.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          Rubric: {r.rubricCriterionIds.join(', ')}
                        </span>
                      )}
                      {r.rootCauseIds.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          RootCause: {r.rootCauseIds.join(', ')}
                        </span>
                      )}
                      <span className="ml-auto text-emerald-400 font-semibold">
                        Confidence: {(r.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                  </div>
                ))}
              </div>
            ) : isRecommendationsDone ? (
              <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-950/40 text-slate-400 text-xs">
                No recommendations match the active filter criteria.
              </div>
            ) : (
              <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <Lightbulb className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-300">Recommendations Awaiting Evaluation Run</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Click "RUN EVALUATION" to extract requirements, evaluate claims, diagnose failure modes, and generate actionable recommendations.
                </p>
              </div>
            )}

            {/* Product Remediation Overview Grid */}
            {isRecommendationsDone && recommendationProductsList.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
                  Product-Level Remediation Status
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recommendationProductsList.map((ps) => {
                    const pSev = productSeverities[ps.productId];
                    return (
                      <div
                        key={ps.productId}
                        className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-violet-300 bg-violet-950/80 border border-violet-800/60 px-1.5 py-0.2 rounded font-semibold">
                              {ps.productId}
                            </span>
                            <span className="font-semibold text-slate-200">
                              {ps.productName}
                            </span>
                          </div>
                          {pSev && (
                            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-400">
                              SEV: {pSev.severity}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {ps.requiresCorrection && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">
                              REQUIRES CORRECTION / REPLACEMENT
                            </span>
                          )}
                          {ps.requiresMoreEvidence && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                              REQUIRES MORE EVIDENCE
                            </span>
                          )}
                          {ps.hasNoRequirementRemediation && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                              NO REQUIREMENT REMEDIATION REQUIRED
                            </span>
                          )}
                          {ps.requiresExternalVerification && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-950 text-sky-300 border border-sky-800">
                              EXTERNAL VERIFICATION RECOMMENDED
                            </span>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-800/60 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                          <span>Total Recs: {ps.totalRecommendations}</span>
                          <span className="text-slate-500">
                            {ps.criticalCount} Crit · {ps.highCount} High · {ps.mediumCount} Med · {ps.lowCount} Low
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Final Report Integration Notice */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-slate-300 block">Final Evaluation Integration Active:</span>
                  <span className="text-[11px] text-slate-500">
                    Recommendations are actionable and evidence-grounded. Final integrated verdict and report are available in Tab 8.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('final_evaluation')}
                className="font-mono text-[10px] text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900/80 px-2.5 py-1 rounded border border-emerald-800/80 whitespace-nowrap cursor-pointer flex items-center gap-1 transition-colors"
              >
                <span>VIEW FINAL EVALUATION</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 8: FINAL INTEGRATED EVALUATION & VERDICT */}
        {/* ========================================================================= */}
        {activeTab === 'final_evaluation' && (
          <FinalEvaluationView
            finalEvaluationResult={finalEvaluationResult}
            onSelectTab={setActiveTab}
          />
        )}

        {/* ========================================================================= */}
        {/* TAB 9: RAW JSON */}
        {/* ========================================================================= */}
        {activeTab === 'raw_json' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Raw Machine-Readable JSON Analysis (Prompt + Claims + Verification + Rubric + Support + RootCause + SeverityScoring + Recommendations + FinalEvaluation)
                </h3>
                <p className="text-xs text-slate-400">
                  Combined structured payload containing all automated pipeline artifacts, failure classifications, transparent evidence scores, actionable recommendations, and final integrated verdict.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors cursor-pointer self-start sm:self-auto"
              >
                {copiedJson ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[12px] font-mono text-emerald-400/90 overflow-x-auto leading-relaxed max-h-[440px] scrollbar-thin">
              {JSON.stringify(rawJsonDisplay, null, 2)}
            </pre>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 10: REPORT & EXPORT */}
        {/* ========================================================================= */}
        {activeTab === 'report_export' && (
          <ReportExportView
            conversationAssessments={conversationAssessments}
            isInputsModified={isInputsModified}
            inputs={inputs}
            promptAnalysis={promptAnalysis}
            claimAnalysis={claimAnalysis}
            verificationResult={verificationResult}
            rubricResult={rubricResult}
            claimSupportResult={claimSupportResult}
            rootCauseResult={rootCauseResult}
            severityAndScoringResult={severityAndScoringResult}
            recommendationResult={recommendationResult}
            finalEvaluationResult={finalEvaluationResult}
            onSelectTab={setActiveTab}
          />
        )}

      </div>

    </section>
  );
};
