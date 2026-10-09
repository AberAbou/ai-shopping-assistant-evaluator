import type { AtomicConstraint } from '../../types/evaluation';
import type { ReportExportDataParams } from './reportExportHelper';

export interface AssessmentFinding {
  requirement: AtomicConstraint;
  subject: string;
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  conflict: boolean;
  evidence: string[];
}

const labels: Record<string, string> = {
  price: 'Product price', budget: 'Budget', cart_total_price: 'Combined purchase budget',
  cart_items: 'Requested products', quantity: 'Requested quantity', water_resistance: 'Waterproof property',
  insulation: 'Insulation', weight: 'Weight', breathability: 'Breathability', use_case: 'Activity suitability',
  conversation_issue: 'Request clarification', skin_type: 'Skin suitability', season: 'Seasonal suitability',
};

function quote(value: string): string {
  // A supplied backtick sequence cannot escape its verbatim evidence block.
  const length = Math.max(2, ...[...value.matchAll(/`+/g)].map(m => m[0].length)) + 1;
  const fence = '`'.repeat(length);
  return `${fence}\n${value}\n${fence}`;
}

export function describeAssessmentRequirement(c: AtomicConstraint): string {
  const label = labels[c.attribute] ?? c.attribute.replace(/_/g, ' ');
  if (c.attribute === 'conversation_issue') return 'Clarify the current request and provide a complete recommendation.';
  if (c.attribute === 'cart_items') {
    try {
      const items = JSON.parse(String(c.expectedValue));
      if (Array.isArray(items)) return `Include ${items.map(item => `${item.quantity ?? 'an explicitly stated quantity of'} ${item.category}`).join(' and ')}.`;
    } catch { /* Describe only the source request when its structure is unavailable. */ }
    return 'Include all requested products.';
  }
  const operators: Record<string,string> = { '<':'strictly below', '<=':'at or below', '>':'strictly above', '>=':'at or above', equals:'equal to', not_equals:'different from', suitable_for:'suitable for', prohibited:'must exclude', required:'must provide', contains:'must contain' };
  const value = ['price','budget','cart_total_price'].includes(c.attribute) && typeof c.expectedValue === 'number' ? `$${c.expectedValue}` : String(c.expectedValue);
  return `${label}${c.targetProductCategory ? ` for ${c.targetProductCategory}` : ''}: ${c.polarity === 'negative' ? 'must exclude' : operators[c.operator] ?? 'must satisfy'} ${value}.`;
}

export function assessmentFindings(p: ReportExportDataParams): AssessmentFinding[] {
  const findings: AssessmentFinding[] = [];
  for (const c of p.promptAnalysis?.constraints ?? []) {
    // Upstream records already contain cart checks. Keep one record per subject
    // identity, preserving separate products even when their display names match.
    const seenSubjects = new Set<string>();
    const product = (p.verificationResult?.records ?? []).filter(v => {
      if (v.constraintId !== c.id || seenSubjects.has(v.productId)) return false;
      seenSubjects.add(v.productId);
      return true;
    });
    const cart = product.length ? [] : (p.finalEvaluationResult.cartEvaluation?.verifications ?? []).filter(v => v.constraintId === c.id).slice(0, 1);
    for (const v of product) findings.push({ requirement:c, subject:v.productName, status:v.status, conflict:!!v.conflictDetected, evidence:v.claimEvidence });
    for (const v of cart) findings.push({ requirement:c, subject:'Combined purchase', status:v.status,
      conflict:!['cart_items', 'quantity'].includes(c.attribute) && !!p.finalEvaluationResult.cartEvaluation?.totalDisagreement, evidence:v.claimEvidence });
    if (!product.length && !cart.length) findings.push({requirement:c, subject:'Recommendation', status:'UNKNOWN', conflict:false, evidence:[]});
  }
  return findings.sort((a,b) => Number(a.requirement.constraintType === 'soft') - Number(b.requirement.constraintType === 'soft'));
}

/** Stakeholder prose uses supplied evidence and recorded outcomes; no review is certified. */
export function buildQaAssessmentReport(params: ReportExportDataParams, conversationAssessments?: ReportExportDataParams[]): string {
  const assessments = params.inputs.conversation && conversationAssessments?.length ? conversationAssessments : [params];
  const latest = assessments.at(-1)!;
  const context = latest.inputs.conversation;
  const sections = assessments.map(p => ({ p, findings:assessmentFindings(p), turn:p.inputs.conversation?.evaluatedTurnId }));
  const title = context ? 'Conversation Shopping Recommendation Assessment' : 'Shopping Recommendation Assessment';
  const lines = ['# QA Assessment Report', '\n## Assessment Title', title, '\n## Scope & Objective',
    'Compare the supplied shopping request and recommendation against the stated mandatory requirements and optional preferences.',
    context ? `This report covers ${assessments.length} assessed response${assessments.length === 1 ? '' : 's'}. Each response is assessed as a complete purchase snapshot; earlier response evidence is not used to establish a later response’s compliance.` : 'This report covers the supplied request and its paired recommendation.',
    '\n## Scenario/Request Summary'];
  const heading = (turn?: string) => turn ? `\n### Turn ${turn}` : '\n### Supplied request';
  for (const {p,turn} of sections) {
    const original = p.inputs.conversation?.turns.find(t => t.id === turn)?.userPrompt ?? p.inputs.userPrompt;
    lines.push(heading(turn), 'Shopper request (verbatim):', quote(original));
  }
  if (context) {
    const assessed = new Set(sections.map(s => s.turn));
    for (const t of context.turns.filter(t => !assessed.has(t.id))) lines.push(`Turn ${t.id}: Not assessed in this report.`, 'Shopper request (verbatim):', quote(t.userPrompt), 'Recommendation (verbatim):',quote(t.llmOutput));
    lines.push('\n### Requirement revision audit trail');
    for (const change of context.changes) lines.push(`Turn ${change.turnId}: ${change.action}. Request excerpt (verbatim):`, quote(change.sourceText));
    if (!context.changes.length) lines.push('No requirement revisions are recorded.');
    for (const issue of context.unresolved) lines.push(`Turn ${issue.turnId}: Clarification remains required for this request or response excerpt.`, quote(issue.sourceText));
  }
  lines.push('\n## Acceptance Criteria');
  for (const {p,turn} of sections) {
    lines.push(heading(turn), 'Active requirements for this response:');
    for (const c of p.promptAnalysis?.constraints ?? []) lines.push(`- ${c.constraintType === 'hard' ? 'Mandatory' : 'Optional'}: ${describeAssessmentRequirement(c)}${c.sourceTurnId ? ` Origin: turn ${c.sourceTurnId}.` : ''}`, '  Shopper evidence (verbatim):', quote(c.sourceText));
    if (!p.promptAnalysis?.constraints.length) lines.push('No acceptance criteria are available; compliance cannot be established from this report.');
  }
  lines.push('\n## Observed Response');
  for (const {p,turn} of sections) lines.push(heading(turn), ...p.inputs.llmOutput ? ['Recommendation (verbatim):', quote(p.inputs.llmOutput)] : ['No response supplied.']);
  lines.push('\n## Assessment Method', 'Direct comparison against the stated shopper requirements. Mandatory requirements take priority over optional preferences. PASS indicates supporting response evidence; FAIL indicates a requirement violation; UNKNOWN indicates insufficient evidence. CONFLICT identifies incompatible statements and remains UNKNOWN. These outcomes do not certify independent product truth or reviewer approval.', '\n## Findings by Requirement');
  for (const {findings,turn,p} of sections) {
    lines.push(heading(turn));
    for (const [index,f] of findings.entries()) lines.push(`\n#### Requirement ${index+1}: ${f.subject}`, `Priority: ${f.requirement.constraintType === 'hard' ? 'Mandatory' : 'Optional'}.`, `Expected: ${describeAssessmentRequirement(f.requirement)}`, `Observed: ${f.conflict ? 'The supplied recommendation contains conflicting evidence.' : f.status === 'UNKNOWN' ? 'The available evidence does not establish compliance.' : f.status === 'FAIL' ? 'The supplied recommendation does not meet this requirement.' : 'The supplied recommendation supports this requirement.'}`, `Verdict: ${f.conflict ? 'CONFLICT (UNKNOWN)' : f.status}.`, 'Shopper evidence (verbatim):', quote(f.requirement.sourceText), 'Response evidence (verbatim):', ...f.evidence.map(quote), ...(!f.evidence.length ? ['No supporting response evidence is available.'] : []));
    const cart=p.finalEvaluationResult.cartEvaluation;
    if(cart) lines.push(`Purchase totals: calculated ${cart.calculatedCartTotal == null ? 'unresolved' : `$${cart.calculatedCartTotal}`}; stated ${cart.statedCartTotal == null ? 'not established' : `$${cart.statedCartTotal}`}.`, ...(cart.totalDisagreement ? ['CONFLICT: calculated and stated purchase totals disagree.'] : []));
  }
  lines.push('\n## Overall Outcome & Severity');
  for (const {p,turn} of sections) lines.push(`${turn ? `Turn ${turn}` : 'Supplied response'}: ${p.finalEvaluationResult.finalVerdict}; severity ${p.finalEvaluationResult.summary.overallSeverity}.`);
  lines.push(context ? `Latest assessed response (${context.evaluatedTurnId}): ${latest.finalEvaluationResult.finalVerdict}. Earlier outcomes remain part of this assessment; the latest outcome does not replace them.` : 'This outcome addresses the supplied response and awaits reviewer acceptance.');
  lines.push('\n## Deviations/Root Causes');
  const deviations=sections.flatMap(s=>s.findings.filter(f=>f.status!=='PASS').map(f=>({f,turn:s.turn})));
  for (const {f,turn} of deviations) lines.push(`- ${turn ? `Turn ${turn}; ` : ''}${f.subject}: ${f.conflict ? 'incompatible response statements prevent confirmation' : f.status==='FAIL' ? 'the recommendation violates the stated requirement' : 'the evidence needed to confirm the requirement is absent or unresolved'}. Expected: ${describeAssessmentRequirement(f.requirement)}`);
  if(!deviations.length) lines.push('No requirement deviations are recorded in the assessed responses.');
  lines.push('\n## Risk/Impact');
  if(deviations.some(d=>d.f.status==='FAIL'&&d.f.requirement.constraintType==='hard')) lines.push('A mandatory requirement is not met. Following the affected recommendation may result in an unsuitable purchase or spending outside the stated limits.');
  if(deviations.some(d=>d.f.status==='UNKNOWN'&&d.f.requirement.constraintType==='hard')) lines.push('Compliance with a mandatory requirement remains unconfirmed. Resolve the missing or conflicting evidence before accepting the affected recommendation.');
  if(deviations.some(d=>d.f.requirement.constraintType==='soft')) lines.push('Optional preferences are unmet or unconfirmed. This affects preference coverage and does not by itself establish a mandatory failure.');
  if(!deviations.length) lines.push('No requirement-level purchase risk is identified from the supplied comparison. Independent product facts remain unverified.');
  lines.push('\n## Corrective Recommendations');
  for(const {f,turn} of deviations) lines.push(`- ${f.requirement.constraintType==='hard' ? 'Mandatory priority' : 'Optional improvement'}${turn ? `; turn ${turn}` : ''}: ${f.conflict ? 'Resolve the conflicting statements and provide consistent evidence' : f.status==='FAIL' ? 'Revise the recommendation to meet the stated requirement' : 'Provide explicit evidence or clarify the request'} for ${f.subject}. ${describeAssessmentRequirement(f.requirement)}`);
  if(!deviations.length) lines.push('Retain the supporting evidence and submit this assessment for reviewer acceptance.');
  lines.push('\n## Limitations', 'This assessment is limited to the supplied shopping requests and recommendations. No independent catalog checks, physical tests, or human verification were performed. Missing information is not proof of a product defect. Reviewer edits and sign-off require the reviewer’s own judgment.', '\n## Reviewer Sign-off', 'Reviewer name: ____________________', 'Review date: ____________________', 'Review status: Awaiting review', 'Reviewer comments: ____________________');
  return lines.join('\n\n');
}
