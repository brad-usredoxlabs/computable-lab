import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { stringify } from 'yaml'
import { draftApi, sequenceApi } from './api'
import { NativeDraftController, type NativeDraftState } from './nativeDraft'

interface FormValues {sequence:Record<string,any>; modifications:Array<Record<string,any>>; vendor:string; oligo:boolean}
const blank=():FormValues=>({sequence:{label:'',residues:'',alphabet:'iupac_dna',topology:'linear'},modifications:[],vendor:'',oligo:false})
export interface SequenceEditorHandle {propose:(intent:Record<string,unknown>,userRequest?:string)=>void; canLeave:()=>boolean}
interface Props {
 recordId:string; contract:any; onSelect:(id:string)=>void
 onAccepted:()=>Promise<void>; onContext:(context:Record<string,unknown>)=>void
}
export const SequenceEditor=forwardRef<SequenceEditorHandle,Props>(function SequenceEditor({recordId,contract,onSelect,onAccepted,onContext},ref){
 const surfaceRef=useRef<HTMLElement>(null)
 const [form,setForm]=useState<FormValues>(blank);const formRef=useRef(form);formRef.current=form
 const [draft,setDraft]=useState<NativeDraftState>();const [notice,setNotice]=useState('');const [loadError,setLoadError]=useState('');const [loading,setLoading]=useState(false)
 const [sourceId,setSourceId]=useState('');const [sourceHash,setSourceHash]=useState('');const [author,setAuthor]=useState('');const [editVersion,setEditVersion]=useState(0)
 const controllerRef=useRef<NativeDraftController>()
 const projectedRef=useRef<NativeDraftState['compiled']>(null)
 if(!controllerRef.current)controllerRef.current=new NativeDraftController(body=>draftApi('/compile',body),body=>draftApi('/accept',body),next=>{
  // Publish the review and its visible fields in the same React update.
  if(next.compiled&&next.compiled!==projectedRef.current){
   const p=next.compiled.projection
   const values={sequence:p.sequence??blank().sequence,modifications:p.modifications??[],vendor:p.vendor??'',oligo:next.intent.operation==='create_oligo'}
   formRef.current=values;setForm(values)
  }
  projectedRef.current=next.compiled;setDraft(next)
 })
 const controller=controllerRef.current
 const targetRef=useRef<{recordId:string;contentHash:string}|undefined>();targetRef.current=sourceId?{recordId:sourceId,contentHash:sourceHash}:undefined
 const onContextRef=useRef(onContext);onContextRef.current=onContext
 const locked=!!(draft?.saving||draft?.incomplete)
 const request=(values:FormValues)=>({operation:values.oligo?'create_oligo':'save_sequence',sequence:values.sequence,...(values.oligo?{modifications:values.modifications,...(values.vendor?{vendor:values.vendor}:{})}:{})})
 useEffect(()=>{
  let current=true;setLoadError('');setNotice('');setLoading(!!recordId)
  if(controller.state.active)controller.reject()
  if(!recordId){setForm(blank());setSourceId('');setAuthor('');setLoading(false);return}
  sequenceApi(`/authoring/${encodeURIComponent(recordId)}`).then(data=>{
   if(!current)return
   setForm(data.form);setSourceId(data.sourceId);setSourceHash(data.sourceHash);setAuthor(data.author??'');setEditVersion(v=>v+1)
  }).catch(e=>{if(current)setLoadError(e.message)}).finally(()=>{if(current)setLoading(false)})
  return()=>{current=false}
 },[recordId,controller])
 useEffect(()=>{if(draft?.active)surfaceRef.current?.closest('main')?.scrollTo({top:0})},[draft?.active])
 useEffect(()=>{onContextRef.current({workingForm:form,draft: draft?.active?{draftId:draft.compiled?.draftId,revision:draft.compiled?.revision,intent:request(form),diagnostics:draft.compiled?.diagnostics??[],pending:draft.pending}:null,proposalScopeKey:`${recordId}:${editVersion}`})},[form,draft,recordId,editVersion])
 useImperativeHandle(ref,()=>({
  propose:(intent,userRequest)=>{
   if(loading||locked)return
   setNotice('');setEditVersion(v=>v+1)
   // Keep the original unsaved baseline across AI revisions and direct edits.
   const parent=(intent.sequence as FormValues['sequence']|undefined)?.parentRevisionRef
   // A selected record is background context, not implicit lineage for a new oligo.
   const target=typeof parent?.id==='string'?(parent.id===targetRef.current?.recordId?targetRef.current:{recordId:parent.id}):undefined
   controller.propose(formRef.current,intent,target,userRequest)
  },
  canLeave:()=>!controller.state.saving&&!controller.state.incomplete,
 }),[controller,loading,locked])
 const edit=(next:FormValues)=>{setForm(next);setEditVersion(v=>v+1);if(controller.state.active)controller.edit(request(next))}
 const editSequence=(key:string,value:string)=>edit({...form,sequence:{...form.sequence,[key]:value}})
 async function accept(){
  let saved:Record<string,any>
  try{saved=await controller.accept()}catch{return /* review bar reports failure */}
  setNotice(`Saved ${saved.recordId}`);onSelect(saved.recordId)
  try{await onAccepted()}catch(error){setLoadError(`Saved successfully, but the library could not refresh: ${(error as Error).message}`)}
 }
 const normalized=String(form.sequence.residues??'').replace(/\s/g,'').toUpperCase()
 const review=draft?.active
 return <section ref={surfaceRef} className={review?'sequence-authoring sequence-proposed':'sequence-authoring'} aria-label="Sequence editor">
  {review&&<div className="sequence-review-bar" role="region" aria-label="Draft review">
   <strong>{draft.pending?'Compiling proposal…':draft.incomplete?'Save incomplete — retry to finish':'Proposed changes'}</strong>
   <span>{draft.compiled?`Revision ${draft.compiled.revision}`:'Review the fields below'}</span>
   <button disabled={!draft.compiled?.canAccept||draft.pending||draft.saving} onClick={()=>void accept()}>{draft.saving?'Saving…':'Accept and save'}</button>
   <button disabled={locked} onClick={()=>{setForm(controller.reject());setEditVersion(v=>v+1);sessionStorage.removeItem('cl-sequence-proposal')}}>Reject</button>
   <span className="sequence-hint">Edit any field, or ask the chat to revise this proposal.</span>
   {draft.compiled?.diagnostics.filter(d=>d.severity!=='info').map((d,i)=><p key={i} role={d.severity==='error'?'alert':'status'}>{d.message}</p>)}
   {draft.error&&<p role="alert">{draft.error}</p>}
  </div>}
  {loading&&<p role="status">Loading sequence…</p>}{loadError&&<p role="alert">{loadError}</p>}{notice&&<p role="status">{notice}</p>}
  <fieldset disabled={locked||loading} className="sequence-native-fields">
   <legend>{review?'Proposed sequence / oligo':'Sequence / oligo'}</legend>
   <button onClick={()=>{if(controller.state.active)controller.reject();setForm(blank());setSourceId('');setAuthor('');setEditVersion(v=>v+1);onSelect('')}}>New sequence</button>
   <label>Name<input value={form.sequence.label??''} onChange={e=>editSequence('label',e.target.value)}/></label>
   <div className="sequence-fields"><label>Alphabet<select value={form.sequence.alphabet??''} onChange={e=>editSequence('alphabet',e.target.value)}>{Object.keys(contract?.alphabets??{}).map(a=><option key={a}>{a}</option>)}</select></label><label>Topology<select value={form.sequence.topology??''} onChange={e=>editSequence('topology',e.target.value)}><option>linear</option><option>circular</option></select></label></div>
   <label>Sequence, 5′ → 3′<textarea aria-label="Sequence, 5′ → 3′" className="sequence-residues" rows={8} spellCheck={false} value={form.sequence.residues??''} onChange={e=>editSequence('residues',e.target.value)}/></label>
   <p>{normalized.length} residues{review?' · Proposed values':''}</p>
   <details><summary>Normalized sequence</summary><pre>{normalized}</pre></details>
   {contract?.alphabets?.[form.sequence.alphabet]?.complements&&<details><summary>Reverse complement</summary><pre>{[...normalized].reverse().map(x=>contract.alphabets[form.sequence.alphabet].complements[x]??'?').join('')}</pre></details>}
   <label><input type="checkbox" checked={form.oligo} onChange={e=>edit({...form,oligo:e.target.checked})}/> Oligo specification</label>
   {form.oligo&&<fieldset><legend>Oligo modifications</legend>
    <label>Vendor<input value={form.vendor} onChange={e=>edit({...form,vendor:e.target.value})}/></label>
    {form.modifications.map((mod,index)=><div className="sequence-modification" key={index}>
     <label>Position<select value={mod.position??''} onChange={e=>edit({...form,modifications:form.modifications.map((m,i)=>i===index?{...m,position:e.target.value}:m)})}>{(contract?.oligoSchema?.properties?.modifications?.items?.properties?.position?.enum??[]).map((p:string)=><option key={p}>{p}</option>)}</select></label>
     <label>Modification label<input value={mod.label??''} onChange={e=>edit({...form,modifications:form.modifications.map((m,i)=>i===index?{...m,label:e.target.value}:m)})}/></label>
     <label>Modification role<select value={mod.role??''} onChange={e=>edit({...form,modifications:form.modifications.map((m,i)=>i===index?{...m,role:e.target.value}:m)})}>{(contract?.oligoSchema?.properties?.modifications?.items?.properties?.role?.enum??[]).map((p:string)=><option key={p}>{p}</option>)}</select></label>
     {(mod.position==='internal'||mod.baseIndex!==undefined)&&<label>Base index<input type="number" min="1" value={mod.baseIndex??''} onChange={e=>edit({...form,modifications:form.modifications.map((m,i)=>i===index?{...m,baseIndex:Number(e.target.value)}:m)})}/></label>}
     <button aria-label={`Remove modification ${index+1}`} onClick={()=>edit({...form,modifications:form.modifications.filter((_,i)=>i!==index)})}>Remove</button>
    </div>)}
    <button onClick={()=>edit({...form,modifications:[...form.modifications,{position:'5-prime',label:'',role:'other'}]})}>Add modification</button>
    <p className="sequence-hint">Assign primer/probe roles and readout channels in the Assay tab.</p>
   </fieldset>}
   {form.sequence.source&&<details><summary>Source provenance</summary><pre>{stringify(form.sequence.source)}</pre></details>}
   {form.sequence.parentRevisionRef&&<p className="sequence-hint">Derived from {form.sequence.parentRevisionRef.id}</p>}
   {!review&&<button disabled={!form.sequence.label||!normalized} onClick={()=>controller.propose(form,request(form),targetRef.current)}>Review and save {form.oligo?'oligo':'sequence'}</button>}
  </fieldset>
  {recordId&&<p className="sequence-hint">{recordId} · Author: {author||'—'}. Existing analyses retain their original sequence.</p>}
  {review&&<details><summary>Compiler details (YAML)</summary><pre>{stringify({intent:draft.compiled?.normalizedIntent?.payload??draft.intent,diagnostics:draft.compiled?.diagnostics,plannedRecords:draft.compiled?.writes.map(w=>({id:w.recordId,kind:w.payload.kind}))})}</pre></details>}
 </section>
})
