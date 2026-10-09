import type { ReportExportDataParams } from './reportExportHelper';
import { assessmentFindings } from './qaAssessmentReport';

const suppliedQuote = (text: string) => `“${text}”`;

/** Fresh prose from recorded findings, separate from the editable Markdown report. */
export function buildPlainEnglishAssessment(params: ReportExportDataParams, conversationAssessments?: ReportExportDataParams[]): string {
  const assessments = params.inputs.conversation && conversationAssessments?.length ? conversationAssessments : [params];
  const context = assessments.at(-1)!.inputs.conversation;
  const paragraphs = ['This assessment compares the supplied shopping request and recommendation with the shopper’s mandatory requirements and optional preferences. Mandatory requirements take priority. It considers only the information supplied, without independent product checks or reviewer approval.'];
  if (context) paragraphs.push('The responses are considered in chronological order. Each recommendation is assessed as a complete purchase, using its own evidence. A later satisfactory response does not erase an earlier problem.');
  const history = context?.turns ?? [{ id: '', userPrompt: params.inputs.userPrompt, llmOutput: params.inputs.llmOutput }];
  for (const [index, turn] of history.entries()) {
    const p = context ? assessments.find(a => a.inputs.conversation?.evaluatedTurnId === turn.id) : assessments[0];
    const subject = context ? `For turn ${index + 1}` : 'For this request';
    paragraphs.push(`${subject}, the shopper wrote ${suppliedQuote(turn.userPrompt)} ${turn.llmOutput ? `The recommendation was ${suppliedQuote(turn.llmOutput)}` : 'No recommendation was supplied.'}`);
    if (!p) { paragraphs.push('This response has not been assessed here, so no conclusion about its compliance is available.'); continue; }
    for (const change of context?.changes.filter(c => c.turnId === turn.id) ?? []) paragraphs.push(`The shopper’s requirement revision at this point was ${suppliedQuote(change.sourceText)}. The requirements below reflect the request in effect for this response.`);
    for (const issue of context?.unresolved.filter(i => i.turnId === turn.id) ?? []) paragraphs.push(`Clarification remains necessary for ${suppliedQuote(issue.sourceText)}.`);
    const findings = assessmentFindings(p);
    if (!findings.length) paragraphs.push('No acceptance requirements are available, so compliance cannot be established from this assessment.');
    for (const f of findings) {
      const priority = f.requirement.constraintType === 'hard' ? 'mandatory requirement' : 'optional preference';
      const request = suppliedQuote(f.requirement.sourceText);
      const conclusion = f.conflict
        ? `For ${f.subject}, the recommendation contains conflicting statements, leaving the shopper’s ${priority} ${request} unconfirmed.`
        : f.status === 'PASS'
          ? `The recommendation supports the shopper’s ${priority} ${request} for ${f.subject}.`
          : f.status === 'FAIL'
            ? `${f.subject} does not meet the shopper’s ${priority} ${request}.`
            : `For ${f.subject}, the recommendation does not provide enough evidence to confirm the shopper’s ${priority} ${request}.`;
      const origin = context?.turns.findIndex(t => t.id === f.requirement.sourceTurnId) ?? -1;
      paragraphs.push(`${conclusion}${f.evidence.length ? ` The response states ${f.evidence.map(suppliedQuote).join(' and ')}.` : ' No supporting response evidence is available.'}${origin >= 0 ? ` This requirement originated in turn ${origin + 1}.` : ''}`);
    }
    const cart = p.finalEvaluationResult.cartEvaluation;
    if (cart) paragraphs.push(`The calculated purchase total is ${cart.calculatedCartTotal == null ? 'unresolved' : `$${cart.calculatedCartTotal}`}, and the stated total is ${cart.statedCartTotal == null ? 'not established' : `$${cart.statedCartTotal}`}.${cart.totalDisagreement ? ' These totals disagree and must be reconciled before the budget can be confirmed.' : ''}`);
    const result = p.finalEvaluationResult;
    const outcome = result.finalVerdict === 'PASS' ? 'meets the mandatory requirements on the supplied evidence' : result.finalVerdict === 'FAIL' ? 'fails the mandatory requirements' : 'cannot be confirmed as meeting the mandatory requirements';
    const severity=result.summary.overallSeverity.toLowerCase();
    paragraphs.push(`The overall conclusion for ${context ? `turn ${index + 1}` : 'this response'} is that the recommendation ${outcome}. ${severity==='none' ? 'No severity concern is recorded.' : `The concern is rated ${severity} in severity.`}`);
    const deviations = findings.filter(f => f.status !== 'PASS' || f.conflict);
    if (deviations.some(f => f.requirement.constraintType === 'hard' && f.status === 'FAIL' && !f.conflict)) paragraphs.push('Following the affected recommendation could lead to an unsuitable purchase or spending outside the stated limits. Correct the unmet mandatory requirements before accepting it.');
    if (deviations.some(f => f.requirement.constraintType === 'hard' && (f.status === 'UNKNOWN' || f.conflict))) paragraphs.push('A mandatory requirement remains unconfirmed. Missing or contradictory evidence is not proof of a product defect, but it prevents a reliable acceptance decision.');
    if (deviations.some(f => f.requirement.constraintType === 'soft')) paragraphs.push('Some optional preferences are unmet or unconfirmed. They affect how closely the recommendation matches the shopper’s preferences and do not by themselves establish a mandatory failure.');
    for (const f of deviations) paragraphs.push(`${f.requirement.constraintType === 'hard' ? 'As a priority' : 'As an optional improvement'}, ${f.conflict ? 'reconcile the conflicting statements and provide consistent evidence' : f.status === 'FAIL' ? 'revise the recommendation' : 'provide explicit evidence or clarify the request'} for ${f.subject} to address the shopper’s request ${suppliedQuote(f.requirement.sourceText)}.`);
    if (!deviations.length) paragraphs.push('No requirement deviations are recorded for this response. Retain the supporting evidence for the reviewer’s acceptance decision.');
  }
  paragraphs.push('This assessment is limited to the supplied requests and recommendations. No independent catalog checks, physical tests, or human verification were performed. Product facts and final acceptance remain subject to the reviewer’s own judgment.');
  paragraphs.push('Reviewer name:                 Review date:                 Review decision: Awaiting review. Reviewer comments:                 ');
  return paragraphs.join('\n\n');
}
