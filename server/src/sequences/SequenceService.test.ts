import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import type { AppContext } from '../server.js';
import { SequenceService } from './SequenceService.js';
import { SEQUENCE_SCHEMA } from './sequenceRuntime.js';
let ctx: AppContext; let root: string; let service: SequenceService;
beforeAll(async()=>{
 root=await mkdtemp(join(tmpdir(),'cl-sequences-'));
 const registry=createSchemaRegistry(); const loaded=await loadAllSchemas({basePath:fileURLToPath(new URL('../../../schema',import.meta.url)),recursive:true});
 expect(loaded.errors).toEqual([]);registry.addSchemas(loaded.entries);
 const validator=createValidator();for(const id of registry.getTopologicalOrder()) {const e=registry.getById(id);if(e)validator.addSchema(e.schema,id);}
 const store=createRecordStore(createLocalRepoAdapter({basePath:root}),validator,new LintEngine());
 ctx={store,validator,schemaRegistry:registry,workspaceRoot:root,recordsDir:root} as AppContext;service=new SequenceService(ctx,'USR-test');
},30000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
const ref=(id:string)=>({kind:'record',id,type:'sequence'});
async function sequence(label:string,residues:string) {
 return service.apply({operation:'save_sequence',requestId:label,sequence:{label,residues,alphabet:'dna',topology:'linear'}});
}
describe('sequence records and actions',()=>{
 it('rejects malformed requests, unknown actions and non-DNA residues',async()=>{
  expect(()=>service.validate({operation:'shell',requestId:'x',command:'anything'})).toThrow();
  const v=ctx.validator.validate({kind:'sequence',id:'SEQ-invalid',alphabet:'dna',residues:'ACGTZ'},SEQUENCE_SCHEMA+'sequence.schema.yaml');
  expect(v.valid).toBe(false);
  await expect(sequence('bad','ACGTZ')).rejects.toThrow(/symbol|pattern/);
 });
 it('creates a durable normalized sequence with session authorship and an immutable revision',async()=>{
  const saved=await sequence('forward',' aa cg\n');
  const env=await ctx.store.get(String(saved.recordId));
  expect(env?.payload).toMatchObject({residues:'AACG',length:4,createdBy:'USR-test',notes:{submittedResidues:' aa cg\n'}});
  const again=await sequence('forward',' aa cg\n');expect(again).toEqual(saved);
  await expect(sequence('forward','TTTT')).rejects.toThrow(/request ID/);
 });
 it('runs the 140 bp assay through real schema validation, YAML storage and the analysis runner',async()=>{
  const f=await sequence('f','AACG');const r=await sequence('r','TGCA');const p=await sequence('p','TTTTTT');const template=await sequence('template','AACG'+'T'.repeat(132)+'TGCA');
  const endpoint={kind:'sequence-endpoint',id:'SEQEP-pcr',label:'Local virtual PCR',engine:'virtual-pcr',runtime:'builtin',version:'1.0.0',threads:1,timeoutSeconds:60};
  await service.apply({operation:'configure_endpoint',requestId:'endpoint',endpoint});
  const request={operation:'run_virtual_pcr',requestId:'assay',label:'140 bp test',endpointRef:ref(endpoint.id),inputs:{references:ref(String(template.recordId)),forward:ref(String(f.recordId)),reverse:ref(String(r.recordId)),probe:ref(String(p.recordId))},parameters:{minLength:140,maxLength:140,maxMismatches:0,exactThreePrime:3,maxProducts:100}};
  const result=await service.apply(request);
  expect(result.status).toBe('succeeded');
  const manifest=result.manifest as {artifacts:Array<{value:Array<{length:number}>}>};
  expect(manifest.artifacts[0]?.value[0]?.length).toBe(140);
  const run=await ctx.store.get(String(result.recordId));expect(run?.payload).toMatchObject({status:'succeeded',outputManifest:{version:1}});
  const templateEnv=(await ctx.store.get(String(template.recordId)))!;
  await ctx.store.update({envelope:{...templateEnv,payload:{...(templateEnv.payload as object),residues:'TTTT',length:4}}});
  expect(await service.apply(request)).toEqual(result);
  const artifacts=await ctx.store.list({kind:'analysis-output-artifact'});
  expect((artifacts[0]?.payload as Record<string,unknown>).sourceRelations).toHaveLength(4);
 });
});

describe('contextual sequence evidence',()=>{
 it('records missing controls as invalid/inconclusive and valid computational evidence in its own layer',async()=>{
  const ref=(id:string,type:string)=>({kind:'record',id,type});const base='https://computable-lab.com/schema/computable-lab/';
  await service.save({kind:'assay-definition',id:'ASSAY-test',name:'Test assay',assay_type:'PCR',instrument_type:'qpcr',readout_def_refs:[ref('RDEF-test','readout-definition')]},base+'assay-definition.schema.yaml');
  await service.save({kind:'claim',id:'CLM-test',statement:'Assay predicts a target product',subject:ref('ASSAY-test','assay-definition'),predicate:{kind:'ontology',id:'local:predicts',label:'predicts',namespace:'local'},object:{kind:'ontology',id:'local:target',label:'target',namespace:'local'}},base+'claim.schema.yaml');
  await service.save({kind:'context',id:'CTX-test',subject_ref:ref('SAMPLE-test','material'),contents:[]},'computable-lab/context');
  const run=(await ctx.store.list({kind:'analysis-run'}))[0]!;
  await service.save({kind:'analysis-output-artifact',id:'AOUT-control',title:'Positive control',name:'control',runRef:ref(run.recordId,'analysis-run'),dataKind:'metric',inlineValue:{passed:true}},base+'analysis-output-artifact.schema.yaml');
  const artifact=(await ctx.store.list({kind:'analysis-output-artifact'})).find(x=>(x.payload as any).name==='amplicons')!;
  await service.apply({operation:'save_interpretation_rule',requestId:'rule',rule:{kind:'sequence-interpretation-rule',id:'SIR-test',label:'Product prediction',assayRef:ref('ASSAY-test','assay-definition'),layer:'model_derived',requiredControls:['positive'],controlsPassWhen:{op:'equals',path:'controls.positive.passed',value:true},detectedWhen:{op:'compare',path:'result[0].length',operator:'gte',value:140},notDetectedWhen:{op:'compare',path:'result[0].length',operator:'lt',value:140},supportsOutcome:'detected'}});
  const request={operation:'interpret',requestId:'interpret-invalid',ruleRef:ref('SIR-test','sequence-interpretation-rule'),claimRef:ref('CLM-test','claim'),contextRef:ref('CTX-test','context'),resultRef:ref(artifact.recordId,'analysis-output-artifact'),statement:'In this reference context, the assay predicts a product',controls:{}};
  const invalid=await service.apply(request);expect(invalid.detection).toBe('invalid');
  expect((await ctx.store.get(String(invalid.evidenceId)))?.payload).toMatchObject({assessment:'inconclusive',assesses:[{id:invalid.assertionId}]});
  const valid=await service.apply({...request,requestId:'interpret-valid',controls:{positive:ref('AOUT-control','analysis-output-artifact')}});expect(valid.detection).toBe('detected');
  expect((await ctx.store.get(String(valid.assertionId)))?.payload).toMatchObject({scope:'single_context',outcome:{layer:'model_derived',detection:'detected'}});
  expect((await ctx.store.get(String(valid.evidenceId)))?.payload).toMatchObject({assessment:'supports',supports:[{id:valid.assertionId}]});
 });
});

describe('installed sequence engines',()=>{
 it.skipIf(!process.env.CL_TEST_MAFFT)('executes MAFFT and preserves original coordinates',async()=>{
  const {binaryHash}=await import('./sequenceRuntime.js');const executable=process.env.CL_TEST_MAFFT!;
  const endpoint={kind:'sequence-endpoint',id:'SEQEP-mafft',label:'Test MAFFT',engine:'mafft',runtime:'local',version:'7.526',executable,executableSha256:await binaryHash(executable),threads:1,timeoutSeconds:60};
  await service.apply({operation:'configure_endpoint',requestId:'mafft-config',endpoint});
  const a=await sequence('msa-a','ACGTACGTACGTACGT');const b=await sequence('msa-b','ACGTACGACGTACGT');
  const collection=await service.apply({operation:'save_collection',requestId:'msa-set',label:'Alignment inputs',members:[ref(String(a.recordId)),ref(String(b.recordId))]});
  const result=await service.apply({operation:'run_mafft',requestId:'msa-run',label:'Real MAFFT',endpointRef:ref(endpoint.id),inputs:{queries:ref(String(collection.recordId))},parameters:{strategy:'auto',maxIterations:0}});
  const rows=(result.manifest as any).artifacts[0].value;expect(rows).toHaveLength(2);expect(rows[0].aligned.length).toBe(rows[1].aligned.length);expect(rows[1].coordinateMap.filter((x:unknown)=>x!==null)).toHaveLength(15);expect(rows[0].revisionId).toBeTruthy();
 },30000);
 it.skipIf(!process.env.CL_TEST_BLASTN)('builds a local BLAST database and maps hits to pinned references',async()=>{
  const {binaryHash}=await import('./sequenceRuntime.js');const executable=process.env.CL_TEST_BLASTN!;const databaseBuilder=process.env.CL_TEST_MAKEBLASTDB!;
  const endpoint={kind:'sequence-endpoint',id:'SEQEP-blast',label:'Test BLAST',engine:'blastn',runtime:'local',version:'2.17.0',executable,executableSha256:await binaryHash(executable),databaseBuilder,databaseBuilderSha256:await binaryHash(databaseBuilder),threads:1,timeoutSeconds:60};
  await service.apply({operation:'configure_endpoint',requestId:'blast-config',endpoint});
  const bases='ACGATCGTAGCTAGGCTAACGTATCGGATCGTACCGATGCTAGCTAGGCTAACGATCGTAC';
  const a=await sequence('blast-q',bases);const b=await sequence('blast-ref','TTGG'+bases+'CCAA');
  const result=await service.apply({operation:'run_blastn',requestId:'blast-run',label:'Real BLAST',endpointRef:ref(endpoint.id),inputs:{queries:ref(String(a.recordId)),references:ref(String(b.recordId))},parameters:{task:'blastn',evalue:0.001,maxHits:10}});
  const hits=(result.manifest as any).artifacts[0].value;expect(hits.length).toBeGreaterThan(0);expect(hits[0]).toMatchObject({queryId:a.recordId,referenceId:b.recordId,identity:100});expect(hits[0].referenceRevisionId).toBeTruthy();
 },30000);
});

 it('preserves order provenance and promotes only reviewed candidates',async()=>{
  const {ingestOligoOrder}=await import('./oligoOrder.js');
  const imported=await ingestOligoOrder(ctx,'USR-test','order.txt',Buffer.from('Oligo Name: Probe\nSequence: /56-FAM/ACGTACGT/3BHQ_1/\n'));
  expect(imported.candidates).toHaveLength(1);
  const row=imported.candidates[0]! as any;
  expect((await ctx.store.list({kind:'oligo-spec'}))).toHaveLength(0);
  const result=await service.apply({operation:'promote_oligo',requestId:'review-order',candidateRef:ref(row.recordId),sequence:{label:row.label,residues:row.residues,alphabet:'iupac_dna',topology:'linear'},modifications:row.modifications});
  const oligo=(await ctx.store.get(String(result.oligoId)))!.payload as any;
  expect(oligo.source).toMatchObject({page:1,sha256:imported.sha256});expect(oligo.modifications.some((m:any)=>m.label==='FAM')).toBe(true);
  expect((await ctx.store.get(row.recordId))!.payload).toMatchObject({status:'published'});
 });

it('rejects presenting a sequence prediction as an observed measurement',async()=>{
 const ref=(id:string,type:string)=>({kind:'record',id,type});
 const rule=(await ctx.store.get('SIR-test'))!.payload as any;
 await service.apply({operation:'save_interpretation_rule',requestId:'observed-rule',rule:{...rule,id:'SIR-observed',layer:'observed'}});
 const artifact=(await ctx.store.list({kind:'analysis-output-artifact'})).find(x=>(x.payload as any).name==='amplicons')!;
 await expect(service.apply({operation:'interpret',requestId:'wrong-layer',ruleRef:ref('SIR-observed','sequence-interpretation-rule'),claimRef:ref('CLM-test','claim'),contextRef:ref('CTX-test','context'),resultRef:ref(artifact.recordId,'analysis-output-artifact'),statement:'Observed detection',controls:{}})).rejects.toThrow(/cannot be used as an observed measurement/);
});
it('rejects changed frozen parameters before serving a cached run',async()=>{
 const {AnalysisRunner}=await import('../analysis/analysisRunner.js');
 const run=(await ctx.store.list({kind:'analysis-run'})).find(x=>(x.payload as any).title==='140 bp test')!;
 const p=run.payload as any;
 const updated=await ctx.store.update({envelope:{...run,payload:{...p,parameters:{...p.parameters,maxLength:141}}}});expect(updated.success).toBe(true);
 await expect(new AnalysisRunner(ctx).executeRun(run.recordId)).rejects.toThrow(/Frozen run field parameters changed/);
});

it('validates only the selected action instead of reporting unrelated branches',()=>{
 const invalid={operation:'save_oligo',requestId:'bad-probe',oligo:{modifications:[{type:'reporter',dye:'FAM'}]}};
 const result=ctx.validator.validate(invalid,SEQUENCE_SCHEMA+'sequence-action.schema.yaml');
 expect(result.valid).toBe(false);
 expect(result.errors?.some(e=>e.path.startsWith('/oligo'))).toBe(true);
 expect(result.errors?.some(e=>e.message.includes('save_collection')||e.message.includes('endpointRef')||e.message.includes('save_sequence'))).toBe(false);
});
it('creates a FAM-QSY oligo and its pinned sequence only when applied, with safe retries',async()=>{
 const {RecordRevisionService}=await import('../revisions/RecordRevisionService.js');
 const request={operation:'create_oligo',requestId:'fam-qsy-probe',sequence:{label:'FAM-QSY probe',residues:'AATGGCATGACTGAGTCGATG',alphabet:'dna',topology:'linear'},vendor:'Thermo Fisher Scientific',modifications:[{position:'5-prime',label:'FAM',role:'reporter'},{position:'3-prime',label:'QSY',role:'quencher'}]};
 const before=(await ctx.store.list({kind:'oligo-spec'})).length;
 service.validate(request);expect((await ctx.store.list({kind:'oligo-spec'}))).toHaveLength(before);
 await expect(service.apply({...request,modifications:[{type:'reporter',dye:'FAM'}]})).rejects.toThrow();
 expect((await ctx.store.list({kind:'oligo-spec'}))).toHaveLength(before);
 const result=await service.apply(request);const oligo=(await ctx.store.get(String(result.recordId)))!.payload as any;
 expect(oligo).toMatchObject({kind:'oligo-spec',modifications:request.modifications,vendor:request.vendor,createdBy:'USR-test'});
 const pinned=await new RecordRevisionService(ctx.store).read(oligo.sequenceRef);
 expect(pinned.payload.snapshot).toMatchObject({residues:request.sequence.residues,length:21});
 expect(await service.apply(request)).toEqual(result);
 expect((await ctx.store.list({kind:'oligo-spec'}))).toHaveLength(before+1);
});
