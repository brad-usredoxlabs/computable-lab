import { describe, it, expect, vi } from 'vitest'
import { NativeDraftController } from './nativeDraft'
const compiled=(input:any,revision=1)=>({draftId:'draft',revision,reviewHash:`h${revision}`,canAccept:true,projection:input.intent,diagnostics:[],writes:[]})
describe('native draft review state',()=>{
 it('starts a fresh draft when a new sequence replaces a derivative, retaining the reject baseline',async()=>{
  const api=vi.fn(async(body:any)=>compiled(body));const draft=new NativeDraftController(api,vi.fn());
  const before={sequence:{residues:'AATGGCATGACTGAGTCGATG'}};
  draft.propose(before,{sequence:before.sequence},{recordId:'REV-probe'});await draft.idle();
  const intent={sequence:{residues:'ATGCGCGTAGGTCTGATGCTAGT'}};
  draft.propose(before,intent,undefined,'Add primer ATGCGCGTAGGTCTGATGCTAGT');await draft.idle();
  expect(api.mock.calls[1][0]).toEqual({adapter:'sequence-authoring',intent,userRequest:'Add primer ATGCGCGTAGGTCTGATGCTAGT'});
  draft.edit({sequence:{residues:'TTTT'}});await draft.idle();
  expect(api.mock.calls[2][0]).not.toHaveProperty('userRequest');
  expect(draft.reject()).toEqual(before);
 });
 it('restores the unsaved baseline on reject and ignores a late compiler response',async()=>{
  let finish!:(v:any)=>void
  const api=vi.fn(()=>new Promise(r=>finish=r));const draft=new NativeDraftController(api,vi.fn())
  draft.propose({label:'unsaved'},{sequence:{label:'proposed'}})
  expect(draft.state.pending).toBe(true);expect(draft.reject()).toEqual({label:'unsaved'})
  finish(compiled({intent:{sequence:{label:'late'}}}));await draft.idle()
  expect(draft.state.active).toBe(false);expect(draft.state.compiled).toBeNull()
 })
 it('serializes rapid edits, preserves one draft, and only projects the latest response',async()=>{
  const finish:Array<(x:any)=>void>=[];const api=vi.fn((_body:any)=>new Promise(r=>finish.push(r)))
  const accept=vi.fn(async()=>({recordId:'saved'}));const draft=new NativeDraftController(api,accept)
  draft.propose({label:'before'},{sequence:{label:'first'}})
  draft.edit({sequence:{label:'latest'}})
  finish[0](compiled({intent:{sequence:{label:'first'}}}));await vi.waitFor(()=>expect(api).toHaveBeenCalledTimes(2))
  expect(draft.state.compiled).toBeNull();expect(api).toHaveBeenCalledTimes(2)
  expect(api.mock.calls[1][0]).toMatchObject({draftId:'draft',revision:1,intent:{sequence:{label:'latest'}}})
  finish[1](compiled({intent:{sequence:{label:'latest'}}},2));await draft.idle()
  expect(draft.state.compiled?.projection).toMatchObject({sequence:{label:'latest'}})
  expect(await draft.accept()).toEqual({recordId:'saved'});expect(accept).toHaveBeenCalledWith({draftId:'draft',revision:2,reviewHash:'h2'})
 })
 it('blocks acceptance while compiling or invalid and retains failed acceptance for retry',async()=>{
  const save=vi.fn().mockRejectedValueOnce(new Error('Save incomplete')).mockResolvedValueOnce({recordId:'saved'})
  const draft=new NativeDraftController(async b=>compiled(b),save)
  draft.propose({},{sequence:{label:'probe'}});await expect(draft.accept()).rejects.toThrow(/ready/)
  await draft.idle();await expect(draft.accept()).rejects.toThrow('Save incomplete')
  expect(draft.state.active).toBe(true);expect(draft.state.incomplete).toBe(true)
  expect(()=>draft.edit({})).toThrow(/retry/i);await draft.accept();expect(save).toHaveBeenCalledTimes(2)
 })
})
