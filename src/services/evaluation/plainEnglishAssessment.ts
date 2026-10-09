import type { ReportExportDataParams } from './reportExportHelper';
import { assessmentFindings, type AssessmentFinding } from './qaAssessmentReport';

const suppliedQuote = (text: string) => `“${text}”`;

/** Fresh prose from recorded findings, separate from the editable Markdown report. */
export function buildPlainEnglishAssessment(params: ReportExportDataParams, conversationAssessments?: ReportExportDataParams[]): string {
  const join = (items: string[]) => items.length < 3 ? items.join(' and ') : `${items.slice(0,-1).join(', ')}, and ${items.at(-1)}`;
  const topic = (f: AssessmentFinding) => ({price:'budget',budget:'budget',cart_total_price:'combined budget',cart_items:'purchase contents',quantity:'quantity',use_case:'activity suitability',season:'seasonal suitability',weight:'weight',breathability:'breathability',water_resistance:'waterproofing',insulation:'insulation'}[f.requirement.attribute] ?? f.requirement.attribute.replace(/_/g,' '));
  const money = (f: AssessmentFinding) => ['price','budget','cart_total_price'].includes(f.requirement.attribute);
  const assessments = params.inputs.conversation && conversationAssessments?.length ? conversationAssessments : [params];
  const context = assessments.at(-1)!.inputs.conversation;
  const paragraphs = ['This assessment compares the shopper’s request with the supplied recommendation. Mandatory requirements take priority over optional preferences.'];
  if (context) paragraphs.push('The responses are considered in chronological order. Each recommendation is assessed as a complete purchase, using its own evidence. A later satisfactory response does not erase an earlier problem.');
  const history = context?.turns ?? [{ id: '', userPrompt: params.inputs.userPrompt, llmOutput: params.inputs.llmOutput }];
  for (const [index, turn] of history.entries()) {
    const p = context ? assessments.find(a => a.inputs.conversation?.evaluatedTurnId === turn.id) : assessments[0];
    const subject = context ? `For turn ${index + 1}` : 'For this request';
    paragraphs.push(`${subject}, the shopper wrote ${suppliedQuote(turn.userPrompt)} ${turn.llmOutput ? `The recommendation was ${suppliedQuote(turn.llmOutput)}` : 'No recommendation was supplied.'}`);
    if (!p) { paragraphs.push('This response has not been assessed here, so no conclusion about its compliance is available.'); continue; }
    const changes=[...new Set(context?.changes.filter(c=>c.turnId===turn.id).map(c=>c.sourceText))];
    if(index>0) for (const source of changes) paragraphs.push(`The shopper’s requirement revision at this point was ${suppliedQuote(source)}. The requirements below reflect the request in effect for this response.`);
    for (const issue of context?.unresolved.filter(i => i.turnId === turn.id) ?? []) paragraphs.push(`Clarification remains necessary for ${suppliedQuote(issue.sourceText)}.`);
    const findings = assessmentFindings(p);
    if (!findings.length) paragraphs.push('No acceptance requirements are available, so compliance cannot be established from this assessment.');
    const request = (f: AssessmentFinding) => suppliedQuote(f.requirement.sourceText);
    // Preserve every requirement/evidence pairing; group presentation, not records.
    for (const priority of ['hard','soft']) for (const status of ['FAIL','UNKNOWN','PASS']) {
      const groups = new Map<string,AssessmentFinding[]>();
      for (const f of findings.filter(f=>f.requirement.constraintType===priority && (f.conflict ? 'UNKNOWN' : f.status)===status)) groups.set(f.subject,[...(groups.get(f.subject)??[]),f]);
      for (const [subject,group] of groups) {
        const kind = priority==='hard' ? 'mandatory requirements' : 'optional preferences';
        if (status==='FAIL') {
          const sentences=group.map(f=>{
            const evidence=join(f.evidence.map(suppliedQuote));
            if(!evidence) return `The ${topic(f)} requirement ${request(f)} is not met; no supporting response evidence is recorded.`;
            if(money(f)) return `The ${topic(f)} requirement ${request(f)} is not met, as shown by ${evidence}.`;
            if(f.requirement.polarity==='negative') return `The ${topic(f)} exclusion ${request(f)} is violated by ${evidence}.`;
            return `The ${topic(f)} requirement ${request(f)} is not met, given ${evidence}.`;
          });
          paragraphs.push(`For ${subject}, ${kind} are not met. ${sentences.join(' ')}`);
        } else if (status==='UNKNOWN') {
          const missing=group.filter(f=>!f.conflict&&!f.evidence.length);
          const partial=group.filter(f=>!f.conflict&&f.evidence.length);
          const conflicts=group.filter(f=>f.conflict);
          const sentences=[];
          if(missing.length) sentences.push(`No supporting response evidence establishes ${join(missing.map(request))}.`);
          for(const f of partial) sentences.push(`The available evidence for ${request(f)} is ${join(f.evidence.map(suppliedQuote))}; compliance remains unconfirmed.`);
          for(const f of conflicts) sentences.push(`The recommendation contains conflicting statements about ${request(f)}${f.evidence.length ? `: ${join(f.evidence.map(suppliedQuote))}` : '; no supporting response evidence is available'}.`);
          paragraphs.push(`For ${subject}, ${kind} remain unconfirmed. ${sentences.join(' ')} These are unresolved requirements, not confirmed failures.`);
        } else {
          paragraphs.push(`For ${subject}, the following ${kind} are supported by the response: ${group.map(f=>`${request(f)}${f.evidence.length ? `, supported by ${join(f.evidence.map(suppliedQuote))}` : ', with no supporting evidence excerpt recorded'}`).join('; ')}.`);
        }
      }
    }
    if(context) {
      const origins=new Map<number,Set<string>>();
      for(const c of p.promptAnalysis?.constraints??[]) {
        const origin=context.turns.findIndex(t=>t.id===c.sourceTurnId);
        if(origin>=0) {const sources=origins.get(origin)??new Set<string>();sources.add(c.sourceText);origins.set(origin,sources);}
      }
      const history=[...origins].sort((a,b)=>a[0]-b[0]).map(([origin,sources])=>`${join([...sources].map(suppliedQuote))} originated in turn ${origin+1}.`).join(' ');
      if(history) paragraphs.push(history);
    }
    const cart = p.finalEvaluationResult.cartEvaluation;
    if (cart) paragraphs.push(`The calculated purchase total is ${cart.calculatedCartTotal == null ? 'unresolved' : `$${cart.calculatedCartTotal}`}, and the stated total is ${cart.statedCartTotal == null ? 'not established' : `$${cart.statedCartTotal}`}.${cart.totalDisagreement ? ' These totals disagree and must be reconciled before the budget can be confirmed.' : ''}`);
    const result = p.finalEvaluationResult;
    const outcome = result.finalVerdict === 'PASS' ? 'meets the mandatory requirements on the supplied evidence' : result.finalVerdict === 'FAIL' ? 'fails the mandatory requirements' : 'cannot be confirmed as meeting the mandatory requirements';
    const severity=result.summary.overallSeverity.toLowerCase();
    const conclusion=[`Overall, ${context ? `turn ${index + 1}` : 'this response'} ${outcome}.`, severity==='none' ? 'No severity concern is recorded.' : `Severity is ${severity}.`, result.finalVerdict==='FAIL' ? 'The recommendation should not be accepted as proposed.' : result.finalVerdict==='PASS' ? 'Final acceptance remains with the reviewer.' : 'Resolve the outstanding evidence before acceptance.'];
    const deviations = findings.filter(f => f.status !== 'PASS' || f.conflict);
    if (deviations.some(f => f.requirement.constraintType === 'hard' && f.status === 'FAIL' && !f.conflict)) conclusion.push('Following it could lead to an unsuitable purchase or spending outside the stated limits.');
    if (deviations.some(f => f.requirement.constraintType === 'hard' && (f.status === 'UNKNOWN' || f.conflict))) conclusion.push('Missing or contradictory evidence leaves mandatory requirements unconfirmed; it is not proof of a product defect.');
    if (deviations.some(f => f.requirement.constraintType === 'soft')) conclusion.push('Unmet or unconfirmed optional preferences affect preference coverage and do not by themselves establish a mandatory failure.');
    paragraphs.push(conclusion.join(' '));
    const failed=deviations.filter(f=>f.requirement.constraintType==='hard'&&f.status==='FAIL'&&!f.conflict);
    const replacements=failed.filter(f=>!money(f)&&f.requirement.polarity!=='negative');
    const limits=failed.filter(f=>money(f)||f.requirement.polarity==='negative');
    const unconfirmed=deviations.filter(f=>f.requirement.constraintType==='hard'&&(f.status==='UNKNOWN'||f.conflict));
    const optional=deviations.filter(f=>f.requirement.constraintType==='soft');
    // At most three action paragraphs per response, with subjects retained for
    // multi-product cases and every affected requirement linked to its action.
    const targets=(items:AssessmentFinding[])=>{
      const subjects=[...new Set(findings.map(f=>f.subject))];
      if(subjects.length===1) return items.map(request);
      const grouped=new Map<string,AssessmentFinding[]>();
      for(const f of items) grouped.set(f.subject,[...(grouped.get(f.subject)??[]),f]);
      return [...grouped].map(([subject,group])=>`${join(group.map(request))} for ${subject}`);
    };
    if(replacements.length) paragraphs.push(`Replace the unsuitable recommendation with an option that satisfies ${join(targets(replacements))}.`);
    if(limits.length) paragraphs.push(`Revise the recommendation to respect the shopper’s ${limits.some(money) ? 'budget' : ''}${limits.some(money)&&limits.some(f=>f.requirement.polarity==='negative') ? ' and ' : ''}${limits.some(f=>f.requirement.polarity==='negative') ? 'exclusions' : ''}: ${join(targets(limits))}.`);
    const confirmations=[];
    if(unconfirmed.length) confirmations.push(`${unconfirmed.some(f=>f.conflict) ? 'Reconcile the conflicting statements and confirm' : 'Before acceptance, confirm'} ${join(targets(unconfirmed))} with explicit, consistent supporting evidence.`);
    if(optional.length) confirmations.push(`As an optional improvement, address ${join(targets(optional))}; state clearly where a preference remains unmet or unconfirmed.`);
    if(confirmations.length) paragraphs.push(confirmations.join(' '));
    if (!deviations.length) paragraphs.push('No requirement deviations are recorded for this response. Retain the supporting evidence for the reviewer’s acceptance decision.');
  }
  paragraphs.push('This assessment is limited to the supplied requests and recommendations. No independent catalog checks, physical tests, or human verification were performed. Product facts and final acceptance remain subject to the reviewer’s own judgment.');
  paragraphs.push('Reviewer name:                 Review date:                 Review decision: Awaiting review. Reviewer comments:                 ');
  return paragraphs.join('\n\n');
}
