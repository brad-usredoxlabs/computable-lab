import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../server.js';
import type { ToolRegistry } from '../ai/ToolRegistry.js';
import { SequenceService, SequenceError } from './SequenceService.js';
import { sequenceConfig, SEQUENCE_SCHEMA, binaryHash } from './sequenceRuntime.js';
import { fetchSequenceSource } from './sequenceSources.js';
import { ingestOligoOrder } from './oligoOrder.js';
import { contentHash, object } from '../revisions/RecordRevisionService.js';
export function registerSequenceRoutes(app:FastifyInstance,ctx:AppContext,registry:ToolRegistry) {
 async function actor(request:FastifyRequest) { const user=await ctx.localIdentityService.resolveRequestUser(request);if(!user.userId)throw new SequenceError('Select or sign in as a user.',401);return user.userId; }
 const handle=(fn:(request:FastifyRequest)=>Promise<unknown>)=>async(request:FastifyRequest,reply:import('fastify').FastifyReply)=>{
  try{return await fn(request);}catch(err){reply.status(err instanceof SequenceError?err.status:422);return {error:'SEQUENCE_ACTION_FAILED',message:(err as Error).message};}
 };
 app.get('/sequences/catalog',handle(async request=>{
  const user=await actor(request);const kinds=['sequence','oligo-spec','sequence-collection','sequence-endpoint','assay-definition','readout-definition','sequence_interval','sequence-interpretation-rule','analysis-run','analysis-output-artifact','claim','context','measurement-context','assertion','evidence'];
  const records=(await Promise.all(kinds.map(kind=>ctx.store.list({kind,limit:1000})))).flat();
  const allowed=[];for(const r of records)if(await ctx.authorizationService.canAccess(user,'read',r))allowed.push(r);
  return {records:allowed};
 }));
 app.get('/sequences/contract',handle(async()=>({schema:ctx.schemaRegistry.getById(SEQUENCE_SCHEMA+'sequence-action.schema.yaml')?.schema,capabilities:await sequenceConfig('capabilities'),alphabets:await sequenceConfig('alphabets'),oligoSchema:ctx.schemaRegistry.getById(SEQUENCE_SCHEMA+'oligo-spec.schema.yaml')?.schema})));
 app.get('/sequences/authoring/:id',handle(async request=>{
  const service=new SequenceService(ctx,await actor(request));const record=await service.read((request.params as {id:string}).id);const payload=object(record.payload);
  const oligo=payload.kind==='oligo-spec';
  const source=oligo?await service.read(String(object(payload.sequenceRef).id)):record;
  const sequence=object(source.payload).kind==='record-revision'?object(object(source.payload).snapshot):object(source.payload);
  if(sequence.kind!=='sequence')throw new SequenceError('Select a sequence or oligo.');
  const fields=['label','residues','alphabet','topology','source','parentRevisionRef'];
  return {sourceId:source.recordId,sourceHash:contentHash(source.payload),author:payload.createdBy,
   oligoMetadata:oligo?payload:null,form:{sequence:Object.fromEntries(fields.filter(key=>sequence[key]!==undefined).map(key=>[key,sequence[key]])),oligo,modifications:oligo?payload.modifications??[]:[],vendor:oligo?payload.vendor??'':''}};
 }));
 app.post('/sequences/actions/validate',handle(async request=>{const service=new SequenceService(ctx,await actor(request));service.validate(request.body);return {valid:true};}));
 app.post('/sequences/actions',handle(async request=>new SequenceService(ctx,await actor(request)).apply(request.body)));
 app.post('/sequences/executable',handle(async request=>{await actor(request);const body=object(request.body);if(typeof body.path!=='string')throw new SequenceError('Executable path is required.');return {sha256:await binaryHash(body.path)};}));
 app.get('/sequences/source',handle(async request=>{await actor(request);const q=request.query as Record<string,string>;return fetchSequenceSource(registry,q.source??'',q.accession??'',q.db);}));
 app.post('/sequences/order',handle(async request=>{
  const user=await actor(request);const part=await request.file({limits:{fileSize:10*1024*1024,files:1}});
  if(!part)throw new SequenceError('Choose an order confirmation PDF or text file.');
  const bytes=await part.toBuffer();if(part.file.truncated)throw new SequenceError('The file exceeds 10 MB.');
  return ingestOligoOrder(ctx,user,part.filename,bytes);
 }));
 app.get('/sequences/order/:id',handle(async request=>{
  const service=new SequenceService(ctx,await actor(request));const id=(request.params as {id:string}).id;const job=await service.read(id);
  if(object(job.payload).kind!=='ingestion-job')throw new SequenceError('Select an ingestion job.');
  const sources=object(job.payload).artifact_refs as Array<{id:string}>;let text='';for(const source of sources??[]){const artifact=await service.read(source.id);text+=String(object(object(artifact.payload).text_extract).excerpt??'');}
  const candidates=await ctx.store.list({kind:'ingestion-candidate',limit:10000});
  return {jobId:id,text,candidates:candidates.filter(x=>object(object(x.payload).job_ref).id===id && object(x.payload).candidate_type==='oligo').map(x=>({recordId:x.recordId,...object(object(x.payload).payload),status:object(x.payload).status}))};
 }));
}
