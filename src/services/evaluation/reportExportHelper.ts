/**
 * Report & Export Pure Formatting Helpers
 *
 * Deterministic generation of:
 * 1. Independently readable claim statements (resolving bare scalars to auditable evidence)
 * 2. Structured JSON export payloads
 * 3. Human-readable Markdown audit summaries
 *
 * Used by ReportExportView.tsx (UI presentation) and regression test suites.
 */

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
} from '../../types/evaluation';

export interface ReportExportDataParams {
  reportId?: string;
  inputs: EvaluatorInput;
  promptAnalysis: UserPromptAnalysisResult | null;
  claimAnalysis: LlmOutputClaimAnalysisResult | null;
  verificationResult: VerificationEngineResult | null;
  rubricResult: RubricEngineResult | null;
  claimSupportResult: ClaimSupportAnalysisResult | null;
  rootCauseResult: RootCauseAnalysisResult | null;
  severityAndScoringResult: SeverityAndScoringResult | null;
  recommendationResult: RecommendationEngineResult | null;
  finalEvaluationResult: FinalEvaluationResult;
}

export interface ExportJsonPayload {
  reportId: string;
  metadata: {
    checkpoint: string;
    generatedAt: string;
    evaluatorVersion: string;
    inputContract: string;
    externalTruthVerificationConducted: boolean;
  };
  inputs: EvaluatorInput;
  finalVerdict: string;
  verdictRationale: string;
  summary: FinalEvaluationResult['summary'];
  productVerdicts: FinalEvaluationResult['productVerdicts'];
  cartEvaluation?: FinalEvaluationResult['cartEvaluation'];
  requirementCoverage: FinalEvaluationResult['requirementCoverage'];
  claimContext: FinalEvaluationResult['claimContext'];
  claimSupportAudit: Array<{
    claimId: string;
    productId: string | null;
    productName: string | null;
    statement: string;
    readableClaimStatement: string;
    sourceEvidence: string;
    responseSupport: string;
    externalTruthStatus: string;
    internalConsistency: string;
    verificationPriority: string;
    nature: string;
  }>;
  rootCauseSummary: FinalEvaluationResult['rootCauseSummary'];
  prioritizedNextActions: FinalEvaluationResult['prioritizedNextActions'];
  traceability: FinalEvaluationResult['traceability'];
  rawUpstreamArtifacts: {
    promptAnalysis: UserPromptAnalysisResult | null;
    claimAnalysis: LlmOutputClaimAnalysisResult | null;
    verificationResult: VerificationEngineResult | null;
    rubricResult: RubricEngineResult | null;
    claimSupportResult: ClaimSupportAnalysisResult | null;
    rootCauseResult: RootCauseAnalysisResult | null;
    severityAndScoringResult: SeverityAndScoringResult | null;
    recommendationResult: RecommendationEngineResult | null;
  };
}

/**
 * Builds an index map of extracted claims by claimId.
 */
export function buildExtractedClaimMap(
  claims?: ExtractedClaim[] | null
): Map<string, ExtractedClaim> {
  const extractedClaimMap = new Map<string, ExtractedClaim>();
  if (claims) {
    for (const cl of claims) {
      extractedClaimMap.set(cl.id, cl);
    }
  }
  return extractedClaimMap;
}

/**
 * Generates an auditable report identifier based on evaluation timestamp.
 */
export function generateReportId(evaluatedAt: string): string {
  return `EV-RPT-${evaluatedAt.replace(/[-:T.Z]/g, '').slice(0, 14)}`;
}

/**
 * Deterministically resolves an independently readable, auditable claim statement
 * using upstream structured fields (attribute, operator, value, unit, sourceText)
 * instead of bare scalar reductions (e.g. "32", "50", "89", "99", "129").
 */
export function formatReadableClaimStatement(
  supportRec: ClaimSupportRecord,
  extractedClaimMap?: Map<string, ExtractedClaim> | null
): string {
  const rawClaim = extractedClaimMap?.get(supportRec.claimId);
  const productName =
    rawClaim?.productName ||
    supportRec.productName ||
    (supportRec.productId ? `Product ${supportRec.productId}` : '');
  const productPrefix = productName ? `${productName} — ` : '';

  if (rawClaim) {
    const attr = (rawClaim.attribute || '').toLowerCase();
    const val = rawClaim.value;
    const unit = rawClaim.unit;
    const op = (rawClaim.operator || '').toLowerCase();
    const src = (rawClaim.sourceText || '').trim();

    // Case 1: Product Identification / Name
    if (
      attr === 'product_name' ||
      attr === 'product' ||
      attr === 'name' ||
      attr.includes('product')
    ) {
      return `Recommended product: ${val || src || productName || 'Product'}`;
    }

    // Case 2: Price
    if (attr === 'price' || rawClaim.claimType === 'price') {
      const isNumeric =
        typeof val === 'number' || (!isNaN(Number(val)) && String(val).trim() !== '');
      let formattedPrice = '';
      if (isNumeric) {
        const num = typeof val === 'number' ? val : Number(val);
        formattedPrice = unit === 'USD' || !unit ? `$${num}` : `${num} ${unit}`;
      } else if (String(val).startsWith('$')) {
        formattedPrice = String(val);
      } else if (src) {
        formattedPrice = src.replace(/^for\s+/i, '');
      } else {
        formattedPrice = `$${val}`;
      }
      return `${productPrefix}price: ${formattedPrice}`;
    }

    // Case 3: SPF Rating
    if (attr.includes('spf')) {
      return `${productPrefix}SPF rating: ${val}`;
    }

    // Case 4: Ingredients / Composition
    if (
      attr === 'ingredient' ||
      attr === 'ingredients' ||
      attr === 'composition' ||
      op === 'contains'
    ) {
      if (src.toLowerCase().includes('contains')) {
        return `${productPrefix}${src}`;
      }
      return `${productPrefix}contains ${val}`;
    }

    // Case 5: Hypoallergenic / Sensitivity / Allergen
    if (
      attr === 'hypoallergenic' ||
      attr === 'sensitive_skin' ||
      rawClaim.claimType === 'sensitivity' ||
      rawClaim.claimType === 'safety'
    ) {
      if (src.toLowerCase().includes('hypoallergenic') || src.toLowerCase().includes('sensitive')) {
        return `${productPrefix}${src}`;
      }
      return `${productPrefix}${attr.replace(/_/g, ' ')}: ${val}`;
    }

    // Case 6: Contains / Excludes operators
    if (op === 'contains') {
      return `${productPrefix}contains ${val}`;
    }
    if (op === 'excludes' || op === 'prohibited') {
      return `${productPrefix}excludes ${val}`;
    }

    // Case 7: Informative source text phrase
    if (
      src &&
      src.length > String(val).length + 2 &&
      !/^\d+$/.test(src) &&
      !/^[A-Z0-9_-]+$/i.test(src)
    ) {
      return `${productPrefix}${src}`;
    }

    // Case 8: Standard structured attribute: value
    const attrLabel = attr.replace(/_/g, ' ');
    const unitStr = unit ? ` ${unit}` : '';
    return `${productPrefix}${attrLabel}: ${val}${unitStr}`;
  }

  // Fallback using ClaimSupportRecord if raw claim was absent
  const pName =
    supportRec.productName || (supportRec.productId ? `Product ${supportRec.productId}` : '');
  const pPrefix = pName ? `${pName} — ` : '';
  const attr = (supportRec.attribute || '').toLowerCase();

  if (attr === 'product_name' || attr === 'name') {
    return `Recommended product: ${supportRec.sourceEvidence || supportRec.statement || pName}`;
  }
  if (attr === 'price') {
    const pVal = supportRec.statement.startsWith('$')
      ? supportRec.statement
      : `$${supportRec.statement}`;
    return `${pPrefix}price: ${pVal}`;
  }
  if (attr.includes('spf')) {
    return `${pPrefix}SPF rating: ${supportRec.statement}`;
  }
  if (
    supportRec.sourceEvidence &&
    supportRec.sourceEvidence.length > supportRec.statement.length + 2
  ) {
    return `${pPrefix}${supportRec.sourceEvidence}`;
  }

  const attrLabel = supportRec.attribute.replace(/_/g, ' ');
  return `${pPrefix}${attrLabel}: ${supportRec.statement}`;
}

/**
 * Builds the canonical structured JSON export payload.
 */
export function buildExportJsonPayload(params: ReportExportDataParams): ExportJsonPayload {
  const {
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
  } = params;

  const reportId = params.reportId || generateReportId(finalEvaluationResult.evaluatedAt);
  const extractedClaimMap = buildExtractedClaimMap(claimAnalysis?.claims);

  return {
    reportId,
    metadata: {
      checkpoint: 'Checkpoint 11A (Claim Readability & Export v1.2)',
      generatedAt: finalEvaluationResult.evaluatedAt,
      evaluatorVersion: '1.0.0-auditable',
      inputContract: 'EXACTLY_TWO_INPUTS',
      externalTruthVerificationConducted: false,
    },
    inputs,
    finalVerdict: finalEvaluationResult.finalVerdict,
    verdictRationale: finalEvaluationResult.verdictRationale,
    summary: finalEvaluationResult.summary,
    productVerdicts: finalEvaluationResult.productVerdicts,
    cartEvaluation: finalEvaluationResult.cartEvaluation,
    requirementCoverage: finalEvaluationResult.requirementCoverage,
    claimContext: finalEvaluationResult.claimContext,
    claimSupportAudit: (claimSupportResult?.records || []).map((c) => ({
      claimId: c.claimId,
      productId: c.productId,
      productName: c.productName,
      statement: c.statement,
      readableClaimStatement: formatReadableClaimStatement(c, extractedClaimMap),
      sourceEvidence: c.sourceEvidence,
      responseSupport: c.responseSupport,
      externalTruthStatus: c.externalTruthStatus,
      internalConsistency: c.internalConsistency,
      verificationPriority: c.verificationPriority,
      nature: c.nature,
    })),
    rootCauseSummary: finalEvaluationResult.rootCauseSummary,
    prioritizedNextActions: finalEvaluationResult.prioritizedNextActions,
    traceability: finalEvaluationResult.traceability,
    rawUpstreamArtifacts: {
      promptAnalysis,
      claimAnalysis,
      verificationResult,
      rubricResult,
      claimSupportResult,
      rootCauseResult,
      severityAndScoringResult,
      recommendationResult,
    },
  };
}

/**
 * Builds the clean Markdown audit report string.
 */
export function buildExportMarkdownReport(params: ReportExportDataParams): string {
  const {
    inputs,
    claimAnalysis,
    claimSupportResult,
    finalEvaluationResult,
  } = params;

  const reportId = params.reportId || generateReportId(finalEvaluationResult.evaluatedAt);
  const formattedDate = new Date(finalEvaluationResult.evaluatedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  const extractedClaimMap = buildExtractedClaimMap(claimAnalysis?.claims);

  const {
    finalVerdict,
    verdictRationale,
    summary,
    productVerdicts,
    requirementCoverage,
    rootCauseSummary,
    prioritizedNextActions,
  } = finalEvaluationResult;

  const md = [
    `# AI Shopping Assistant Evaluation Report`,
    `**Report ID:** ${reportId}`,
    `**Generated:** ${formattedDate}`,
    `**Checkpoint:** Checkpoint 11A (Audit & Export Specification v1.2)`,
    `**Products Evaluated:** ${summary.totalProductsEvaluated}`,
    ``,
    `---`,
    `## OVERALL VERDICT: ${finalVerdict}`,
    `**Rationale:** ${verdictRationale}`,
    `- **Overall Severity:** ${summary.overallSeverity}`,
    `- **Evaluated Evidence Score:** ${summary.averageEvaluatedEvidenceScore !== null ? `${summary.averageEvaluatedEvidenceScore}/100` : 'N/A'} (Score is a coverage metric, not a probability)`,
    `- **Hard Gate Distribution:** ${summary.hardGateDistribution.pass} Pass, ${summary.hardGateDistribution.fail} Fail, ${summary.hardGateDistribution.indeterminate} Indeterminate`,
    `- **Confirmed Failures:** ${summary.totalConfirmedFailures}`,
    `- **Unresolved UNKNOWN:** ${summary.totalUnresolvedUnknown} (UNKNOWN ≠ FAIL)`,
    `- **Unverified Factual Claims:** ${summary.totalUnverifiedFactualClaims} (UNVERIFIED ≠ FALSE)`,
    ``,
    `---`,
    `## 1. ORIGINAL EVALUATION INPUTS`,
    `### User Prompt:`,
    `> ${inputs.userPrompt}`,
    ``,
    `### LLM Output:`,
    `> ${inputs.llmOutput}`,
    ``,
    `---`,
    `## 2. PRODUCT-LEVEL EVALUATIONS`,
    ...productVerdicts.map((p) => [
      `### Product: ${p.productName} (${p.productId})`,
      `- **Verdict:** ${p.verdict}`,
      `- **Hard Gate:** ${p.hardGateState}`,
      `- **Severity:** ${p.severity}`,
      `- **Evidence Score:** ${p.evaluatedEvidenceScore !== null ? `${p.evaluatedEvidenceScore}/100` : 'N/A'}`,
      `- **Hard Requirements:** ${p.confirmedHardSatisfactionPercent}% (${p.passedHardCount} Pass, ${p.failedHardCount} Fail, ${p.unknownHardCount} Unknown of ${p.totalHardCount})`,
      `- **Rationale:** ${p.rationale}`,
      `- **Remediation:** ${p.remediationSummary}`,
      ``,
    ].join('\n')),
    ...(finalEvaluationResult.cartEvaluation?.hasCartEvaluation ? [
      `---`,
      `## 2B. SHOPPING CART EVALUATION`,
      `- **Cart Hard Gate:** ${finalEvaluationResult.cartEvaluation.cartHardGateState}`,
      `- **Calculated Cart Total:** ${finalEvaluationResult.cartEvaluation.calculatedCartTotal == null ? 'Unknown' : `$${finalEvaluationResult.cartEvaluation.calculatedCartTotal}`}`,
      `- **Stated Cart Total:** ${finalEvaluationResult.cartEvaluation.ambiguousStatedTotal ? 'Ambiguous amount or unsupported currency (see evidence)' : finalEvaluationResult.cartEvaluation.statedCartTotal == null ? 'Not stated' : `$${finalEvaluationResult.cartEvaluation.statedCartTotal}`}`,
      `- **Effective Cart Total:** ${finalEvaluationResult.cartEvaluation.effectiveCartTotal == null ? 'Unknown' : `$${finalEvaluationResult.cartEvaluation.effectiveCartTotal}`}`,
      `- **Items:**`,
      ...finalEvaluationResult.cartEvaluation.cartItems.map(
        (it) => `  - ${it.quantity ?? 'Unknown'}x ${it.productName}: $${it.unitPrice ?? '?'}${it.lineTotal !== null ? ` = $${it.lineTotal}` : ''}`
      ),
      `- **Cart Evaluation Rationale:** ${finalEvaluationResult.cartEvaluation.rationale}`,
      ``,
    ] : []),
    `---`,
    `## 3. REQUIREMENT COVERAGE SUMMARY`,
    `- **Confirmed Satisfied:** ${requirementCoverage.confirmedSatisfied.length}`,
    `- **Confirmed Failed:** ${requirementCoverage.confirmedFailed.length}`,
    `- **Unknown Requirements:** ${requirementCoverage.unknownRequirements.length} (UNKNOWN requirements are not counted as failures)`,
    ``,
    `---`,
    `## 4. CLAIM SUPPORT & TRUTH CONTEXT`,
    ...(claimSupportResult?.records || []).map(
      (c) => `- **[${c.claimId}]** ${formatReadableClaimStatement(c, extractedClaimMap)} | Nature: ${c.nature.toUpperCase()} | Support: ${c.responseSupport} | External Truth: ${c.externalTruthStatus}`
    ),
    ``,
    `---`,
    `## 5. ROOT-CAUSE FINDINGS`,
    ...rootCauseSummary.allCauses.map((rc) => `- [${rc.code}] (${rc.role.toUpperCase()}) ${rc.productName}: ${rc.explanation}`),
    ``,
    `---`,
    `## 6. ACTIONABLE RECOMMENDATIONS (PRIORITIZED)`,
    ...prioritizedNextActions.slice(0, 5).map((r, i) => `${i + 1}. **[${r.priority}] ${r.title}** (${r.productName}): ${r.action}`),
    ``,
    `---`,
    `## 7. INVARIANTS & AUDIT LIMITATIONS`,
    `- Hard gates are authoritative. A numeric evidence score cannot soften or override a hard failure.`,
    `- UNKNOWN is not FAIL. Missing evidence is not diagnosed as a product defect.`,
    `- UNVERIFIED is not FALSE. Unverified claims remain informational context unless external truth verification disproves them.`,
    `- The evaluator operates exclusively on the provided User Prompt and LLM Output. External catalog lookup was not conducted.`,
  ].join('\n');

  return md;
}

export interface ProfessionalReportData {
  title: string;
  reportId: string;
  generatedDate: string;
  overallVerdict: string;
  overallSeverity: string;
  executiveSummary: string;
  findings: string[];
  productAssessments: Array<{
    productName: string;
    productId: string;
    verdict: string;
    narrative: string;
    violations: string[];
    uncertainties: string[];
  }>;
  correctiveActions: string[];
  conclusion: string;
  assessmentLimitations: string[];
  plainText: string;
}

export interface DetailedEvaluatedRequirement {
  constraintId: string;
  productName: string;
  sourceText: string;
  attribute: string;
  polarity: 'positive' | 'negative';
  type: 'hard' | 'soft';
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  statusLabel: string;
  evidenceOrDetails: string;
}

export interface DetailedProductAnalysis {
  productName: string;
  productId: string;
  verdict: string;
  verdictLabel: string;
  narrative: string;
  requirements: DetailedEvaluatedRequirement[];
  claimsAnalyzed: Array<{
    claimId: string;
    statement: string;
    nature: string;
    responseSupport: string;
    externalTruthStatus: string;
    internalConsistency: string;
  }>;
  isolatedCorrectiveActions: string[];
}

export interface DetailedProfessionalReportData {
  title: string;
  reportId: string;
  generatedDate: string;
  overallVerdict: string;
  overallSeverity: string;
  customerPrompt: string;
  assistantOutput: string;
  executiveSummary: string;
  keyFindings: string[];
  evaluatedRequirements: DetailedEvaluatedRequirement[];
  productAnalyses: DetailedProductAnalysis[];
  cartVerificationNote?: string;
  prioritizedCorrectiveActions: string[];
  conclusion: string;
  assessmentLimitations: string[];
  plainText: string;
}

/**
 * Deterministically constructs a concise, natural-language, human-readable QA assessment
 * from structured evaluation findings without extra API calls or internal jargon.
 */
export function buildConciseProfessionalReport(params: ReportExportDataParams): ProfessionalReportData {
  const {
    inputs,
    finalEvaluationResult,
    claimSupportResult,
    claimAnalysis,
  } = params;

  const reportId = params.reportId || generateReportId(finalEvaluationResult.evaluatedAt);
  const formattedDate = new Date(finalEvaluationResult.evaluatedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const {
    finalVerdict,
    verdictRationale,
    summary,
    productVerdicts,
    requirementCoverage,
    prioritizedNextActions,
  } = finalEvaluationResult;

  const totalProducts = productVerdicts.length;
  const passedProducts = productVerdicts.filter((p) => p.verdict === 'PASS').length;
  const failedProducts = productVerdicts.filter((p) => p.verdict === 'FAIL').length;
  const indeterminateProducts = productVerdicts.filter((p) => p.verdict === 'INDETERMINATE').length;

  // 1. Executive Summary narrative (clean, direct QA voice without formulaic phrases)
  let executiveSummary = '';
  if (finalVerdict === 'PASS') {
    executiveSummary = `The shopping assistant's response successfully satisfies the customer's specified requirements across all evaluated recommendations. Across ${totalProducts} evaluated product${totalProducts === 1 ? '' : 's'}, no hard requirement violations were identified, and all stated product attributes align with the shopper's criteria.`;
  } else if (finalVerdict === 'FAIL') {
    if (finalEvaluationResult.cartEvaluation?.hasCartFailure) {
      executiveSummary = 'The response fails a mandatory shopping-cart requirement. Product-level assessments remain independent of cart quantities and combined budget constraints.';
    } else if (totalProducts > 1 && passedProducts > 0) {
      executiveSummary = `The shopping assistant's response does not pass review due to requirement non-compliance in one or more recommended items. While certain recommendations met customer expectations, at least one recommended product directly violated the shopper's stated criteria, resulting in an overall failed assessment.`;
    } else {
      executiveSummary = `The shopping assistant's response fails to satisfy the customer's stated requirements. The evaluation confirmed direct violations of mandatory criteria specified in the customer prompt.`;
    }
  } else {
    executiveSummary = `The evaluation concludes with an indeterminate status. While no confirmed requirement violations were detected, critical customer criteria remain unaddressed in the response, preventing definitive verification of product suitability.`;
  }

  // 2. Key Findings list
  const findings: string[] = [];

  // Finding on confirmed violations
  if (requirementCoverage.confirmedFailed.length > 0) {
    const failedDescriptions = requirementCoverage.confirmedFailed.map((f) => {
      const pName = f.productName ? `${f.productName}: ` : '';
      const evidence = f.evidenceInOutput.length > 0 ? ` (stated: "${f.evidenceInOutput.join(', ')}")` : '';
      return `${pName}${f.type === 'soft' ? 'optional preference' : 'mandatory requirement'} "${f.sourceText}" was violated${evidence}`;
    });
    findings.push(`Requirement Violations: ${failedDescriptions.join('; ')}.`);
  } else {
    findings.push(`Requirement Compliance: No confirmed violations of mandatory customer criteria were identified in the assistant response.`);
  }

  // Finding on missing evidence / unaddressed requirements
  if (requirementCoverage.unknownRequirements.length > 0) {
    const missingItems = requirementCoverage.unknownRequirements.map((u) => u.sourceText).slice(0, 5);
    const andMore = requirementCoverage.unknownRequirements.length > 5 ? ` and ${requirementCoverage.unknownRequirements.length - 5} more` : '';
    findings.push(`Unconfirmed Customer Criteria: Stated criteria regarding ${missingItems.join(', ')}${andMore} could not be conclusively verified from the assistant response. Relevant statements may be present but insufficient to establish compliance; these requirements remain unconfirmed rather than treated as product defects.`);
  }

  // Finding on internal consistency & contradictions
  const contradictedClaims = (claimSupportResult?.records || []).filter((c) => c.internalConsistency === 'CONTRADICTED');
  if (contradictedClaims.length > 0) {
    const pNames = Array.from(new Set(contradictedClaims.map((c) => c.productName || 'the product'))).join(', ');
    findings.push(`Internal Inconsistency: Conflicting statements were detected within the assistant's response regarding ${pNames}. The response simultaneously asserts and denies key product characteristics without clarifying context.`);
  }

  // Finding on multi-product isolation if applicable
  if (totalProducts > 1) {
    findings.push(`Multi-Product Evaluation: Each recommended product was assessed independently. Findings and violations identified for one product were strictly isolated and not transferred to others.`);
  }

  // 3. Product-Specific Assessments
  const productAssessments = productVerdicts.map((pv) => {
    const violations: string[] = [];
    const uncertainties: string[] = [];

    // Find failed requirements for this product
    const prodFailed = requirementCoverage.confirmedFailed.filter(
      (f) => f.productName === pv.productName || f.constraintId.includes(pv.productId)
    );
    for (const pf of prodFailed) {
      const ev = pf.evidenceInOutput.length > 0 ? ` (stated "${pf.evidenceInOutput.join(', ')}")` : '';
      violations.push(`Violates customer constraint "${pf.sourceText}"${ev}`);
    }

    // Find unaddressed requirements for this product
    const prodUnknown = requirementCoverage.unknownRequirements.filter(
      (u) => u.productName === pv.productName || u.constraintId.includes(pv.productId)
    );
    for (const pu of prodUnknown) {
      uncertainties.push(`Unconfirmed customer criteria: "${pu.sourceText}"`);
    }

    // Build human narrative
    let narrative = '';
    if (pv.verdict === 'PASS') {
      narrative = `${pv.productName} fully satisfies the evaluated customer requirements. Stated attributes correspond with all specified criteria.`;
    } else if (pv.verdict === 'FAIL') {
      if (violations.length > 0) {
        narrative = `${pv.productName} does not meet customer requirements. ${violations.join('. ')}.`;
      } else {
        narrative = `${pv.productName} failed evaluation: ${pv.rationale.replace(/HC-\d+|INT-\d+|NC-\d+|DAT-\d+|SAF-\d+|RET-\d+|FAC-\d+|HARD_GATE_FAIL|HARD_GATE_PASS/g, '').trim()}.`;
      }
    } else {
      narrative = `${pv.productName} cannot be definitively verified. ${
        uncertainties.length > 0
          ? `Key criteria (${uncertainties.map((u) => u.replace('Unconfirmed customer criteria: ', '')).join(', ')}) remain unverified from the response evidence.`
          : 'Essential criteria remain unstated.'
      }`;
    }

    return {
      productName: pv.productName,
      productId: pv.productId,
      verdict: pv.verdict,
      narrative,
      violations,
      uncertainties,
    };
  });

  // 4. Corrective Actions (clean natural language, free from internal codes)
  const correctiveActions: string[] = prioritizedNextActions.slice(0, 4).map((rec) => {
    let cleanAction = rec.action.replace(/[A-Z]+-\d+/g, '').replace(/HARD_GATE_[A-Z]+/g, '').replace(/\s{2,}/g, ' ').trim();
    // Ensure strict numeric boundary precision in recommendation wording
    if (cleanAction.toLowerCase().includes('under $25') || cleanAction.toLowerCase().includes('ceiling')) {
      cleanAction = cleanAction.replace(/below or equal to/gi, 'strictly below');
    }
    return `For ${rec.productName}: ${cleanAction}`;
  });
  if (correctiveActions.length === 0) {
    if (finalVerdict === 'PASS') {
      correctiveActions.push(`Maintain current recommendation parameters; no immediate corrective action required.`);
    } else {
      correctiveActions.push(`Ensure product recommendations explicitly match all mandatory prompt constraints before delivery.`);
    }
  }

  // 5. Final Conclusion
  let conclusion = '';
  if (finalVerdict === 'PASS') {
    conclusion = `The shopping assistant's response is approved. Recommendations comply with stated shopper preferences and criteria.`;
  } else if (finalVerdict === 'FAIL') {
    conclusion = `The response requires revision. The assistant should re-evaluate product selection to eliminate conflicting or non-compliant recommendations before presenting options to the shopper.`;
  } else {
    conclusion = `The response is incomplete. The assistant should provide explicit confirmation for all shopper criteria with sufficient supporting details for relevant product attributes.`;
  }

  // 6. Assessment Limitations
  const assessmentLimitations = [
    'Scope of Review: Evaluation is grounded strictly on the provided customer prompt and assistant response text.',
    'External Verification: Independent catalog or external database verification was not performed; unverified factual claims are noted as unconfirmed rather than erroneous.',
    'Evidence Standard: Missing information is treated as unconfirmed requirement context, not as an affirmative product defect.',
  ];

  // 7. Plain-text compiled output (no Markdown syntax characters like # or **)
  const lines: string[] = [];
  lines.push('SHOPPING ASSISTANT RESPONSE EVALUATION');
  lines.push(`Overall Assessment: ${finalVerdict} (Severity: ${summary.overallSeverity})`);
  lines.push(...cartReportLines(finalEvaluationResult));
  lines.push('');
  lines.push('OVERALL ASSESSMENT');
  lines.push(executiveSummary);
  lines.push('');
  lines.push('KEY FINDINGS');
  for (const f of findings) {
    lines.push(`• ${f}`);
  }
  lines.push('');
  lines.push('PRODUCT-SPECIFIC ASSESSMENTS');
  for (const pa of productAssessments) {
    lines.push(`${pa.productName} — Verdict: ${pa.verdict}`);
    lines.push(pa.narrative);
    lines.push('');
  }
  lines.push('RECOMMENDED CORRECTIVE ACTIONS');
  for (let i = 0; i < correctiveActions.length; i++) {
    lines.push(`${i + 1}. ${correctiveActions[i]}`);
  }
  lines.push('');
  lines.push('FINAL CONCLUSION');
  lines.push(conclusion);
  lines.push('');
  lines.push('ASSESSMENT LIMITATIONS');
  for (const al of assessmentLimitations) {
    lines.push(`• ${al}`);
  }

  const plainText = lines.join('\n');

  return {
    title: 'Shopping Assistant Response Evaluation',
    reportId,
    generatedDate: formattedDate,
    overallVerdict: finalVerdict,
    overallSeverity: summary.overallSeverity,
    executiveSummary,
    findings,
    productAssessments,
    correctiveActions,
    conclusion,
    assessmentLimitations,
    plainText,
  };
}

/**
 * Backward compatibility alias: buildProfessionalEvaluationReport points to buildConciseProfessionalReport.
 */
export const buildProfessionalEvaluationReport = buildConciseProfessionalReport;

function cartReportLines(result: FinalEvaluationResult): string[] {
  const cart = result.cartEvaluation;
  if (!cart?.hasCartEvaluation) return [];
  const amount = (value: number | null) => value === null ? 'Unknown' : `$${value}`;
  return ['SHOPPING CART EVALUATION', `Cart assessment: ${cart.cartHardGateState.replace('HARD_GATE_', '')}`,
    `Calculated total: ${amount(cart.calculatedCartTotal)}; Stated total: ${cart.ambiguousStatedTotal ? 'Ambiguous amount or unsupported currency (see evidence)' : cart.statedCartTotal === null ? 'Not stated' : amount(cart.statedCartTotal)}; Effective total: ${amount(cart.effectiveCartTotal)}`,
    ...cart.cartItems.map(i => `${i.quantity ?? 'Unknown'}x ${i.productName}: unit price ${amount(i.unitPrice)}, line total ${amount(i.lineTotal)}`),
    ...cart.verifications.map(v => `${v.constraintEvidence} — ${v.status}: ${v.reason}`), cart.rationale, ''];
}

/**
 * Deterministically constructs an expanded, detailed requirement-by-requirement
 * professional evaluation report from existing evaluation artifacts.
 */
export function buildDetailedProfessionalReport(params: ReportExportDataParams): DetailedProfessionalReportData {
  const {
    inputs,
    finalEvaluationResult,
    claimSupportResult,
    claimAnalysis,
  } = params;

  const reportId = params.reportId || generateReportId(finalEvaluationResult.evaluatedAt);
  const formattedDate = new Date(finalEvaluationResult.evaluatedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const {
    finalVerdict,
    summary,
    productVerdicts,
    requirementCoverage,
    prioritizedNextActions,
  } = finalEvaluationResult;

  const totalProducts = productVerdicts.length;
  const passedProducts = productVerdicts.filter((p) => p.verdict === 'PASS').length;

  // 1. Executive Summary
  let executiveSummary = '';
  if (finalVerdict === 'PASS') {
    executiveSummary = `The shopping assistant's response successfully satisfies the customer's specified requirements across all evaluated recommendations. Across ${totalProducts} evaluated product${totalProducts === 1 ? '' : 's'}, no hard requirement violations were identified, and all stated product attributes align with the shopper's criteria.`;
  } else if (finalVerdict === 'FAIL') {
    if (finalEvaluationResult.cartEvaluation?.hasCartFailure) {
      executiveSummary = 'The response fails a mandatory shopping-cart requirement. Product-level assessments remain independent of cart quantities and combined budget constraints.';
    } else if (totalProducts > 1 && passedProducts > 0) {
      executiveSummary = `The shopping assistant's response does not pass review due to requirement non-compliance in one or more recommended items. While certain recommendations met customer expectations, at least one recommended product directly violated the shopper's stated criteria, resulting in an overall failed assessment.`;
    } else {
      executiveSummary = `The shopping assistant's response fails to satisfy the customer's stated requirements. The evaluation confirmed direct violations of mandatory criteria specified in the customer prompt.`;
    }
  } else {
    executiveSummary = `The evaluation concludes with an indeterminate status. While no confirmed requirement violations were detected, critical customer criteria remain unaddressed in the response, preventing definitive verification of product suitability.`;
  }

  // 2. Key Findings
  const keyFindings: string[] = [];
  if (requirementCoverage.confirmedFailed.length > 0) {
    const failedList = requirementCoverage.confirmedFailed.map((f) => {
      const pName = f.productName ? `${f.productName}: ` : '';
      const evidence = f.evidenceInOutput.length > 0 ? ` (stated: "${f.evidenceInOutput.join(', ')}")` : '';
      return `${pName}${f.type === 'soft' ? 'optional preference' : 'mandatory requirement'} "${f.sourceText}" was violated${evidence}`;
    });
    keyFindings.push(`Confirmed Requirement Violations: ${failedList.join('; ')}.`);
  } else {
    keyFindings.push(`Requirement Compliance: No confirmed violations of mandatory customer criteria were identified in the assistant response.`);
  }

  if (requirementCoverage.unknownRequirements.length > 0) {
    const missing = requirementCoverage.unknownRequirements.map((u) => u.sourceText).slice(0, 5);
    const andMore = requirementCoverage.unknownRequirements.length > 5 ? ` and ${requirementCoverage.unknownRequirements.length - 5} more` : '';
    keyFindings.push(`Unconfirmed Customer Criteria: Stated criteria regarding ${missing.join(', ')}${andMore} could not be conclusively verified from the assistant response. Relevant statements may be present but insufficient to establish compliance; these requirements remain unconfirmed rather than treated as product defects.`);
  }

  const contradictedClaims = (claimSupportResult?.records || []).filter((c) => c.internalConsistency === 'CONTRADICTED');
  if (contradictedClaims.length > 0) {
    const pNames = Array.from(new Set(contradictedClaims.map((c) => c.productName || 'the product'))).join(', ');
    keyFindings.push(`Internal Inconsistency: Conflicting statements were detected within the assistant's response regarding ${pNames}. The response simultaneously asserts and denies key product characteristics without clarifying context.`);
  }

  if (totalProducts > 1) {
    keyFindings.push(`Multi-Product Evaluation: Each recommended product was assessed independently. Findings and violations identified for one product were strictly isolated and not transferred to others.`);
  }

  // 3. Evaluated Requirements Matrix
  const evaluatedRequirements: DetailedEvaluatedRequirement[] = [];

  // Helper for numeric strict boundary explanations
  const formatBoundaryEvidence = (sourceText: string, evidence: string[]): string => {
    const lower = sourceText.toLowerCase();
    const underMatch = lower.match(/(under|less than|<)\s*\$?(\d+(?:\.\d+)?)/i);
    if (underMatch) {
      const limit = underMatch[2];
      return `Requirement specifies strictly less than $${limit} (not at or below $${limit}). The stated price (${evidence.join(', ') || 'not provided'}) violates this strict boundary.`;
    }
    return `Stated "${evidence.join(', ')}" contradicts customer requirement "${sourceText}".`;
  };

  // Add Satisfied
  for (const item of requirementCoverage.confirmedSatisfied) {
    evaluatedRequirements.push({
      constraintId: item.constraintId,
      productName: item.productName || 'General',
      sourceText: item.sourceText,
      attribute: item.attribute,
      polarity: item.polarity,
      type: item.type,
      status: 'PASS',
      statusLabel: 'Satisfied',
      evidenceOrDetails: item.evidenceInOutput.length > 0
        ? `Confirmed in response: "${item.evidenceInOutput.join('; ')}".`
        : `Criterion satisfied by recommended product specifications.`,
    });
  }

  // Add Failed
  for (const item of requirementCoverage.confirmedFailed) {
    evaluatedRequirements.push({
      constraintId: item.constraintId,
      productName: item.productName || 'General',
      sourceText: item.sourceText,
      attribute: item.attribute,
      polarity: item.polarity,
      type: item.type,
      status: 'FAIL',
      statusLabel: 'Violated',
      evidenceOrDetails: formatBoundaryEvidence(item.sourceText, item.evidenceInOutput),
    });
  }

  // Add Unknown / Missing
  for (const item of requirementCoverage.unknownRequirements) {
    evaluatedRequirements.push({
      constraintId: item.constraintId,
      productName: item.productName || 'General',
      sourceText: item.sourceText,
      attribute: item.attribute,
      polarity: item.polarity,
      type: item.type,
      status: 'UNKNOWN',
      statusLabel: 'Unconfirmed (Missing Evidence)',
      evidenceOrDetails: `The available response evidence does not establish this criterion. Related claims, if present, may be insufficient; the requirement remains unconfirmed rather than assumed to fail.`,
    });
  }

  // 4. Product-Specific Analysis
  const productAnalyses: DetailedProductAnalysis[] = productVerdicts.map((pv) => {
    const prodReqs = evaluatedRequirements.filter(
      (r) => r.productName === pv.productName || r.constraintId.includes(pv.productId)
    );

    const satCount = prodReqs.filter((r) => r.status === 'PASS').length;
    const failCount = prodReqs.filter((r) => r.status === 'FAIL').length;
    const unkCount = prodReqs.filter((r) => r.status === 'UNKNOWN').length;

    let verdictLabel = 'Indeterminate / Unconfirmed';
    if (pv.verdict === 'PASS') verdictLabel = 'Approved / Satisfied';
    if (pv.verdict === 'FAIL') verdictLabel = 'Failed / Non-Compliant';

    let narrative = '';
    if (pv.verdict === 'PASS') {
      narrative = `${pv.productName} fully satisfies the evaluated customer requirements (${satCount} confirmed satisfied). Stated attributes align with all specified criteria.`;
    } else if (pv.verdict === 'FAIL') {
      const violations = prodReqs.filter((r) => r.status === 'FAIL').map((r) => r.evidenceOrDetails);
      narrative = `${pv.productName} does not meet customer requirements (${failCount} confirmed violation${failCount === 1 ? '' : 's'}). ${violations.join(' ')}`;
    } else {
      const unconfirmed = prodReqs.filter((r) => r.status === 'UNKNOWN').map((r) => `"${r.sourceText}"`);
      narrative = `${pv.productName} cannot be definitively verified. Key criteria (${unconfirmed.join(', ')}) remain unverified from the response evidence.`;
    }

    // Claims analyzed for this product
    const prodClaims = (claimSupportResult?.records || [])
      .filter((c) => c.productName === pv.productName || !c.productName)
      .map((c) => ({
        claimId: c.claimId,
        statement: c.statement,
        nature: c.nature,
        responseSupport: c.responseSupport,
        externalTruthStatus: c.externalTruthStatus,
        internalConsistency: c.internalConsistency,
      }));

    // Isolated corrective actions for this product
    const isolatedCorrectiveActions = prioritizedNextActions
      .filter((a) => a.productName === pv.productName)
      .map((a) => a.action.replace(/[A-Z]+-\d+/g, '').replace(/HARD_GATE_[A-Z]+/g, '').replace(/\s{2,}/g, ' ').trim());

    if (isolatedCorrectiveActions.length === 0) {
      if (pv.verdict === 'PASS') {
        isolatedCorrectiveActions.push(`Maintain current product selection and attribute presentation.`);
      } else if (pv.verdict === 'FAIL') {
        isolatedCorrectiveActions.push(`Select alternative items that strictly comply with all customer constraints.`);
      } else {
        isolatedCorrectiveActions.push(`Provide sufficient supporting details for each unconfirmed criterion before delivering the recommendation.`);
      }
    }

    return {
      productName: pv.productName,
      productId: pv.productId,
      verdict: pv.verdict,
      verdictLabel,
      narrative,
      requirements: prodReqs,
      claimsAnalyzed: prodClaims,
      isolatedCorrectiveActions,
    };
  });

  // 5. Cart / Aggregate Verification note (only describe checks supported by evaluation artifacts)
  let cartVerificationNote: string | undefined = undefined;
  if (finalEvaluationResult.cartEvaluation?.hasCartEvaluation) {
    cartVerificationNote = cartReportLines(finalEvaluationResult).join('\n');
  } else if (totalProducts > 1) {
    cartVerificationNote = 'Individual product recommendations were evaluated independently against specified criteria. Cart-level arithmetic calculations, bundle subtotals, item quantity verification, and aggregate cart budget constraints were not evaluated as no multi-item basket calculations were established in the evaluation artifacts.';
  }

  // 6. Prioritized Corrective Actions
  const prioritizedCorrectiveActions: string[] = prioritizedNextActions.slice(0, 5).map((rec) => {
    let cleanAction = rec.action.replace(/[A-Z]+-\d+/g, '').replace(/HARD_GATE_[A-Z]+/g, '').replace(/\s{2,}/g, ' ').trim();
    if (cleanAction.toLowerCase().includes('under $25') || cleanAction.toLowerCase().includes('ceiling')) {
      cleanAction = cleanAction.replace(/below or equal to/gi, 'strictly below');
    }
    return `For ${rec.productName}: ${cleanAction}`;
  });

  if (prioritizedCorrectiveActions.length === 0) {
    if (finalVerdict === 'PASS') {
      prioritizedCorrectiveActions.push('Maintain current recommendation parameters; all evaluated requirements satisfied.');
    } else {
      prioritizedCorrectiveActions.push('Ensure product recommendations strictly conform to mandatory prompt constraints.');
    }
  }

  // 7. Conclusion
  let conclusion = '';
  if (finalVerdict === 'PASS') {
    conclusion = `The shopping assistant's response is approved. Recommendations comply with stated shopper preferences and criteria.`;
  } else if (finalVerdict === 'FAIL') {
    conclusion = `The response requires revision. The assistant should re-evaluate product selection to eliminate conflicting or non-compliant recommendations before presenting options to the shopper.`;
  } else {
    conclusion = `The response is incomplete. The assistant should provide explicit confirmation for all shopper criteria with sufficient supporting details for relevant product attributes.`;
  }

  // 8. Assessment Scope & Limitations
  const assessmentLimitations = [
    'Scope of Review: Evaluation is grounded strictly on the provided customer prompt and assistant response text.',
    'External Verification: Independent catalog or external database verification was not performed; unverified factual claims are noted as unconfirmed rather than erroneous.',
    'Evidence Standard: Missing information is treated as unconfirmed requirement context, not as an affirmative product defect.',
    'Product Isolation: Findings and compliance statuses are strictly isolated per product without cross-contamination.',
  ];

  // 9. Plain-text compiled output (no Markdown syntax characters like # or **)
  const lines: string[] = [];
  lines.push('SHOPPING ASSISTANT RESPONSE EVALUATION — DETAILED AUDIT');
  lines.push(`Report ID: ${reportId}`);
  lines.push(`Date: ${formattedDate}`);
  lines.push(`Overall Assessment: ${finalVerdict} (Severity: ${summary.overallSeverity})`);
  lines.push('');
  lines.push('CUSTOMER REQUEST & ASSISTANT RECOMMENDATION CONTEXT');
  lines.push('Customer Prompt:');
  lines.push(inputs.userPrompt.trim());
  lines.push('Assistant Output:');
  lines.push(inputs.llmOutput.trim());
  lines.push('');
  lines.push('OVERALL ASSESSMENT');
  lines.push(executiveSummary);
  lines.push('');
  lines.push('KEY FINDINGS');
  for (const kf of keyFindings) {
    lines.push(`• ${kf}`);
  }
  lines.push('');
  lines.push('REQUIREMENT-BY-REQUIREMENT EVALUATION');
  for (const req of evaluatedRequirements) {
    lines.push(`• Requirement: "${req.sourceText}" (${req.productName}) — [${req.statusLabel.toUpperCase()}]`);
    lines.push(`  Details: ${req.evidenceOrDetails}`);
  }
  lines.push('');
  lines.push('PRODUCT-SPECIFIC ANALYSIS');
  for (const pa of productAnalyses) {
    lines.push(`${pa.productName} — Verdict: ${pa.verdict} (${pa.verdictLabel})`);
    lines.push(pa.narrative);
    // Corrective actions appear once in the consolidated section below.
    lines.push('');
  }
  if (cartVerificationNote) {
    lines.push('MULTI-PRODUCT & SHOPPING CART SCOPE');
    lines.push(cartVerificationNote);
    lines.push('');
  }
  lines.push('RECOMMENDED CORRECTIVE ACTIONS');
  const uniqueCorrectiveActions = Array.from(new Set(prioritizedCorrectiveActions));
  for (let i = 0; i < uniqueCorrectiveActions.length; i++) {
    lines.push(`${i + 1}. ${uniqueCorrectiveActions[i]}`);
  }
  lines.push('');
  lines.push('FINAL CONCLUSION');
  lines.push(conclusion);
  lines.push('');
  lines.push('ASSESSMENT SCOPE & LIMITATIONS');
  for (const al of assessmentLimitations) {
    lines.push(`• ${al}`);
  }

  const plainText = lines.join('\n');

  return {
    title: 'Shopping Assistant Response Evaluation — Detailed Audit',
    reportId,
    generatedDate: formattedDate,
    overallVerdict: finalVerdict,
    overallSeverity: summary.overallSeverity,
    customerPrompt: inputs.userPrompt,
    assistantOutput: inputs.llmOutput,
    executiveSummary,
    keyFindings,
    evaluatedRequirements,
    productAnalyses,
    cartVerificationNote,
    prioritizedCorrectiveActions,
    conclusion,
    assessmentLimitations,
    plainText,
  };
}
