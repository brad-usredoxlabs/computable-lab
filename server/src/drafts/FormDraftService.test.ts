import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
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
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import { object } from '../revisions/RecordRevisionService.js';
import type { AppContext } from '../server.js';
import { FormDraftService } from './FormDraftService.js';
let ctx: AppContext; let root: string; let service: FormDraftService;
beforeAll(async()=>{
 root=await mkdtemp(join(tmpdir(),'cl-form-drafts-'));
 const registry=createSchemaRegistry(); const loaded=await loadAllSchemas({basePath:fileURLToPath(new URL('../../../schema',import.meta.url)),recursive:true});
 expect(loaded.errors).toEqual([]);registry.addSchemas(loaded.entries);
 const validator=createValidator();for(const id of registry.getTopologicalOrder()){const entry=registry.getById(id);if(entry)validator.addSchema(entry.schema,id);}
 const store=createRecordStore(createLocalRepoAdapter({basePath:root}),validator,new LintEngine());
 const policyBundleService=new PolicyBundleService();policyBundleService.loadFromDir(fileURLToPath(new URL('../../../schema/core/policy-bundles',import.meta.url)));
 ctx={store,validator,schemaRegistry:registry,policyBundleService,workspaceRoot:root,recordsDir:root} as AppContext;service=new FormDraftService(ctx,'USR-test');
},30000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
const action={operation:'create_oligo',sequence:{label:'FAM-QSY probe',residues:'AATGGCATGACTGAGTCGATG',alphabet:'dna',topology:'linear'},vendor:'Thermo Fisher Scientific',modifications:[{position:'5-prime',label:'FAM',role:'reporter'},{position:'3-prime',label:'QSY',role:'quencher'}]};
const input=(intent:unknown=action)=>({adapter:'sequence-authoring',intent});
const accept=(draft:any)=>service.accept({draftId:draft.draftId,revision:draft.revision,reviewHash:draft.reviewHash});
async function canonical(){return (await ctx.store.list()).filter(r=>object(r.payload).kind!=='form-draft');}
describe('native form compilation and acceptance',()=>{
 it('blocks an old probe replay against the latest request, then accepts the corrected primer',async()=>{
  const userRequest='Add a primer sequence ATGCGCGTAGGTCTGATGCTAGT that is a forward primer for F prausnitzii DNA gyrase starting at BP 1146';
  const before=await canonical();
  const wrong=await service.compile({...input(),userRequest});
  expect(wrong.canAccept).toBe(false);expect(wrong.writes).toEqual([]);
  expect(wrong.diagnostics.some(d=>d.message.includes('latest request'))).toBe(true);
  await expect(accept(wrong)).rejects.toThrow(/blocked/);expect(await canonical()).toEqual(before);
  const primer={operation:'create_oligo',sequence:{...action.sequence,label:'F prausnitzii DNA gyrase forward primer, bp 1146',residues:'atgcgc gtaggtctgatgctagt'},modifications:[]};
  const corrected=await service.compile({...input(primer),userRequest,draftId:wrong.draftId,revision:wrong.revision});
  expect(corrected.canAccept).toBe(true);
  expect(corrected.projection).toMatchObject({sequence:{residues:'ATGCGCGTAGGTCTGATGCTAGT'},modifications:[]});
  const saved=await accept(corrected);
  expect((await ctx.store.get(String(saved.sequenceId)))?.payload).toMatchObject({residues:'ATGCGCGTAGGTCTGATGCTAGT',label:primer.sequence.label});
  // A deliberate native form edit supersedes the earlier literal request.
  const direct=await service.compile({...input({...primer,sequence:{...primer.sequence,residues:'AACG'}})});
  expect(direct.canAccept).toBe(true);
 });
 it('compiles without canonical writes and saves exactly the projected FAM/QSY fields once',async()=>{
  const before=await canonical();const draft=await service.compile(input());
  expect(await canonical()).toEqual(before);expect(draft.projection).toMatchObject({sequence:action.sequence,modifications:action.modifications});
  expect(draft.trace.every(x=>x.status==='ok')).toBe(true);expect(draft.canAccept).toBe(true);
  const [a,b]=await Promise.all([accept(draft),accept(draft)]);expect(a).toEqual(b);
  expect((await ctx.store.get(String(a.recordId)))?.payload).toMatchObject({modifications:action.modifications,vendor:action.vendor,createdBy:'USR-test'});
  expect((await ctx.store.get(String(a.sequenceId)))?.payload).toMatchObject({residues:action.sequence.residues,length:21});
  const after=await canonical();await accept(draft);expect(await canonical()).toEqual(after);
 });
 it('recompiles corrections, blocks old review hashes and restores acceptance after invalid edits',async()=>{
  const draft=await service.compile(input());
  const invalid=await service.compile({...input({...action,sequence:{...action.sequence,residues:'ZZ'}}),draftId:draft.draftId,revision:draft.revision});
  expect(invalid.canAccept).toBe(false);await expect(accept(invalid)).rejects.toThrow(/blocked|valid/i);
  await expect(accept(draft)).rejects.toThrow(/changed|stale/i);
  const corrected=await service.compile({...input({...action,sequence:{...action.sequence,label:'Corrected',residues:'AACG'}}),draftId:invalid.draftId,revision:invalid.revision});
  expect(corrected.canAccept).toBe(true);const result=await accept(corrected);
  expect((await ctx.store.get(String(result.sequenceId)))?.payload).toMatchObject({label:'Corrected',residues:'AACG'});
 });
 it('rejects a different actor, unknown adapters, and tool execution at compile',async()=>{
  const draft=await service.compile(input());
  await expect(new FormDraftService(ctx,'USR-other').accept({draftId:draft.draftId,revision:draft.revision,reviewHash:draft.reviewHash})).rejects.toThrow(/actor|access/i);
  await expect(service.compile({adapter:'unknown',intent:action})).rejects.toThrow(/adapter/i);
  await expect(service.compile(input({operation:'deploy_endpoint'}))).rejects.toThrow(/authoring|operation/i);
 });
 it('detects a stale source and does not capture its revision before acceptance',async()=>{
  const first=await service.compile(input({operation:'save_sequence',sequence:action.sequence}));const saved=await accept(first);
  const source=(await ctx.store.get(String(saved.recordId)))!;const before=await canonical();
  const draft=await service.compile({...input({operation:'save_sequence',sequence:{...action.sequence,label:'Derived'}}),target:{recordId:source.recordId}});
  expect(await canonical()).toEqual(before);
  await ctx.store.update({envelope:{...source,payload:{...object(source.payload),label:'Changed elsewhere'}}});
  await expect(accept(draft)).rejects.toThrow(/changed|stale/i);
 });
 it('retains incomplete state on storage failure and retries the exact plan without duplicates',async()=>{
  const draft=await service.compile(input());const create=ctx.store.create.bind(ctx.store);
  let fail=true;
  const spy=vi.spyOn(ctx.store,'create').mockImplementation(async options=>{
   if(object(options.envelope.payload).kind==='oligo-spec'&&fail){fail=false;return {success:false,error:'disk unavailable'};}
   return create(options);
  });
  await expect(accept(draft)).rejects.toThrow(/incomplete.*disk unavailable/i);
  expect(object((await ctx.store.get(draft.draftId))?.payload).status).toBe('incomplete');
  spy.mockRestore();const saved=await accept(draft);expect(saved.recordId).toBeTruthy();
  const after=await canonical();await accept(draft);expect(await canonical()).toEqual(after);
 });
});

it('rechecks policy changes and prevalidates every planned record before saving',async()=>{
 const draft=await service.compile(input());const before=await canonical();
 const original=ctx.policyBundleService.getBundle.bind(ctx.policyBundleService);
 const policy=vi.spyOn(ctx.policyBundleService,'getBundle').mockImplementation(id=>{const b=original(id);return b?{...b,settings:{...b.settings,allowAutoCreate:'deny'}}:undefined;});
 await expect(accept(draft)).rejects.toThrow(/policy changed/i);expect(await canonical()).toEqual(before);policy.mockRestore();
 const validate=ctx.store.validate.bind(ctx.store);
 const gate=vi.spyOn(ctx.store,'validate').mockImplementation(async envelope=>object(envelope.payload).kind==='oligo-spec'?{valid:false,errors:[{path:'/modifications',message:'Schema changed'}]}:validate(envelope));
 await expect(accept(draft)).rejects.toThrow(/changed/i);expect(await canonical()).toEqual(before);gate.mockRestore();
});
it('does not silently rebase an AI revision after its source changed',async()=>{
 const first=await service.compile(input({operation:'save_sequence',sequence:action.sequence}));const saved=await accept(first);
 const source=(await ctx.store.get(String(saved.recordId)))!;
 const draft=await service.compile({...input({operation:'save_sequence',sequence:action.sequence}),target:{recordId:source.recordId}});
 await ctx.store.update({envelope:{...source,payload:{...object(source.payload),label:'New external label'}}});
 const revised=await service.compile({...input({operation:'save_sequence',sequence:{...action.sequence,label:'AI revision'}}),target:{recordId:source.recordId},draftId:draft.draftId,revision:draft.revision});
 expect(revised.canAccept).toBe(false);expect(revised.diagnostics.some(d=>d.message.includes('Source changed'))).toBe(true);
});
it('enforces reference authorization even when a draft is otherwise schema-valid',async()=>{
 const first=await service.compile(input({operation:'save_sequence',sequence:action.sequence}));const saved=await accept(first);
 const auth={canAccess:vi.fn(async()=>false),ensureOwnerPolicy:vi.fn(async()=>({recordId:'ACL-TEST'}))};
 const denied=new FormDraftService({...ctx,authorizationService:auth} as unknown as AppContext,'USR-denied');
 const before=await canonical();
 const draft=await denied.compile({...input({operation:'save_sequence',sequence:action.sequence}),target:{recordId:String(saved.recordId)}});
 expect(draft.canAccept).toBe(false);expect(draft.diagnostics.some(d=>/access denied/i.test(d.message))).toBe(true);expect(await canonical()).toEqual(before);
});
it('keeps owner-policy failures incomplete and recovers them on retry',async()=>{
 const {AuthorizationService}=await import('../security/AuthorizationService.js');
 const authorizationService=new AuthorizationService(ctx.store);
 const secured=new FormDraftService({...ctx,authorizationService},'USR-ACLTEST');
 const draft=await secured.compile(input());
 const original=authorizationService.ensureOwnerPolicy.bind(authorizationService);let fail=true;
 const spy=vi.spyOn(authorizationService,'ensureOwnerPolicy').mockImplementation(async(record,actor)=>{
  if(object(record.payload).kind==='sequence'&&fail){fail=false;return null;}
  return original(record,actor);
 });
 const request={draftId:draft.draftId,revision:draft.revision,reviewHash:draft.reviewHash};
 await expect(secured.accept(request)).rejects.toThrow(/incomplete.*access policy/i);
 spy.mockRestore();const result=await secured.accept(request);expect(result.recordId).toBeTruthy();
 expect(await authorizationService.canAccess('USR-OTHER','read',(await ctx.store.get(String(result.recordId)))!)).toBe(false);
});
