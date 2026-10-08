export function SequenceResults({manifest}:{manifest:any}) {
 if(!manifest)return null
 return <section aria-label="Analysis results">
  {(manifest.logs??[]).map((x:any,i:number)=><p className="sequence-hint" key={i}>{x.message}</p>)}
  {(manifest.artifacts??[]).map((artifact:any)=><div key={artifact.name}>
   <h3>{artifact.name}</h3>
   {artifact.dataKind==='alignment' && Array.isArray(artifact.value) ? <div className="sequence-alignment">{artifact.value.map((row:any,i:number)=><div key={i}><strong>{row.sequenceId}</strong><pre>{row.aligned}</pre></div>)}</div>
   : Array.isArray(artifact.value)&&artifact.value.length>0 ? <div className="sequence-table-scroll"><table><thead><tr>{Object.keys(artifact.value[0]).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{artifact.value.map((row:any,i:number)=><tr key={i}>{Object.entries(row).map(([k,v])=><td key={k}>{typeof v==='object'?<details><summary>Details</summary><pre>{JSON.stringify(v,null,2)}</pre></details>:k==='residues'?<details><summary>{String(v).length} bases</summary><pre>{String(v)}</pre></details>:String(v)}</td>)}</tr>)}</tbody></table></div>
   : artifact.dataReferenceRef ? <p>Result stored as <a href={`/record/${artifact.dataReferenceRef.id}`}>{artifact.dataReferenceRef.id}</a>.</p>
   : <p>No matching results.</p>}
  </div>)}
 </section>
}
