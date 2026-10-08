import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { AppContext } from '../server.js';
import { extractPdfLayoutText } from '../extract/PdfTextAdapter.js';
import { ArtifactBlobStore } from '../ingestion/ArtifactBlobStore.js';
import { buildIngestionJobEnvelope, buildIngestionArtifactEnvelope, buildIngestionBundleEnvelope, buildIngestionCandidateEnvelope, createRecordRef, createSourceRef } from '../ingestion/records.js';
import { SequenceService } from './SequenceService.js';
import { normalizeSequence, type AlphabetSpec } from './sequenceEngine.js';
import { sequenceConfig, SEQUENCE_SCHEMA } from './sequenceRuntime.js';
export interface OligoRow { label:string; residues:string; raw:string; page:number; modifications:Array<{label:string;role:string;position:string}>; issues:string[]; metadata:Record<string,string> }
export async function extractOligoRows(text: string): Promise<OligoRow[]> {
  const config=await sequenceConfig('oligo-order'); const alphabets=await sequenceConfig('alphabets');
  const rows:OligoRow[]=[];const metadata:Record<string,string>={};
  for(const line of text.split(/\r?\n/))for(const [key,pattern] of Object.entries(config.metadata??{})){const match=new RegExp(String(pattern),'i').exec(line.trim());if(match)metadata[key]=match[1]!.trim();}
  for(const [pageIndex,page] of text.split('\f').entries()) {
    let label='';let row:OligoRow|undefined;let table=false;
    for(const line of page.split(/\r?\n/)) {
      const trimmed=line.trim();
      const name=new RegExp(config.namePattern,'i').exec(trimmed);
      const sequence=new RegExp(config.sequencePattern,'i').exec(trimmed);
      if(name) {label=name[1]!.trim();row=undefined;continue;}
      if(/\bname\b.*\bsequence\b/i.test(trimmed)) {table=true;continue;}
      const cells=table?trimmed.split(/\t+|\s{2,}/):[];
      if(sequence || (cells.length>=2 && cells[1]!.match(/^[ACGTRYSWKMBDHVN\s\/\[\]0-9'()-]+$/i))) {
        row={label:sequence?label:cells[0]!,residues:'',raw:sequence?sequence[1]!:cells[1]!,page:pageIndex+1,modifications:[],issues:[],metadata:{...metadata}};rows.push(row);continue;
      }
      if(row && /^(?:[ACGTRYSWKMBDHVN]+|\s|\/[^\/]+\/|\[[^\]]+\]|\([^)]*\)|[-_0-9'′’])+$/i.test(trimmed) && trimmed) row.raw+='\n'+trimmed;
      else if(trimmed) row=undefined;
    }
  }
  for(const row of rows) {
    let bases=row.raw.replace(/^\s*5\s*['′’]?\s*[-–]?/,'').replace(/[-–]?\s*3\s*['′’]?\s*$/,'');
    for(const mod of config.modifications) {
      const regex=new RegExp(mod.pattern,'gi');
      if(regex.test(bases)) {row.modifications.push({label:mod.label,role:mod.role,position:mod.position});bases=bases.replace(new RegExp(mod.pattern,'gi'),'');}
    }
    try {row.residues=normalizeSequence(bases,alphabets.iupac_dna as AlphabetSpec);}catch(err){row.residues=bases.replace(/\s+/g,'');row.issues.push((err as Error).message);}
    if(!row.label) row.issues.push('No oligo name found. Enter a name before saving.');
  }
  return rows;
}
/** Uses the existing job/artifact/bundle/candidate infrastructure. No canonical oligos before review. */
export async function ingestOligoOrder(ctx: AppContext, actor:string, fileName:string, bytes:Buffer) {
  const service=new SequenceService(ctx,actor);const sha256=createHash('sha256').update(bytes).digest('hex');
  let extraction: {text:string;diagnostics:import('../extract/ExtractorAdapter.js').ExtractionDiagnostic[]}=fileName.toLowerCase().endsWith('.pdf') ? await extractPdfLayoutText(bytes) : {text:bytes.toString('utf8'),diagnostics:[]};
  if(fileName.toLowerCase().endsWith('.pdf') && !extraction.text.trim()) {
    const config=await sequenceConfig('oligo-order');
    if(config.ocr?.enabled) {
      const dir=await mkdtemp(join(tmpdir(),'cl-oligo-ocr-'));
      try {
        const input=join(dir,'source.pdf');await writeFile(input,bytes);
        const exec=promisify(execFile);const timeout=config.ocr.timeoutSeconds*1000;
        await exec(config.ocr.rasterizer,['-r',String(config.ocr.dpi),'-f','1','-l',String(config.ocr.maxPages),'-png',input,join(dir,'page')],{timeout});
        const pages=(await readdir(dir)).filter(f=>f.endsWith('.png')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
        const texts=[];for(const page of pages){const result=await exec(config.ocr.executable,[join(dir,page),'stdout','-l',config.ocr.language],{timeout,maxBuffer:10*1024*1024});texts.push(result.stdout);}
        extraction={...extraction,text:texts.join('\f')};
        extraction.diagnostics.push({severity:'warning',code:'LOCAL_OCR_REVIEW',message:'Transcribed using local OCR (up to the configured page limit). Check page coverage, every base and modification against the PDF before importing.'});
      }catch(err){extraction.diagnostics.push({severity:'error',code:'LOCAL_OCR_FAILED',message:(err as Error).message});}finally{await rm(dir,{recursive:true,force:true});}
    }
  }
  const rows=await extractOligoRows(extraction.text);
  const job=buildIngestionJobEnvelope({sourceKind:'other',adapterKind:'oligo-order',name:fileName,submittedBy:actor});
  const artifact=buildIngestionArtifactEnvelope(job.payload,{fileName,mediaType:fileName.endsWith('.pdf')?'application/pdf':'text/plain',sha256});
  const blob=await new ArtifactBlobStore(ctx.workspaceRoot,join(ctx.recordsDir,'.ingestion-artifacts')).save({artifactId:artifact.recordId,fileName,contentBase64:bytes.toString('base64')});
  artifact.payload={...artifact.payload,file_ref:{...artifact.payload.file_ref,stored_path:blob.storedPath,size_bytes:blob.sizeBytes},text_extract:{excerpt:extraction.text,extracted_at:new Date().toISOString(),method:extraction.diagnostics.some(d=>d.code==='LOCAL_OCR_REVIEW')?'local-ocr':'layout-text'}};
  const bundle=buildIngestionBundleEnvelope({job:job.payload,title:`${job.recordId} oligos`,bundleType:'other',summary:'Review names, base sequences, orientation and modifications before importing.'});
  const candidates=rows.map((row,index)=>buildIngestionCandidateEnvelope({job:job.payload,bundle:bundle.payload,candidateType:'oligo',title:`${job.recordId} row ${index+1}: ${row.label}`,payload:{...row,sha256},sourceRefs:[createSourceRef(artifact.recordId)],proposedRecordKind:'oligo-spec',proposedSchemaId:SEQUENCE_SCHEMA+'oligo-spec.schema.yaml'}));
  bundle.payload.candidate_refs=candidates.map(c=>createRecordRef(c.recordId,'ingestion-candidate'));
  job.payload={...job.payload,status:'waiting_for_review',stage:'review',artifact_refs:[createRecordRef(artifact.recordId,'ingestion-artifact')],bundle_refs:[createRecordRef(bundle.recordId,'ingestion-candidate-bundle')]};
  for(const env of [job,artifact,bundle,...candidates]) await service.save(env.payload as unknown as Record<string,unknown>,env.schemaId);
  return {jobId:job.recordId,artifactId:artifact.recordId,sha256,candidates:candidates.map(c=>({recordId:c.recordId,...c.payload.payload})),text:extraction.text,diagnostics:extraction.diagnostics,...(!rows.length?{message:'No oligo rows were recognized. Review the extracted text and enter the sequences manually; scanned PDFs need local OCR.'}:{})};
}
