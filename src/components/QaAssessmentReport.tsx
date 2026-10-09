import { useEffect, useState } from 'react';
import type { ReportExportDataParams } from '../services/evaluation/reportExportHelper';
import { buildQaAssessmentReport } from '../services/evaluation/qaAssessmentReport';

export function QaAssessmentReport({params, conversationAssessments, stale=false}: {params:ReportExportDataParams; conversationAssessments?:ReportExportDataParams[]; stale?:boolean}) {
  const [draft,setDraft]=useState<{key:string;text:string}|null>(null);
  const [notice,setNotice]=useState('');
  const sourceKey=JSON.stringify([params.inputs,params.finalEvaluationResult.evaluatedAt,conversationAssessments?.map(p=>[p.inputs,p.finalEvaluationResult.evaluatedAt])]);
  useEffect(()=>{setDraft(null);setNotice('');},[sourceKey,stale]);
  const visible=!stale&&draft?.key===sourceKey;
  const copy=async()=>{
    if(!visible||!draft) return;
    try { await navigator.clipboard.writeText(draft.text);setNotice('Assessment copied.'); }
    catch { setNotice('Copy is unavailable. Select the report text or download it.'); }
  };
  const download=()=>{
    if(!visible||!draft) return;
    const url=URL.createObjectURL(new Blob([draft.text],{type:'text/markdown;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='qa-assessment-report.md';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section aria-label="QA Assessment Report" className="no-print rounded-xl border border-red-900/60 p-4 space-y-3">
    <button type="button" disabled={stale} aria-expanded={visible} aria-controls="qa-assessment-editor" onClick={()=>{setDraft({key:sourceKey,text:buildQaAssessmentReport(params,conversationAssessments)});setNotice('');}} className="bg-red-700 hover:bg-red-600 text-white font-semibold px-4 py-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:opacity-50 disabled:cursor-not-allowed">Generate QA Assessment Report</button>
    <p className="text-sm text-slate-400">{stale ? 'Inputs changed. Run evaluation again before generating a new assessment.' : 'Prepare an editable stakeholder assessment with evidence and reviewer sign-off fields.'}</p>
    {visible&&draft&&<div id="qa-assessment-editor" className="space-y-3">
      <h2 className="text-lg font-semibold">QA Assessment Report</h2>
      <label className="block">Assessment report text<textarea aria-label="QA assessment report text" value={draft.text} onChange={e=>setDraft({key:sourceKey,text:e.target.value})} className="mt-2 block w-full min-h-[32rem] rounded-lg bg-slate-900 p-4 text-sm leading-relaxed" /></label>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={copy} className="bg-slate-800 px-3 py-2 rounded-lg">Copy QA Assessment</button>
        <button type="button" onClick={download} className="bg-slate-800 px-3 py-2 rounded-lg">Download QA Assessment</button>
        <button type="button" onClick={()=>setDraft(null)} className="px-3 py-2 rounded-lg">Close QA Assessment</button>
      </div>
      <p role="status">{notice}</p>
    </div>}
  </section>;
}
