import { useRef, useState } from 'react';
import type { ConversationTurn } from '../types/evaluation';
import { evaluateConversation, MAX_CONVERSATION_TURNS, type ConversationEvaluation } from '../services/evaluation/conversationEvaluation';
import { ResultsDashboard } from './ResultsDashboard';

export function ConversationWorkspace() {
  const nextId=useRef(2);
  const [turns,setTurns]=useState<ConversationTurn[]>([{id:'T1',userPrompt:'',llmOutput:''}]);
  const [results,setResults]=useState<ConversationEvaluation[]>([]);
  const [selected,setSelected]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const change=(updated:ConversationTurn[])=>{setTurns(updated);setResults([]);setError('');};
  const run=async()=>{
    setBusy(true);setResults([]);setError('');
    try { const evaluated=await evaluateConversation(turns);setResults(evaluated);setSelected(evaluated.length-1); }
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const active=results[selected];
  return <section className="space-y-5">
    <h1 className="text-xl font-semibold">Conversation evaluation</h1>
    <p>User requirements carry forward until explicitly revised. Each assistant response must provide a complete cart snapshot. Missing evidence and ambiguous revisions remain UNKNOWN. This mode runs offline.</p>
    {turns.map((turn,index)=><fieldset key={turn.id} disabled={busy} className="border border-slate-700 rounded-lg p-4 space-y-3">
      <legend>Turn {index+1} ({turn.id})</legend>
      <label className="block">User turn {index+1}<textarea aria-label={`User turn ${index+1}`} maxLength={20000} value={turn.userPrompt} onChange={e=>change(turns.map(t=>t.id===turn.id?{...t,userPrompt:e.target.value}:t))} className="block w-full bg-slate-900 p-3 rounded min-h-24" /></label>
      <label className="block">Assistant turn {index+1}<textarea aria-label={`Assistant turn ${index+1}`} maxLength={50000} value={turn.llmOutput} onChange={e=>change(turns.map(t=>t.id===turn.id?{...t,llmOutput:e.target.value}:t))} className="block w-full bg-slate-900 p-3 rounded min-h-24" /></label>
      <button type="button" disabled={turns.length===1} onClick={()=>change(turns.filter(t=>t.id!==turn.id))}>Remove turn {index+1}</button>
    </fieldset>)}
    <div className="flex gap-5">
      <button type="button" disabled={busy||turns.length>=MAX_CONVERSATION_TURNS} onClick={()=>change([...turns,{id:`T${nextId.current++}`,userPrompt:'',llmOutput:''}])}>Add turn</button>
      <button type="button" disabled={busy} onClick={()=>{nextId.current=2;change([{id:'T1',userPrompt:'',llmOutput:''}]);}}>Clear conversation</button>
      <button type="button" disabled={busy} onClick={run} className="bg-emerald-700 px-4 py-2 rounded">{busy?'Evaluating conversation…':'Evaluate conversation'}</button>
    </div>
    {error&&<p role="alert">{error}</p>}
    {active&&<>
      <label>Evaluated turn <select aria-label="Evaluated turn" value={selected} onChange={e=>setSelected(Number(e.target.value))} className="bg-slate-900 p-2">{results.map((r,i)=><option key={i} value={i}>{r.inputs.conversation.evaluatedTurnId}: {r.finalEvaluationResult.finalVerdict}</option>)}</select></label>
      <p data-testid="conversation-verdict">Turn {active.inputs.conversation.evaluatedTurnId}: {active.finalEvaluationResult.finalVerdict}</p>
      <details><summary>Active requirements and turn provenance</summary><ul>{active.promptAnalysis?.constraints.map(c=><li key={c.id}>{c.id} ({c.sourceTurnId}): {c.constraintType} {c.attribute} — {c.sourceText}</li>)}</ul></details>
      {active.inputs.conversation.unresolved.map((i,index)=><p key={index}>Clarification needed ({i.turnId}): {i.reason}</p>)}
      <ResultsDashboard {...active} isInputsModified={false} />
    </>}
  </section>;
}
