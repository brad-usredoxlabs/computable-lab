import { createHash } from 'node:crypto';
import type { ToolRegistry } from '../ai/ToolRegistry.js';
import { parseFasta } from './sequenceEngine.js';
import { SequenceError } from './SequenceService.js';
async function json(url:string):Promise<Record<string,any>> {
 const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new SequenceError(`Source returned HTTP ${response.status}`,502);
 return response.json() as Promise<Record<string,any>>;
}
export async function fetchSequenceSource(registry:ToolRegistry, source:string, accession:string, db='nucleotide') {
 const retrievedAt=new Date().toISOString();
 const stamp=(record:Record<string,unknown>,url:string,raw:unknown)=>({label:record.label,alphabet:record.alphabet,residues:record.residues,topology:'linear',source:{accession,url,retrievedAt,text:JSON.stringify(raw),sha256:createHash('sha256').update(JSON.stringify(raw)).digest('hex')}});
 if(source==='ncbi_gene') {
  if(!/^\d+$/.test(accession))throw new SequenceError('NCBI Gene ID must be numeric.');
  const linked=await json(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=gene&db=nuccore&linkname=gene_nuccore_refseqrna&id=${encodeURIComponent(accession)}&retmode=json`);
  const ids=(linked.linksets ?? []).flatMap((x:any)=>(x.linksetdbs ?? []).flatMap((y:any)=>y.links ?? []));
  if(!ids.length)return {options:[],message:'No linked RefSeq RNA records. Import a specific nucleotide or protein accession instead.'};
  const data=await json(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=nuccore&id=${ids.slice(0,100).join(',')}&retmode=json`);
  return {options:(data.result?.uids ?? []).map((uid:string)=>({accession:data.result[uid].accessionversion,label:data.result[uid].title,source:'ncbi',db:'nucleotide'})),total:ids.length};
 }
 if(source==='pdb') {
  if(!/^[A-Za-z0-9]{4}$/.test(accession))throw new SequenceError('Enter a four-character PDB entry ID.');
  const root='https://data.rcsb.org/rest/v1/core';const entry=await json(`${root}/entry/${accession}`);
  const ids=entry.rcsb_entry_container_identifiers?.polymer_entity_ids ?? [];
  const sequences=[];
  for(const id of ids) {
   const entity=await json(`${root}/polymer_entity/${accession}/${id}`);
   const polymer=entity.entity_poly ?? {};const residues=String(polymer.pdbx_seq_one_letter_code_can ?? '').replace(/\s/g,'');
   if(!residues)continue;
   const type=String(polymer.type);const alphabet=type.includes('polypeptide')?'protein':type.includes('polydeoxyribonucleotide')&&!type.includes('/')?'iupac_dna':type==='polyribonucleotide'?'iupac_rna':null;
   if(!alphabet)continue;
   sequences.push(stamp({label:`${accession} entity ${id} chains ${(entity.rcsb_polymer_entity_container_identifiers?.auth_asym_ids ?? []).join(', ')}`,residues,alphabet},`https://www.rcsb.org/structure/${accession}`,entity));
  }
  return {sequences,sourceSnapshot:entry};
 }
 const name=source==='uniprot'?'uniprot_fetch':source==='ncbi'?'ncbi_sequence_fetch':null;
 if(!name)throw new SequenceError('Choose NCBI, NCBI Gene, UniProt or PDB.');
 const tool=registry.get(name);if(!tool)throw new SequenceError(`${name} is unavailable`,503);
 const args=source==='uniprot'?{accession,asRecord:true}:{accession,db,format:'fasta'};
 const result=await tool.handler(args);
 const text=result.content.map(c=>'text' in c?c.text:'').join('\n');if(result.isError)throw new SequenceError(text,502);
 const data=JSON.parse(text) as Record<string,any>;
 if(source==='uniprot')return {sequences:[stamp(data.record,`https://www.uniprot.org/uniprotkb/${accession}`,data)],sourceSnapshot:data};
 const sequences=parseFasta(data.sequence).map(row=>stamp({label:row.label,alphabet:db==='protein'?'protein':'iupac_dna',residues:row.residues},data.url,data));
 return {sequences,sourceSnapshot:data};
}
