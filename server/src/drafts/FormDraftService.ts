import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';
import { contentHash, object, token, withRecordLock } from '../revisions/RecordRevisionService.js';
import { draftAdapters } from './adapters.js';
import { CompilerKernel } from '../compiler/CompilerKernel.js';
import type { CompilationResult, CompilerDiagnostic } from '../compiler/types.js';
import { PassRegistry } from '../compiler/pipeline/PassRegistry.js';
import { loadPipeline } from '../compiler/pipeline/PipelineLoader.js';
import { runPipeline, type PassStatusEntry } from '../compiler/pipeline/PipelineRunner.js';
import { DEFAULT_CONFIG as DEFAULT_APP_CONFIG } from '../config/types.js';
import { stagingStore } from './StagingStore.js';

export class DraftError extends Error {constructor(message:string,public status=422){super(message)}}

const schemaId = 'https://computable-lab.com/schema/computable-lab/form-draft.schema.yaml';
const pipelinePath = fileURLToPath(new URL('../../../schema/registry/compile-pipelines/form-draft-compile.yaml', import.meta.url));
interface AdapterSpec { domain: string; operations: string[]; projection: Record<string,string> }
interface DraftInput { adapter: string; intent: Record<string,unknown>; userRequest?: string; target?: { recordId: string; contentHash?: string } }
interface DraftRecord {
  kind: 'form-draft'; id: string; actor: string; revision: number; createdAt: string;
  status: 'review'|'incomplete'|'accepted'; input: DraftInput; compiled: CompiledDraft;
}
export interface CompiledDraft extends CompilationResult {
  draftId: string; revision: number; reviewHash: string; canAccept: boolean;
  projection: Record<string,unknown>; writes: RecordEnvelope[]; reads: Record<string,string>;
  result: Record<string,unknown>; trace: PassStatusEntry[];
}
const adapters = () => (parse(readFileSync(new URL('../../../config/drafting/adapters.yaml', import.meta.url),'utf8')) as {adapters:Record<string,AdapterSpec>}).adapters;

export class FormDraftService {
  constructor(private ctx: AppContext, private actor: string) {}
  private async authorizedRead(id:string) {
    const record=await this.ctx.store.get(id);
    if(!record)throw new DraftError(`Source ${id} changed or was removed.`,409);
    if(this.ctx.authorizationService && !await this.ctx.authorizationService.canAccess(this.actor,'read',record))throw new DraftError('Record access denied.',403);
    return record;
  }
  private async read(id: string) {
    const env = await this.ctx.store.get(id);
    if (!env || object(env.payload).kind !== 'form-draft') throw new DraftError('Draft not found.',404);
    const draft = env.payload as DraftRecord;
    if (draft.actor !== this.actor) throw new DraftError('Draft access is restricted to its actor.',403);
    return {env,draft};
  }
  private async persist(draft: DraftRecord, previous?: RecordEnvelope) {
    const envelope = {recordId:draft.id,schemaId,payload:draft};
    if(this.ctx.authorizationService && !await this.ctx.authorizationService.ensureOwnerPolicy(envelope,this.actor))throw new DraftError('Could not preserve draft access policy.',503);
    const result = previous
      ? await this.ctx.store.update({envelope, ...(token(previous)?{expectedSha:token(previous)!}:{}),actor:this.actor})
      : await this.ctx.store.create({envelope});
    if (!result.success) throw new DraftError(result.error ?? 'Could not save draft history.',409);
  }
  private validate(raw:unknown, action:'compile'|'accept') {
    const result=this.ctx.validator.validate(raw,`https://computable-lab.com/schema/computable-lab/form-draft-request.schema.yaml#/$defs/${action}`);
    if(!result.valid)throw new DraftError(result.errors?.map(e=>`${e.path}: ${e.message}`).join('; ')??'Invalid draft request.');
  }
  async compile(raw: unknown): Promise<CompiledDraft> {
    this.validate(raw,'compile');
    const body = object(raw);
    const adapter = adapters()[String(body.adapter)];
    if (!adapter || !draftAdapters[String(body.adapter)]) throw new DraftError('Unknown form draft adapter.');
    const intent = object(body.intent);
    if (!adapter.operations.includes(String(intent.operation))) throw new DraftError('This operation is not registered for form authoring.');
    const id = typeof body.draftId === 'string' ? body.draftId : `DRAFT-${randomUUID()}`;
    return withRecordLock(this.ctx.store,id,async()=>{
      const prior = body.draftId ? await this.read(id) : undefined;
      if (prior && (prior.draft.revision !== body.revision || prior.draft.status !== 'review')) throw new DraftError('Draft changed or is already being saved. Review the current draft.',409);
      const target = object(body.target);
      const input: DraftInput = {adapter:String(body.adapter),intent:structuredClone(intent),
        ...(typeof body.userRequest==='string'?{userRequest:body.userRequest}:{}),
        ...(typeof target.recordId==='string'?{target:{recordId:target.recordId,...(typeof target.contentHash==='string'?{contentHash:target.contentHash}:{})}}:{})};
      if(prior && prior.draft.input.target?.recordId !== input.target?.recordId) throw new DraftError('Draft target changed. Start a new draft.',409);
      if(prior?.draft.input.target && input.target)input.target=prior.draft.input.target;
      const draft = {kind:'form-draft' as const,id,actor:this.actor,revision:(prior?.draft.revision??0)+1,createdAt:prior?.draft.createdAt??new Date().toISOString(),status:'review' as const,input};
      const compiled = await this.evaluate(draft,adapter);
      if(input.target && !input.target.contentHash && compiled.reads[input.target.recordId])input.target.contentHash=compiled.reads[input.target.recordId]!;
      await this.persist({...draft,compiled},prior?.env);
      return compiled;
    });
  }
  private async evaluate(draft: Omit<DraftRecord,'compiled'>, adapter: AdapterSpec, hidden: Set<string> = new Set()): Promise<CompiledDraft> {
    const stage = stagingStore(this.ctx.store,hidden);
    // Authoring runs against a store with staged creates and no executable/update capabilities.
    // Only staged records get owner access; canonical reads use the ordinary authorization service.
    const context: AppContext = {...this.ctx,store:new Proxy(this.ctx.store,{
      get:(_target,key)=>{
        if(key in stage.store)return stage.store[key as keyof typeof stage.store];
        throw new Error(`Store capability ${String(key)} is unavailable during compilation.`);
      },
    }),...(this.ctx.authorizationService?{authorizationService:new Proxy(this.ctx.authorizationService,{
      get:(_target,key)=>{
        if(key==='canAccess')return async(actor:string,action:Parameters<AppContext['authorizationService']['canAccess']>[1],record:RecordEnvelope)=>stage.owns(record)||this.ctx.authorizationService.canAccess(actor,action,record);
        if(key==='ensureOwnerPolicy')return async()=>null;
        throw new Error(`Authorization capability ${String(key)} is unavailable during compilation.`);
      },
    })}:{})};
    const authoring = draftAdapters[draft.input.adapter]!;
    const diagnostics: CompilerDiagnostic[] = [];
    let result: Record<string,unknown> = {};
    const intent = structuredClone(draft.input.intent);
    // Request IDs originate at the compiler, never from an untrusted model.
    intent.requestId = `${draft.id}-${draft.revision}`;
    let compilation: CompilationResult;
    const registry = new PassRegistry();
    registry.register({id:'stage_authoring',family:'normalize',run:async()=>{
      try {
        const fidelity = authoring.checkRequest?.(intent, draft.input.userRequest) ?? [];
        if(fidelity.length)throw new DraftError(fidelity.map(d=>`${d.path}: ${d.message}`).join('; '));
        if(draft.input.target){
          const target = await this.authorizedRead(draft.input.target.recordId);
          if(draft.input.target.contentHash && contentHash(target.payload)!==draft.input.target.contentHash) throw new DraftError('Source changed. Reload and review the draft.',409);
        }
        result = await authoring.stage(context,this.actor,intent,draft.input.target?.recordId,()=>draft.createdAt);
      } catch(error) {
        diagnostics.push({code:'DRAFT_INVALID',stage:'normalize',severity:'error',outcome:'needs-missing-fact',message:(error as Error).message});
      }
      return {ok:true,output:{intent}};
    }});
    registry.register({id:'evaluate_draft',family:'validate',run:()=>{
      const bundleId = this.ctx.appConfig?.lab?.policyBundleId ?? DEFAULT_APP_CONFIG.lab?.policyBundleId ?? 'POL-SANDBOX';
      const bundle = this.ctx.policyBundleService?.getBundle(bundleId);
      if(!bundle) diagnostics.push({code:'DRAFT_POLICY_MISSING',stage:'policy',severity:'error',outcome:'policy-blocked',message:`Policy bundle ${bundleId} is unavailable.`});
      const scope = {organizationId:bundleId};
      compilation = new CompilerKernel().evaluateRequest({
        normalizedIntent:{domain:adapter.domain,intentId:draft.id,version:'1',summary:'Review native form authoring',payload:intent,requiredFacts:[]},
        candidateBindings:[...stage.writes.values()].map(w=>({bindingId:w.recordId,slot:w.recordId,candidateType:String(object(w.payload).kind),candidateId:w.recordId,resolution:'new-record',payload:w.payload,provenance:[{kind:'user-input',id:draft.id}]})),
        plan:{planId:`${draft.id}-${draft.revision}`,steps:[...stage.writes.values()],requiresOperator:true},
        policyProfiles:bundle?[{id:bundle.id,scope:'organization',scopeId:bundleId,settings:bundle.settings}]:[],activeScope:scope,diagnostics,
        provenance:{actor:this.actor,sources:[...stage.reads.keys()].map(id=>({kind:'record',id}))},
      });
      return {ok:true,output:compilation};
    }});
    let projection: Record<string,unknown> = {};
    registry.register({id:'project_form',family:'project',run:()=>{
      projection = Object.fromEntries(Object.entries(adapter.projection).filter(([,key])=>intent[key]!==undefined).map(([field,key])=>[field,intent[key]]));
      projection = authoring.project(projection,[...stage.writes.values()]);
      return {ok:true,output:projection};
    }});
    const pipeline = await runPipeline(loadPipeline(pipelinePath),registry,{intent});
    if(!pipeline.ok || !compilation!) throw new DraftError(pipeline.diagnostics.map(x=>x.message).join('; ')||'Draft compilation failed.');
    const canAccept = compilation!.diagnostics.every(d=>d.severity!=='error' && !['policy-blocked','execution-blocked','needs-missing-fact'].includes(d.outcome))
      && compilation!.policy.decisions.every(d=>d.disposition==='allowed');
    const stable = {intent,projection,writes:[...stage.writes.values()],reads:Object.fromEntries(stage.reads),policy:compilation!.policy,result,diagnostics:compilation!.diagnostics};
    return {...compilation!,draftId:draft.id,revision:draft.revision,reviewHash:contentHash(stable),canAccept,projection,writes:stable.writes,reads:stable.reads,result,trace:pipeline.pass_statuses};
  }
  async accept(raw: unknown): Promise<Record<string,unknown>> {
    this.validate(raw,'accept');
    const body = object(raw);const id = String(body.draftId);
    return withRecordLock(this.ctx.store,id,async()=>{
      let {env,draft} = await this.read(id);
      if(draft.revision!==body.revision || draft.compiled.reviewHash!==body.reviewHash) throw new DraftError('Draft changed. Review the current revision before accepting.',409);
      if(draft.status==='accepted') return draft.compiled.result;
      const lockSources=async<T>(ids:string[],fn:()=>Promise<T>):Promise<T>=>ids.length?withRecordLock(this.ctx.store,`write:${ids[0]}`,()=>lockSources(ids.slice(1),fn)):fn();
      return lockSources(Object.keys(draft.compiled.reads).sort(),async()=>{
      if(!draft.compiled.canAccept) throw new DraftError('Draft is blocked. Correct the validation or policy diagnostics.');
      for(const [source,hash] of Object.entries(draft.compiled.reads)){
        const record=await this.authorizedRead(source);
        if(contentHash(record.payload)!==hash) throw new DraftError('Source changed. Reload and review the draft.',409);
      }
      const adapter=adapters()[draft.input.adapter];
      if(!adapter || !adapter.operations.includes(String(draft.input.intent.operation))) throw new DraftError('Draft adapter is no longer available.');
      const compiled=await this.evaluate(draft,adapter,new Set(draft.compiled.writes.map(w=>w.recordId)));
      if(!compiled.canAccept || compiled.reviewHash!==body.reviewHash) throw new DraftError('Draft or policy changed. Recompile and review before accepting.',409);
      for(const write of compiled.writes){
        const prior=await this.ctx.store.get(write.recordId);
        if(prior && (prior.schemaId!==write.schemaId || contentHash(prior.payload)!==contentHash(write.payload)))throw new DraftError(`Record ${write.recordId} changed during save.`,409);
      }
      // No writes until the entire plan has passed schema/lint/policy validation again.
      await this.persist({...draft,status:'incomplete'},env);
      ({env,draft}=await this.read(id));
      try {
        for(const write of compiled.writes){
          const prior=await this.ctx.store.get(write.recordId);
          if(prior && (prior.schemaId!==write.schemaId || contentHash(prior.payload)!==contentHash(write.payload))) throw new DraftError(`Record ${write.recordId} changed during save.`,409);
          if(!prior){
            const saved=await this.ctx.store.create({envelope:write,message:`Accept draft ${id}`});
            if(!saved.success) throw new DraftError(saved.error??`Could not save ${write.recordId}`);
          }
          if(this.ctx.authorizationService && !await this.ctx.authorizationService.ensureOwnerPolicy(write,this.actor))throw new DraftError(`Could not preserve access policy for ${write.recordId}.`,503);
        }
        await this.persist({...draft,status:'accepted'},env);
        return compiled.result;
      }catch(error){throw new DraftError(`Save incomplete; retry Accept and save to finish the same draft. ${(error as Error).message}`,503);}
      });
    });
  }
}
