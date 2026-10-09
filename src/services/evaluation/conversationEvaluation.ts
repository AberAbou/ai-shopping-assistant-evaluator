import type { AtomicConstraint, ConversationChange, ConversationContext, ConversationTurn, UserPromptAnalysisResult } from '../../types/evaluation';
import type { ReportExportDataParams } from './reportExportHelper';
import { analyzeUserPromptDeterministically as analyzePrompt } from './fallbackPromptAnalyzer';
import { analyzeLlmOutputDeterministically as analyzeClaims } from './fallbackClaimAnalyzer';
import { cartRequest, categoryPatterns, parseQuantity, productCategory, type RequestedCartItem } from './shoppingCartSemantics';
import { runConstraintVerification } from './verificationService';
import { runRubricEvaluation } from './rubricService';
import { runClaimSupportAnalysis } from './claimSupportService';
import { runRootCauseAnalysis } from './rootCauseService';
import { runSeverityAndScoringAnalysis } from './severityScoringService';
import { runRecommendationAnalysis } from './recommendationService';
import { runFinalEvaluationAnalysis } from './finalVerdictService';

export const MAX_CONVERSATION_TURNS = 20;
type Item = RequestedCartItem & { sourceTurnId: string };
type Issue = ConversationContext['unresolved'][number];
interface State {
  items: Item[]; requirements: AtomicConstraint[]; cart: boolean;
  changes: ConversationChange[]; unresolved: Issue[];
  cartOrigin?: {turnId:string;sourceText:string};
  suspended?: { items: Item[]; requirements: AtomicConstraint[]; issueTurnId: string };
}
export interface ConversationEvaluation extends ReportExportDataParams { inputs: { userPrompt: string; llmOutput: string; conversation: ConversationContext } }
const budgetAttributes=['price','cart_total_price'];
const key = (c: AtomicConstraint) => `${c.attribute}:${c.targetProductCategory ?? '*'}:${c.polarity}:${budgetAttributes.includes(c.attribute)?(['>','>='].includes(c.operator)?'lower':c.operator==='equals'?'exact':'upper'):''}`;

function requirementClause(text: string, source: string): string {
  const index=text.indexOf(source);
  if(index<0) return source;
  const before=text.slice(0,index);
  const boundaries=[...before.matchAll(/[;\n]|\.(?=\s|$)/g)];
  const start=boundaries.length?boundaries[boundaries.length-1].index!+1:0;
  const after=text.slice(index+source.length);
  const end=after.search(/[;\n]|\.(?=\s|$)/);
  return text.slice(start,index+source.length+(end<0?after.length:end));
}

/** Option labels are local to the paired assistant snapshot, never durable cart
 * requirements. Earlier-response references need clarification rather than
 * binding an old label to a newly presented candidate. */
function currentOptionChoice(text: string): { label: string | null; issue: string | null } {
  const choices=[...text.matchAll(/\bchoose\s+option\s+([a-z0-9]+)\b/gi)];
  if(!choices.length) return {label:null,issue:null};
  if(/\b(?:previous|earlier|prior|last|T\d+|turn\s+\d+|response\s+\d+)\b|\bfrom\s+(?:the\s+)?(?:turn|response)\b/i.test(text)) {
    return {label:null,issue:'An earlier-response option reference cannot select a label in the current snapshot; clarify the current response choice.'};
  }
  if(choices.length!==1) return {label:null,issue:'Competing option choices require one explicit current-response selection.'};
  return {label:choices[0][1].toLowerCase(),issue:null};
}

function revise(state: State, turn: ConversationTurn, first: boolean): UserPromptAnalysisResult {
  const text = turn.userPrompt;
  const replacement = text.match(/\breplace\s+([^.;\n]+?)\s+with\s+(.+?)(?:[.;]|$)/i);
  const previousItems=state.items;
  const wasCart=state.cart;
  // Extract requirements from the replacement, not the old item's description.
  const replacementPrefix = replacement?.[0].match(/^replace\s+.+?\s+with\s+/i)?.[0];
  const analysisText = replacementPrefix ? text.slice(0,replacement!.index) + text.slice(replacement!.index! + replacementPrefix.length) : text;
  const analysis = analyzePrompt(analysisText);
  const request = cartRequest(text);
  const record = (action: string) => {
    if(!state.changes.some(c=>c.turnId===turn.id&&c.action===action&&c.sourceText===text)) state.changes.push({ turnId: turn.id, action, sourceText: text });
    if(['item addition','quantity revision','replacement','removal'].includes(action)) state.cartOrigin={turnId:turn.id,sourceText:text};
  };
  const issue = (reason: string) => { state.unresolved.push({turnId:turn.id,sourceText:text,reason}); record('unresolved'); };
  const overrides=[...text.matchAll(/\b(?:change|set|update|increase|decrease)\s+(.+?)\s+to\s+(-?\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi)].map(m=>{
    const categories=categoryPatterns.filter(c=>c.pattern.test(m[1]));
    const range=text.slice(m.index!+m[0].length).match(/^\s*(?:[-–]|to\b|or\b)\s*(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
    const quantity=range?null:parseQuantity(m[2]);
    return {category:categories.length===1?categories[0].category:null,quantity,sourceText:m[0]+(range?.[0]??''),hasInvalidQuantity:quantity===null};
  });
  for(const item of overrides) if(item.category) {
    const index=request.items.findIndex(i=>i.category===item.category);
    if(index<0) request.items.push({...item,category:item.category});
    else request.items[index]={...item,category:item.category};
  }
  const confirmationOnly=/^(?:please\s+)?(?:confirm|restate|summari[sz]e|show)\s+(?:(?:the|my|our)\s+)?(?:(?:final|current|same)\s+)?(?:shopping\s+)?cart(?:\s*[,;:]?\s*(?:and\s+)?(?:quantities|(?:individual|unit)\s+prices|prices|(?:grand\s+)?total))*[.!?\s]*$/i.test(text);
  const retentionPattern=/^(?:please\s+)?keep\s+(?:the\s+)?same\s+(?:products?|items?|cart|quantities)(?:\s+and\s+(?:products?|items?|quantities))*[.!\s]*$/i;
  const retentionOnly=retentionPattern.test(text);
  const clarification = /\b(?:I mean|I meant|to clarify)\b/i.test(text);
  const withdrawal=text.match(/\b(?:allow|no longer require|remove requirement for)\s+(leather|fragrance|waterproof|breathable|running|hiking)\b/i);
  const operation=/\b(?:replace\s+.+\s+with|remove|drop|no longer need|add)\b/i.test(text);
  const recognized = request.items.some(i=>i.quantity!==null||i.hasInvalidQuantity) || analysis.constraints.length > 0 || Boolean(withdrawal) || operation || confirmationOnly || retentionOnly || overrides.length>0;
  if (clarification && recognized && state.suspended) {
    state.items = state.suspended.items;
    state.requirements = state.suspended.requirements;
    state.unresolved = state.unresolved.filter(i => i.turnId !== state.suspended!.issueTurnId);
    state.suspended = undefined;
    record('clarification');
  }
  // A referential update without a named target is not a deterministic revision.
  const ambiguous = !first && ((/\b(?:it|them|that|those)\b/i.test(text) && !request.items.length && !/\b(?:all items|both products|total|cart|budget)\b/i.test(text)) || overrides.some(i=>!i.category||!state.items.some(old=>old.category===i.category)));
  const unsupported = !first && !recognized && !/^(?:yes|okay|ok|thanks|thank you|continue)[.!\s]*$/i.test(text) && !/\bchoose\s+option\s+[a-z0-9]+\b/i.test(text);
  if (ambiguous || unsupported) {
    if (!state.suspended) state.suspended = {items:state.items.map(i=>({...i})),requirements:state.requirements.map(c=>({...c})),issueTurnId:turn.id};
    state.items = state.items.map(i=>({...i,quantity:null,hasInvalidQuantity:true}));
    issue('The update has no unambiguous supported target; pending quantities require clarification and earlier mandatory requirements remain in force.');
  } else {
    if(withdrawal) {
      const allow=/^allow/i.test(withdrawal[0]);
      const target=productCategory(text);
      state.requirements=state.requirements.flatMap(c=>{
        const matches=String(c.expectedValue).toLowerCase().includes(withdrawal[1].toLowerCase()) && (!allow || c.polarity==='negative');
        if(!matches || (target && c.targetProductCategory && c.targetProductCategory!==target)) return [c];
        if(target && !c.targetProductCategory) return state.items.filter(i=>i.category!==target).map(i=>({...c,targetProductCategory:i.category}));
        return [];
      });
      record('requirement withdrawal');
    }
    if (currentOptionChoice(text).label) record('select option');
    const removal = text.match(/\b(?:remove|drop|no longer need)\s+(.+?)(?:[.;]|$)/i);
    const targetText=replacement?.[1] ?? removal?.[1] ?? '';
    const targetCategory=productCategory(targetText);
    const targetCount=cartRequest(targetText).items.find(i=>i.category===targetCategory)?.quantity;
    const previousCount=state.items.find(i=>i.category===targetCategory)?.quantity;
    const partialTarget=/\b(?:one of|some of|red|blue|green|black|white)\b/i.test(targetText) || (targetCount!=null && previousCount!=null && targetCount!==previousCount);
    const multipleTargets=categoryPatterns.filter(c=>c.pattern.test(targetText)).length>1;
    const removeCategory=partialTarget || multipleTargets ? null : targetCategory;
    if ((replacement || removal) && (!removeCategory || !state.items.some(i=>i.category===removeCategory))) {
      if(!state.suspended) state.suspended={items:state.items.map(i=>({...i})),requirements:state.requirements.map(c=>({...c})),issueTurnId:turn.id};
      issue('Removal/replacement target is ambiguous or not an active category; clarify the entire category to change.');
    }
    if (removeCategory) {
      state.items = state.items.filter(i=>i.category!==removeCategory);
      if(!replacement || productCategory(replacement[2])!==removeCategory) state.requirements = state.requirements.filter(c=>c.targetProductCategory!==removeCategory);
      record(replacement?'replacement':'removal');
    }
    const incoming = replacement ? (removeCategory ? cartRequest(replacement[2]).items : []) : request.items.filter(i=>i.category!==targetCategory);
    for (const item of incoming) {
      const old = state.items.find(i=>i.category===item.category);
      // Detect conflicting explicit counts within this turn, rather than taking
      // the first occurrence returned by the legacy single-prompt extractor.
      const pattern = categoryPatterns.find(p=>p.category===item.category)!.pattern;
      const counts = [...text.matchAll(new RegExp(pattern.source,'gi'))].flatMap(m=> {
        const prefix=text.slice(Math.max(0,m.index!-55),m.index);
        const q=prefix.match(/(-?\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\s+(?:pair\s+of\s+)?(?:[a-z-]+\s+){0,2}$/i);
        return q ? [parseQuantity(q[1]) ?? q[1].toLowerCase()] : [];
      });
      counts.push(...overrides.filter(i=>i.category===item.category).map(i=>i.quantity??'invalid'));
      const conflicting = new Set(counts).size > 1;
      if (conflicting) issue(`Conflicting requested quantities for ${item.category}.`);
      else if(item.quantity!==null) state.unresolved=state.unresolved.filter(i=>i.reason!==`Conflicting requested quantities for ${item.category}.`);
      if (!old || item.quantity!==null || item.hasInvalidQuantity || conflicting) {
        const updated:Item={...item,sourceTurnId:turn.id,...(conflicting?{quantity:null,hasInvalidQuantity:true}:{})};
        state.items=state.items.filter(i=>i.category!==item.category).concat(updated);
        record(old?'quantity revision':'item addition');
      }
    }
    state.cart ||= request.isCart || state.items.length > 1;
    if(!wasCart && state.cart && previousItems.length===1) {
      state.requirements=state.requirements.map(c=>{
        const original=state.changes.find(change=>change.turnId===c.sourceTurnId)?.sourceText ?? '';
        return c.scope!=='cart' && !c.targetProductCategory && !/\b(?:all items|both products)\b/i.test(original)
          ? {...c,targetProductCategory:previousItems[0].category}:c;
      });
    }
    for (const raw of analysis.constraints.filter(c=>!['quantity','cart_items'].includes(c.attribute))) {
      const c:AtomicConstraint={...raw,sourceTurnId:turn.id};
      const local=requirementClause(text,c.sourceText);
      // Category descriptors in a count update or retention/confirmation clause
      // refer to existing products; they do not revise their suitability.
      const referenceClause=local.trim().replace(/[.!]$/,'');
      if(confirmationOnly || retentionOnly || retentionPattern.test(referenceClause)
        || (!first&&state.requirements.some(old=>budgetAttributes.includes(old.attribute))&&budgetAttributes.includes(c.attribute)&&/\b(?:keep|retain|leave)\b/i.test(local)&&/\b(?:original|same|unchanged)\b/i.test(local)&&!/[\d$€£]|\b(?:under|over|below|above|at most|at least)\b/i.test(local))
        || (c.attribute==='use_case'&&overrides.some(i=>i.sourceText.toLowerCase()===referenceClause.toLowerCase()))) continue;
      if(withdrawal && String(c.expectedValue).toLowerCase().includes(withdrawal[1].toLowerCase())) continue;
      if (!first && budgetAttributes.includes(c.attribute) && !c.targetProductCategory && /\b(?:total|cart|overall|combined|budget)\b/i.test(local) && !/\b(?:each|per item|per product)\b/i.test(local) && state.cart) {
        c.attribute='cart_total_price';c.scope='cart';c.targetProductCategory=null;
      } else if (!first && c.scope!=='cart' && !/\b(?:all items|both products)\b/i.test(local)) {
        c.targetProductCategory ??= productCategory(replacement?.[2] ?? local);
      }
      if (removeCategory && !replacement && removal![0].includes(c.sourceText)) continue;
      const matches = state.requirements.filter(old=>key(old)===key(c));
      // A new optional preference never silently withdraws a mandatory limit.
      // An explicit "replace"/"instead" may deliberately change its strength.
      const explicitReplacement=/\b(?:instead|replace|no longer mandatory)\b/i.test(text);
      if(replacement && removeCategory && c.targetProductCategory && c.attribute!=='price' && c.scope!=='cart') {
        // Explicit replacement requirements supersede the same property, including
        // opposite polarity; retain global requirements for the other products.
        state.requirements=state.requirements.flatMap(old=>{
          if(old.sourceTurnId===turn.id || old.attribute!==c.attribute || (old.targetProductCategory && old.targetProductCategory!==c.targetProductCategory)) return [old];
          if(!old.targetProductCategory && state.items.some(i=>i.category!==c.targetProductCategory)) return state.items.filter(i=>i.category!==c.targetProductCategory).map(i=>({...old,targetProductCategory:i.category}));
          return [];
        });
      }
      state.requirements=state.requirements.filter(old=>old.sourceTurnId===turn.id || key(old)!==key(c) || (!explicitReplacement && old.constraintType!==c.constraintType));
      state.requirements.push(c);
      record(matches.length?'requirement revision':'requirement addition');
    }
  }
  const userText = text;
  if(state.items.length) state.unresolved=state.unresolved.filter(i=>!i.reason.startsWith('The cart has no active items;'));
  const active=state.requirements.map(c=>({...c}));
  if(state.cart){
    if(!state.items.length) issue('The cart has no active items; provide a new shopping request before evaluating a response.');
    active.push({id:'',attribute:'cart_items',operator:'required',expectedValue:JSON.stringify(state.items),scope:'cart',constraintType:'hard',polarity:'positive',sourceText:state.cartOrigin?.sourceText??userText,sourceTurnId:state.cartOrigin?.turnId??turn.id,confidence:1});
    for(const item of state.items) if(item.quantity!==null) active.push({id:'',attribute:'quantity',operator:'equals',expectedValue:item.quantity,scope:'cart',targetProductCategory:item.category,constraintType:'hard',polarity:'positive',sourceText:item.sourceText,sourceTurnId:item.sourceTurnId,confidence:1});
  }
  for(const pending of state.unresolved) active.push({id:'',attribute:'conversation_issue',operator:'required',expectedValue:'clarification',scope:'product',constraintType:'hard',polarity:'positive',sourceText:pending.sourceText,sourceTurnId:pending.turnId,reasoning:pending.reason,confidence:1});
  const constraints=active.map((c,i)=>({...c,id:`C${i+1}`}));
  const budget=state.requirements.filter(c=>state.cart?c.attribute==='cart_total_price':c.attribute==='price');
  const authoritative=budget.filter(c=>c.constraintType==='hard');
  const limits=authoritative.length?authoritative:budget;
  const upper=limits.filter(c=>['<','<=','equals'].includes(c.operator)&&typeof c.expectedValue==='number').sort((a,b)=>Number(a.expectedValue)-Number(b.expectedValue))[0];
  const lower=limits.filter(c=>['>','>=','equals'].includes(c.operator)&&typeof c.expectedValue==='number').sort((a,b)=>Number(b.expectedValue)-Number(a.expectedValue))[0];
  const intent=first?analysis.intent:{...analysis.intent,
    targetCategory:state.items.map(i=>i.category).join(', ') || null,
    quantity:state.items.length===1?state.items[0].quantity:null,
    useCaseOrActivity:String([...state.requirements].reverse().find(c=>c.attribute==='use_case')?.expectedValue ?? '') || null,
    desiredAttributes:state.requirements.filter(c=>c.polarity==='positive'&&!budgetAttributes.includes(c.attribute)).map(c=>String(c.expectedValue)),
    explicitExclusions:state.requirements.filter(c=>c.polarity==='negative').map(c=>String(c.expectedValue)),
    budget:limits.length?{maxAmount:typeof upper?.expectedValue==='number'?upper.expectedValue:null,minAmount:typeof lower?.expectedValue==='number'?lower.expectedValue:null,currency:limits.every(c=>typeof c.expectedValue==='number')?'USD':'Unknown',sourceText:limits.map(c=>c.sourceText).join('; ')}:null,
    evidenceMap:Object.fromEntries(state.requirements.map(c=>[`${c.attribute}:${c.targetProductCategory??'*'}:${c.constraintType}`,`${c.sourceTurnId}: ${c.sourceText}`])),
  };
  return {...analysis,intent,constraints,summary:{...analysis.summary,extractedCategories:state.items.map(i=>i.category),totalConstraints:constraints.length,hardCount:constraints.filter(c=>c.constraintType==='hard').length,softCount:constraints.filter(c=>c.constraintType==='soft').length,negativeCount:constraints.filter(c=>c.polarity==='negative').length},rawJson:{...analysis.rawJson,intent,constraints}};
}

export async function evaluateConversation(turns: ConversationTurn[]): Promise<ConversationEvaluation[]> {
  if(!turns.length || turns.length>MAX_CONVERSATION_TURNS || new Set(turns.map(t=>t.id)).size!==turns.length || turns.some(t=>!t.id.trim() || !t.userPrompt.trim() || t.userPrompt.length>20000 || t.llmOutput.length>50000)) throw new Error('Provide 1–20 uniquely identified turns with a user request; limits are 20,000 user and 50,000 assistant characters per turn.');
  const state:State={items:[],requirements:[],cart:false,changes:[],unresolved:[]};
  const results:ConversationEvaluation[]=[];
  for(let index=0;index<turns.length;index++){
    const turn=turns[index];
    const choice=currentOptionChoice(turn.userPrompt);
    const promptAnalysis=revise(state,turn,index===0);
    let snapshot=turn.llmOutput;
    const options=[...snapshot.matchAll(/\boption\s+([a-z0-9]+)\s*:/gi)];
    let snapshotIssue:string|null=choice.issue;
    if(choice.issue) snapshot='';
    else if(state.cart && (options.length>1 || (choice.label && options.length>0))){
      const uniqueLabels=new Set(options.map(m=>m[1].toLowerCase())).size===options.length;
      const selected=choice.label && uniqueLabels?options.findIndex(m=>m[1].toLowerCase()===choice.label):-1;
      if(selected>=0) snapshot=snapshot.slice(options[selected].index!+options[selected][0].length,options[selected+1]?.index ?? snapshot.length);
      else {snapshot='';snapshotIssue='Multiple candidate carts are present without an explicit matching option selection.';}
    } else if(state.cart && /\b(?:options|alternatives|either|or instead)\b/i.test(snapshot)) {snapshot='';snapshotIssue='Alternative recommendations do not establish one complete combined cart.';}
    if(!turn.llmOutput.trim()) snapshotIssue='The current assistant snapshot is missing; earlier recommendations are not reused.';
    if(snapshotIssue) {
      const c:AtomicConstraint={id:`C${promptAnalysis.constraints.length+1}`,attribute:'conversation_issue',operator:'required',expectedValue:'clarification',constraintType:'hard',polarity:'positive',sourceText:turn.llmOutput,sourceTurnId:turn.id,reasoning:snapshotIssue,confidence:1};
      promptAnalysis.constraints.push(c);promptAnalysis.summary.totalConstraints++;promptAnalysis.summary.hardCount++;
    }
    const claimAnalysis=analyzeClaims(snapshot);
    if(!snapshot.trim()){claimAnalysis.products=[];claimAnalysis.claims=[];claimAnalysis.summary={totalProducts:0,totalClaims:0,factualCount:0,subjectiveCount:0,claimsPerProduct:{}};}
    claimAnalysis.claims=claimAnalysis.claims.map(c=>({...c,sourceTurnId:turn.id}));
    promptAnalysis.rawJson={...promptAnalysis.rawJson,intent:promptAnalysis.intent,constraints:promptAnalysis.constraints,summary:promptAnalysis.summary};
    claimAnalysis.rawJson={...claimAnalysis.rawJson,products:claimAnalysis.products,claims:claimAnalysis.claims,summary:claimAnalysis.summary};
    const inputs:ConversationEvaluation['inputs']={userPrompt:turns.slice(0,index+1).map(t=>t.userPrompt).join('\n\n'),llmOutput:turn.llmOutput,conversation:{turns:turns.slice(0,index+1).map(t=>({...t})),evaluatedTurnId:turn.id,responsePolicy:'complete_snapshot',changes:state.changes.map(c=>({...c})),unresolved:[...state.unresolved.map(i=>({...i})),...(snapshotIssue?[{turnId:turn.id,sourceText:turn.llmOutput,reason:snapshotIssue}]:[])]}};
    const verificationResult=await runConstraintVerification(promptAnalysis.constraints,claimAnalysis.products,claimAnalysis.claims);
    const rubricResult=await runRubricEvaluation(promptAnalysis.constraints,claimAnalysis.products,verificationResult);
    const claimSupportResult=await runClaimSupportAnalysis(claimAnalysis.claims,claimAnalysis.products,snapshot);
    const rootCauseResult=await runRootCauseAnalysis(promptAnalysis,claimAnalysis,verificationResult,rubricResult,claimSupportResult,inputs.userPrompt,snapshot);
    const severityAndScoringResult=await runSeverityAndScoringAnalysis(promptAnalysis,claimAnalysis,verificationResult,rubricResult,claimSupportResult,rootCauseResult);
    const recommendationResult=await runRecommendationAnalysis(promptAnalysis,claimAnalysis,verificationResult,rubricResult,claimSupportResult,rootCauseResult,severityAndScoringResult);
    const finalEvaluationResult=await runFinalEvaluationAnalysis(promptAnalysis,claimAnalysis,verificationResult,rubricResult,claimSupportResult,rootCauseResult,severityAndScoringResult,recommendationResult,inputs.userPrompt,snapshot);
    results.push({inputs,promptAnalysis,claimAnalysis,verificationResult,rubricResult,claimSupportResult,rootCauseResult,severityAndScoringResult,recommendationResult,finalEvaluationResult});
  }
  return results;
}
