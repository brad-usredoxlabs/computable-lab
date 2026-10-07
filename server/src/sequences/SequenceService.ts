import { createHash } from 'node:crypto';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';
import { RecordRevisionService, contentHash, object, revisionRef, withRecordLock } from '../revisions/RecordRevisionService.js';
import { AnalysisRunner } from '../analysis/analysisRunner.js';
import { evaluatePredicate } from '../lint/PredicateEvaluator.js';
import type { Predicate } from '../lint/types.js';
import { normalizeSequence, type AlphabetSpec } from './sequenceEngine.js';
import { sequenceConfig, SEQUENCE_SCHEMA, inspectEndpoint, builtinEngineHash, discoverEndpoints, deployEndpoint, type Endpoint } from './sequenceRuntime.js';
const common = 'https://computable-lab.com/schema/computable-lab/';
export class SequenceError extends Error { constructor(message: string, public status = 422) { super(message); } }
export class SequenceService {
  constructor(private ctx: AppContext, private actor: string, private now: () => string = () => new Date().toISOString()) {}
  validate(request: unknown): Record<string, any> {
    const validation = this.ctx.validator.validate(request, SEQUENCE_SCHEMA+'sequence-action.schema.yaml');
    if (!validation.valid) throw new SequenceError(validation.errors?.map(e=>`${e.path}: ${e.message}`).join('; ') ?? 'Invalid sequence action');
    return request as Record<string, any>;
  }
  async read(id: string): Promise<RecordEnvelope> {
    const env = await this.ctx.store.get(id);
    if (!env) throw new SequenceError(`Record not found: ${id}`,404);
    const source = object(env.payload).kind === 'record-revision' ? await this.ctx.store.get(String(object(env.payload).sourceRecordId)) : env;
    if (!source || (this.ctx.authorizationService && !await this.ctx.authorizationService.canAccess(this.actor,'read',source))) throw new SequenceError('Record access denied.',403);
    return env;
  }
  async pin(ref: {id:string}, allowed?: string[]): Promise<{kind:'record';type:'record-revision';id:string}> {
    const env = await this.read(ref.id);
    const service = new RecordRevisionService(this.ctx.store, this.now);
    const revision = object(env.payload).kind === 'record-revision' ? await service.read(ref) : await service.capture(env,this.actor,'research-use');
    const payload = revision.payload.snapshot;
    if (allowed && !allowed.includes(String(payload.kind))) throw new SequenceError(`Expected ${allowed.join(' or ')}, got ${String(payload.kind)}.`);
    if (payload.kind === 'oligo-spec') await this.pin(payload.sequenceRef as {id:string},['sequence']);
    if (payload.kind === 'sequence-collection') for (const member of payload.members as Array<{id:string}>) await this.pin(member,['sequence']);
    return revisionRef(revision.recordId);
  }
  async save(payload: Record<string,unknown>, schemaId: string): Promise<RecordEnvelope> {
    const id = String(payload.id); const prior = await this.ctx.store.get(id);
    if (prior) {
      await this.read(id);
      const strip = (p: Record<string,unknown>) => { const c={...p}; for(const k of ['createdAt','createdBy','updatedAt','@id','@type','@context']) delete c[k]; return c; };
      if (contentHash(strip(object(prior.payload))) !== contentHash(strip(payload))) throw new SequenceError(`Record ${id} already exists with different content. Save a new revision.`,409);
      return prior;
    }
    const now = this.now();
    const result = await this.ctx.store.create({ envelope:{recordId:id,schemaId,payload:{...payload,createdBy:this.actor,createdAt:now,updatedAt:now}},message:`Create ${String(payload.kind)} ${id}` });
    if (!result.success) throw new SequenceError([result.error ?? 'Could not save record',...(result.validation?.errors??[]).map(e=>`${e.path}: ${e.message}`)].join('; '));
    const envelope = result.envelope ?? (await this.ctx.store.get(id))!;
    await this.ctx.authorizationService?.ensureOwnerPolicy(envelope,this.actor);
    return envelope;
  }
  /** A proposal has no effects until this handler is called by Accept. Retries reuse the receipt. */
  async apply(raw: unknown): Promise<Record<string,unknown>> {
    const req=this.validate(raw); const hash=contentHash(req);
    const receiptId=`SEQACT-${contentHash({actor:this.actor,requestId:req.requestId}).slice(0,24)}`;
    return withRecordLock(this.ctx.store,receiptId,async()=>{
      const prior=await this.ctx.store.get(receiptId);
      if(prior) {
        if(object(prior.payload).requestHash !== hash) throw new SequenceError('This request ID was already used for different content.',409);
        return object(object(prior.payload).result);
      }
      const result=await this.perform(req,hash);
      await this.save({kind:'sequence-action-receipt',id:receiptId,requestHash:hash,result},SEQUENCE_SCHEMA+'sequence-action-receipt.schema.yaml');
      return result;
    });
  }
  private async perform(req: Record<string,any>, hash: string): Promise<Record<string,unknown>> {
    const id=(prefix:string)=>`${prefix}-${hash.slice(0,24)}`;
    switch(req.operation) {
      case 'pin_sequence': return {revisionRef:await this.pin(req.sequenceRef,['sequence'])};
      case 'save_sequence': {
        const alphabets=await sequenceConfig('alphabets'); const raw=String(req.sequence.residues);
        const residues=normalizeSequence(raw,alphabets[req.sequence.alphabet] as AlphabetSpec);
        if(req.sequence.parentRevisionRef) await this.pin(req.sequence.parentRevisionRef,['sequence']);
        const record=await this.save({...req.sequence,kind:'sequence',id:id('SEQ'),residues,length:residues.length,
          canonicalization:{rules:['strip_whitespace','uppercase'],canonical_residues:residues,checksum:{algo:'sha256',value:createHash('sha256').update(residues).digest('hex')}},
          notes:{submittedResidues:raw}},SEQUENCE_SCHEMA+'sequence.schema.yaml');
        return {recordId:record.recordId,revisionRef:await this.pin({id:record.recordId},['sequence'])};
      }
      case 'save_interval': {
        const on_sequence=await this.pin(req.sequenceRef,['sequence']);
        const parent=(await new RecordRevisionService(this.ctx.store, this.now).read(on_sequence)).payload.snapshot;
        if(req.start>req.end || req.end>String(parent.residues).length) throw new SequenceError('The interval must lie inside its parent sequence, with start <= end.');
        const record=await this.save({kind:'sequence_interval',id:id('INT'),label:req.label,on_sequence,start:req.start,end:req.end,strand:req.strand,coordinate_system:'1-based-inclusive'},SEQUENCE_SCHEMA+'sequence-interval.schema.yaml');
        return {recordId:record.recordId};
      }
      case 'save_interpretation_rule': {
        await this.read(req.rule.assayRef.id);
        const record=await this.save(req.rule,SEQUENCE_SCHEMA+'sequence-interpretation-rule.schema.yaml');return {recordId:record.recordId};
      }
      case 'promote_oligo': {
        const candidate=await this.read(req.candidateRef.id); const c=object(candidate.payload);
        if(this.ctx.authorizationService && !await this.ctx.authorizationService.canAccess(this.actor,'write',candidate))throw new SequenceError('Candidate write access denied.',403);
        if(c.kind !== 'ingestion-candidate' || c.candidate_type !== 'oligo') throw new SequenceError('Select an oligo ingestion candidate.');
        const row=object(c.payload); const sourceRefs=c.source_refs as Array<{artifact_ref:{id:string}}>;
        const source={sourceRef:{kind:'record',type:'ingestion-artifact',id:sourceRefs[0]!.artifact_ref.id},page:row.page,text:row.raw,sha256:row.sha256};
        const saved=await this.perform({operation:'save_sequence',sequence:{...req.sequence,source}},contentHash({sha256:row.sha256,label:req.sequence.label,residues:req.sequence.residues,alphabet:req.sequence.alphabet,topology:req.sequence.topology}));
        const oligoId=`OLIGO-${contentHash({source,sequenceRef:saved.revisionRef,modifications:req.modifications}).slice(0,24)}`;
        const oligo=await this.save({kind:'oligo-spec',id:oligoId,label:req.sequence.label,sequenceRef:saved.revisionRef,modifications:req.modifications,...object(row.metadata),source},SEQUENCE_SCHEMA+'oligo-spec.schema.yaml');
        const updated=await this.ctx.store.update({envelope:{...candidate,payload:{...c,status:'published',publish_result:{published:true,record_ref:{kind:'record',type:'oligo-spec',id:oligoId},published_at:new Date().toISOString(),published_by:this.actor}}},message:`Import reviewed oligo ${oligoId}`});
        if(!updated.success)throw new SequenceError(updated.error ?? 'Could not mark candidate published.');
        return {...saved,oligoId:oligo.recordId};
      }
      case 'save_collection': {
        const members=[];for(const ref of req.members) members.push(await this.pin(ref,['sequence']));
        const record=await this.save({kind:'sequence-collection',id:id('SEQSET'),label:req.label,members},SEQUENCE_SCHEMA+'sequence-collection.schema.yaml');
        return {recordId:record.recordId,revisionRef:await this.pin({id:record.recordId},['sequence-collection'])};
      }
      case 'create_oligo': {
        // IDs and references are resolved here, after review, rather than guessed by the model.
        const sequence=await this.perform({operation:'save_sequence',sequence:req.sequence},contentHash({action:hash,part:'sequence'}));
        const oligo=await this.perform({operation:'save_oligo',oligo:{kind:'oligo-spec',id:id('OLIGO'),label:req.sequence.label,sequenceRef:sequence.revisionRef,modifications:req.modifications,...(req.vendor?{vendor:req.vendor}:{})}},hash);
        return {...oligo,sequenceId:sequence.recordId};
      }
      case 'save_oligo': {
        const sequenceRef=await this.pin(req.oligo.sequenceRef,['sequence']);
        const record=await this.save({...req.oligo,sequenceRef},SEQUENCE_SCHEMA+'oligo-spec.schema.yaml');
        return {recordId:record.recordId,revisionRef:await this.pin({id:record.recordId},['oligo-spec'])};
      }
      case 'save_readout': {const record=await this.save(req.readout,common+'readout-definition.schema.yaml');return {recordId:record.recordId};}
      case 'save_assay': {
        const assay=structuredClone(req.assay);
        for(const role of assay.oligos ?? []) role.oligoRef=await this.pin(role.oligoRef,['oligo-spec']);
        for(const r of assay.readout_def_refs ?? []) await this.read(r.id);
        for(const role of assay.oligos ?? []) if(role.readoutRef) await this.read(role.readoutRef.id);
        if(assay.referenceCollectionRef) assay.referenceCollectionRef=await this.pin(assay.referenceCollectionRef,['sequence-collection']);
        const record=await this.save(assay,common+'assay-definition.schema.yaml');
        return {recordId:record.recordId};
      }
      case 'discover_endpoints': return {endpoints:await discoverEndpoints()};
      case 'deploy_endpoint': await deployEndpoint(req.endpoint as Endpoint); return this.perform({...req,operation:'configure_endpoint'},hash);
      case 'configure_endpoint': {
        const configuration={...req.endpoint,...(req.endpoint.runtime==='builtin'?{engineSha256:await builtinEngineHash()}:{})};
        const health=await inspectEndpoint(configuration as Endpoint);
        const record=await this.save(configuration,SEQUENCE_SCHEMA+'sequence-endpoint.schema.yaml');
        return {recordId:record.recordId,...health};
      }
      case 'run_virtual_pcr': case 'run_mafft': case 'run_blastn': {
        const endpointRef=await this.pin(req.endpointRef,['sequence-endpoint']);
        const endpoint=(await new RecordRevisionService(this.ctx.store, this.now).read(endpointRef)).payload.snapshot as unknown as Endpoint;
        const operation=String(req.operation).slice(4).replace('_','-');
        if(endpoint.engine !== operation) throw new SequenceError(`Select an endpoint for ${operation}.`);
        await inspectEndpoint(endpoint);
        const inputs: Record<string, {kind:'record';type:'record-revision';id:string}>={};
        for(const [name,ref] of Object.entries(req.inputs)) inputs[name]=await this.pin(ref as {id:string},['sequence','oligo-spec','sequence-collection']);
        const revision=await this.save({kind:'analysis-revision',id:id('ANREV'),title:req.label,entryScript:'# Registered sequence adapter; no model-authored script.',sdkVersion:'0.1.0',sequenceMethod:{operation,endpointRevisionRef:endpointRef},parameterSchema:this.actionParameterSchema(req.operation)},common+'analysis-revision.schema.yaml');
        const frozenRevisionRef=await this.pin({id:revision.recordId},['analysis-revision']);
        const recordId=id('ANR');
        const existing=await this.ctx.store.get(recordId);
        if(!existing) await this.save({kind:'analysis-run',id:recordId,title:req.label,status:'queued',revisionRef:{kind:'record',id:revision.recordId,type:'analysis-revision'},frozenRevisionRef,inputs,parameters:req.parameters,initiator:this.actor},common+'analysis-run.schema.yaml');
        const queued=(await this.ctx.store.get(recordId))!;
        if(!object(queued.payload).frozenExecutionRef) {
          const frozen=await new RecordRevisionService(this.ctx.store, this.now).capture(queued,this.actor,'research-use');
          const saved=await this.ctx.store.update({envelope:{...queued,payload:{...object(queued.payload),frozenExecutionRef:revisionRef(frozen.recordId)}},message:`Freeze analysis execution ${recordId}`});
          if(!saved.success)throw new SequenceError(saved.error ?? 'Could not freeze execution.');
        }
        const run=await new AnalysisRunner(this.ctx).executeRun(recordId);
        const stored=object((await this.ctx.store.get(recordId))!.payload);
        return {...run,manifest:stored.outputManifest};
      }
      case 'interpret': return this.interpret(req,id);
      default: throw new SequenceError('Unsupported sequence action.');
    }
  }
  private actionParameterSchema(operation: string): unknown {
    const entry=this.ctx.schemaRegistry.getById(SEQUENCE_SCHEMA+'sequence-action.schema.yaml');
    const variants=object(entry?.schema).oneOf as Array<Record<string,any>>;
    return variants.find(x=>x.properties.operation.const===operation)?.properties.parameters;
  }
  private async interpret(req: Record<string,any>, id: (prefix:string)=>string): Promise<Record<string,unknown>> {
    const ruleRef=await this.pin(req.ruleRef,['sequence-interpretation-rule']);
    const revisions=new RecordRevisionService(this.ctx.store, this.now);
    const rule=(await revisions.read(ruleRef)).payload.snapshot as Record<string,any>;
    const contextRef=await this.pin(req.contextRef,['context']);
    const claim=await this.read(req.claimRef.id);
    if(object(claim.payload).kind !== 'claim') throw new SequenceError('Select a claim to evaluate.');
    const resultRef=await this.pin(req.resultRef,['analysis-output-artifact']);
    const result=(await revisions.read(resultRef)).payload.snapshot;
    const producingRun=object((await this.read(String(object(result.runRef).id))).payload);
    if(producingRun.status !== 'succeeded')throw new SequenceError('Evidence must come from a successfully completed analysis.');
    if(rule.layer==='observed') {
      const method=producingRun.frozenRevisionRef ? (await revisions.read(producingRun.frozenRevisionRef as {id:string})).payload.snapshot : object((await this.read(String(object(producingRun.revisionRef).id))).payload);
      if(method.sequenceMethod)throw new SequenceError('A sequence prediction cannot be used as an observed measurement.');
    }
    if(result.inlineValue === undefined) throw new SequenceError('Interpretation requires a small derived result artifact. Summarize the raw file in an analysis first.');
    const controls: Record<string,unknown>={};const controlRefs=[];
    for(const [name,ref] of Object.entries(req.controls)) {
      const pinned=await this.pin(ref as {id:string},['analysis-output-artifact']);controlRefs.push(pinned);
      controls[name]=(await revisions.read(pinned)).payload.snapshot.inlineValue;
    }
    let measurementContextRef;
    if(rule.layer === 'observed') {
      if(!req.measurementContextRef) throw new SequenceError('Observed evidence requires a measurement context.');
      measurementContextRef=await this.pin(req.measurementContextRef,['measurement-context']);
      const measurement=(await revisions.read(measurementContextRef)).payload.snapshot;
      if(object(measurement.assay_def_ref).id !== object(rule.assayRef).id) throw new SequenceError('Measurement context must identify the assay used by this rule.');
    }
    const facts={result:result.inlineValue,controls,context:(await revisions.read(contextRef)).payload.snapshot};
    const missing=(rule.requiredControls as string[]).filter(x=>!(x in controls));
    const valid=missing.length===0 && evaluatePredicate(rule.controlsPassWhen as Predicate,facts).result;
    const detected=evaluatePredicate(rule.detectedWhen as Predicate,facts).result;
    const absent=evaluatePredicate(rule.notDetectedWhen as Predicate,facts).result;
    const detection=!valid?'invalid':detected===absent?'indeterminate':detected?'detected':'not_detected';
    const assertionId=id('ASN');const evidenceId=id('EVD');
    const ref=(recordId:string,type:string)=>({kind:'record',id:recordId,type});
    const assertion={kind:'assertion',id:assertionId,statement:req.statement,claim_ref:{...req.claimRef,revisionRef:await this.pin(req.claimRef,['claim'])},scope:'single_context',context_refs:[{...req.contextRef,revisionRef:contextRef}],outcome:{detection,layer:rule.layer,interpretationRuleRef:ruleRef},evidence_refs:[ref(evidenceId,'evidence')]};
    // These are the ordinary knowledge records, preserving the explicit layer and source snapshots.
    await this.save(assertion,common+'assertion.schema.yaml');
    await this.save({kind:'evidence',id:evidenceId,[!valid||detection==='indeterminate'?'assesses':detection===rule.supportsOutcome?'supports':'refutes']:[ref(assertionId,'assertion')],sources:[{type:'result',ref:resultRef},{type:'context',ref:contextRef},{type:'file',ref:ruleRef},...controlRefs.map(ref=>({type:'result',ref})),...(measurementContextRef?[{type:'measurement_context',ref:measurementContextRef}]:[])],assessment:!valid||detection==='indeterminate'?'inconclusive':detection===rule.supportsOutcome?'supports':'refutes',quality:{detection,missingControls:missing,layer:rule.layer,contextAssignment:'user-declared'}},common+'evidence.schema.yaml');
    return {assertionId,evidenceId,detection};
  }
}
