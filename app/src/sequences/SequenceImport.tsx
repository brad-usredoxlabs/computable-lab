import { useEffect, useState } from 'react'
import { sequenceApi, requestId, recordRef } from './api'
export function SequenceImport({onSaved,initialSource,initialAccession,orderOnly=false}:{onSaved?:()=>void;initialSource?:string;initialAccession?:string;orderOnly?:boolean}) {
 const [source,setSource]=useState(initialSource??'ncbi');const [accession,setAccession]=useState(initialAccession??'');const [db,setDb]=useState('nucleotide')
 const [rows,setRows]=useState<any[]>([]);const [options,setOptions]=useState<any[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [text,setText]=useState('');const [jobId,setJobId]=useState('')
 const [message,setMessage]=useState('');const [diagnostics,setDiagnostics]=useState<any[]>([])
 useEffect(()=>{if(initialSource)setSource(initialSource);if(initialAccession)setAccession(initialAccession)},[initialSource,initialAccession])
 async function load(s=source,a=accession,d=db) {
  setBusy(true);setError('');setMessage('');setRows([])
  try {const data=await sequenceApi(`/source?source=${encodeURIComponent(s)}&accession=${encodeURIComponent(a)}&db=${d}`);setOptions(data.options??[]);setRows((data.sequences??[]).map((r:any)=>({...r,selected:true})));setMessage(data.message??'')}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function upload(file?:File) {
  if(!file)return;setBusy(true);setError('');setMessage('');const form=new FormData();form.append('file',file)
  try{const data=await sequenceApi('/order',form);setRows(data.candidates.map((r:any)=>({...r,selected:true,alphabet:'iupac_dna',topology:'linear'})));setText(data.text);setDiagnostics(data.diagnostics??[]);setJobId(data.jobId);sessionStorage.setItem('cl-oligo-job',data.jobId);setMessage(data.message??'Review each sequence and its modifications before importing.');setOptions([])}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function reopen() {const id=jobId||sessionStorage.getItem('cl-oligo-job');if(!id)return;setBusy(true);setError('');try{const data=await sequenceApi(`/order/${encodeURIComponent(id)}`);setJobId(id);setText(data.text??'');setDiagnostics([]);setRows(data.candidates.map((r:any)=>({...r,selected:r.status!=='published',saved:r.status==='published'?'Previously imported':undefined,alphabet:'iupac_dna',topology:'linear'})))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function save() {
  setBusy(true);setError('')
  try {
   for(const row of rows.filter(r=>r.selected&&!r.saved)) {
    const sequence={label:row.label,residues:row.residues,alphabet:row.alphabet,topology:row.topology??'linear',...(row.source?{source:row.source}:{})}
    const result=await sequenceApi('/actions',row.recordId?{operation:'promote_oligo',requestId:row.requestId??(row.requestId=requestId()),candidateRef:recordRef(row.recordId,'ingestion-candidate'),sequence,modifications:row.modifications??[]}:{operation:'save_sequence',requestId:row.requestId??(row.requestId=requestId()),sequence})
    row.saved=result.oligoId??result.recordId;setRows([...rows])
   }
   setMessage('Selected records imported.');onSaved?.()
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 const edit=(index:number,key:string,value:unknown)=>setRows(previous=>previous.map((r,i)=>i===index?{...r,[key]:value,requestId:undefined}:r))
 return <div className="sequence-import">
  {!orderOnly&&<fieldset><legend>Import from Literature &amp; Bio-Sources</legend>
   <label>Source<select value={source} onChange={e=>setSource(e.target.value)}><option value="ncbi">NCBI sequence</option><option value="ncbi_gene">NCBI Gene</option><option value="uniprot">UniProt</option><option value="pdb">PDB</option></select></label>
   <label>Accession or entry ID<input value={accession} onChange={e=>setAccession(e.target.value)}/></label>
   {source==='ncbi'&&<label>Database<select value={db} onChange={e=>setDb(e.target.value)}><option value="nucleotide">Nucleotide</option><option value="protein">Protein</option></select></label>}
   <button disabled={busy||!accession} onClick={()=>void load()}>Fetch for review</button>
   {options.map((o,i)=><p key={i}><button disabled={busy} onClick={()=>void load(o.source,o.accession,o.db)}>{o.accession} — {o.label}</button></p>)}
  </fieldset>}
  <fieldset><legend>Primer / probe order confirmation</legend><label>PDF or text file<input type="file" accept=".pdf,.txt" disabled={busy} onChange={e=>void upload(e.target.files?.[0])}/></label>
   <label>Reopen ingestion job<input value={jobId} onChange={e=>setJobId(e.target.value)} placeholder="Job ID (or last uploaded job)"/></label><button disabled={busy} onClick={()=>void reopen()}>Reopen review</button>
   {diagnostics.map((d,i)=><p key={i} className="sequence-warning">{d.message}</p>)}
   {text&&<details><summary>Original extracted text</summary><pre>{text}</pre></details>}
  </fieldset>
  {rows.map((row,i)=><fieldset key={i}><legend>{row.label||`Oligo ${i+1}`} {row.page?`— page ${row.page}`:''}</legend>
   {row.saved?<p>Imported: {row.saved}</p>:<>
   <label><input type="checkbox" checked={row.selected} onChange={e=>edit(i,'selected',e.target.checked)}/>Import this record</label>
   <label>Name<input value={row.label} onChange={e=>edit(i,'label',e.target.value)}/></label>
   <label>Sequence, 5′ → 3′<textarea spellCheck={false} value={row.residues} onChange={e=>edit(i,'residues',e.target.value)}/></label>
   {row.raw&&<details><summary>Source transcription</summary><pre>{row.raw}</pre></details>}
   {(row.issues??[]).map((issue:string,j:number)=><p key={j} className="sequence-warning">Extraction needs review: {issue}</p>)}
   {row.recordId&&<><label>5′ reporter<input value={row.modifications?.find((m:any)=>m.role==='reporter')?.label??''} onChange={e=>edit(i,'modifications',[...(row.modifications??[]).filter((m:any)=>m.role!=='reporter'),...(e.target.value?[{label:e.target.value,role:'reporter',position:'5-prime'}]:[])])}/></label><label>3′ quencher<input value={row.modifications?.find((m:any)=>m.role==='quencher')?.label??''} onChange={e=>edit(i,'modifications',[...(row.modifications??[]).filter((m:any)=>m.role!=='quencher'),...(e.target.value?[{label:e.target.value,role:'quencher',position:'3-prime'}]:[])])}/></label></>}
   </>}
  </fieldset>)}
  {rows.some(r=>r.selected&&!r.saved)&&<button disabled={busy} onClick={()=>void save()}>Import reviewed records</button>}
  {busy&&<p role="status">Working…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </div>
}
