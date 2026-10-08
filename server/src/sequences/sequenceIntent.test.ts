import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { sequenceIntentTool } from './sequenceIntent.js';
import { AGENT_INTENT_TOOL_DEF, parseAgentIntentArgs } from '../ai/submitSuggestionTool.js';
import { createAgentOrchestrator } from '../ai/AgentOrchestrator.js';
import type { InferenceClient, ToolBridge } from '../ai/types.js';
const schema=parse(await readFile(new URL('../../../schema/bio/sequence-action.schema.yaml',import.meta.url),'utf8'));
it.each([true,false])('repairs a schema-valid replay of the old probe for a new primer (repair succeeds: %s)',async succeeds=>{
 const old={operation:'create_oligo',requestId:'old-probe',sequence:{label:'FAM-QSY probe',residues:'AATGGCATGACTGAGTCGATG',alphabet:'dna',topology:'linear'},modifications:[{position:'5-prime',label:'FAM',role:'reporter'}]};
 const primer={operation:'create_oligo',requestId:'new-primer',sequence:{label:'F prausnitzii DNA gyrase forward primer, starts at bp 1146',residues:'ATGCGCGTAGGTCTGATGCTAGT',alphabet:'dna',topology:'linear'},modifications:[]};
 const requests:any[]=[];
 const inference={async *completeStream(request:any){requests.push(structuredClone(request));const proposal=succeeds&&requests.length>1?primer:old;yield {id:'test',choices:[{index:0,delta:{role:'assistant',tool_calls:[{id:'seq',type:'function',function:{name:'agent_intent',arguments:JSON.stringify({intent:'sequence_action',sequenceAction:proposal})}}]},finish_reason:'tool_calls'}]};}} as unknown as InferenceClient;
 const bridge={getToolDefinitions:()=>[],executeTool:vi.fn()} as unknown as ToolBridge;
 const agent=createAgentOrchestrator(inference,bridge,{baseUrl:'http://test',model:'test'},{draftFlowMode:'forced-tool'},{sequenceActionSchema:schema,validateSequenceAction:()=>({valid:true})});
 const prompt=`Add a primer sequence ${primer.sequence.residues} that is a forwadr primer for F prausnitzii DNA gyrase that starts at BP 1146`;
 const result=await agent.run({prompt,surface:'sequences',history:[{role:'user',content:'Add the FAM QSY probe.'},{role:'assistant',content:'Proposal ready.'}],context:{labwares:[],eventSummary:'',vocabPackId:'general',availableVerbs:[],workingForm:old} as any});
 expect(requests).toHaveLength(succeeds?2:3);
 expect(requests[0].messages[0].content).toContain('Start a fresh object');
 expect(requests[0].messages.at(-1).content).toContain(prompt);
 expect(requests[1].messages.find((m:any)=>m.role==='tool').content).toContain('latest request');
 if(succeeds)expect(result).toMatchObject({success:true,sequenceProposal:primer});
 else {expect(result.success).toBe(false);expect(result.sequenceProposal).toBeUndefined();expect(result.error).toContain('Nothing was saved');}
 expect(bridge.executeTool).not.toHaveBeenCalled();
});
describe('sequence actions in the existing chat emission',()=>{
 it('extends the single tool from the YAML operation vocabulary without mutating the original',()=>{
  const tool=sequenceIntentTool(AGENT_INTENT_TOOL_DEF,schema);
  expect(tool.function.name).toBe('agent_intent');
  expect((tool.function.parameters as any).properties.sequenceAction.oneOf.map((v:any)=>v.properties.operation.const)).toEqual(schema.oneOf.map((s:any)=>s.properties.operation.const));
  expect((AGENT_INTENT_TOOL_DEF.function.parameters as any).properties.intent.enum).not.toContain('sequence_action');
  expect(parseAgentIntentArgs({intent:'sequence_action'}).intent).toBe('sequence_action');
 });
 it('returns a validated proposal without compiling an event graph or writing records',async()=>{
  const proposal={operation:'save_sequence',requestId:'test',sequence:{label:'Primer',alphabet:'dna',topology:'linear',residues:'ACGT'}};
  const complete=vi.fn().mockResolvedValue({message:{role:'assistant',content:'',tool_calls:[{id:'seq',type:'function',function:{name:'agent_intent',arguments:JSON.stringify({intent:'sequence_action',sequenceAction:proposal})}}]},usage:{prompt_tokens:10,completion_tokens:10}});
  const inference={complete,async *completeStream(){const result=await complete();yield {id:'test',choices:[{index:0,delta:result.message,finish_reason:'tool_calls'}]};}} as unknown as InferenceClient;
  const bridge={getToolDefinitions:()=>[],executeTool:vi.fn()} as unknown as ToolBridge;
  const store={create:vi.fn(),update:vi.fn(),get:vi.fn()} as any;
  const validate=vi.fn().mockReturnValue({valid:true});
  const orchestrator=createAgentOrchestrator(inference,bridge,{baseUrl:'http://test',model:'test'},{draftFlowMode:'forced-tool'},{store,sequenceActionSchema:schema,validateSequenceAction:validate});
  const result=await orchestrator.run({prompt:'Save this sequence',surface:'sequences',context:{labwares:[],eventSummary:'',vocabPackId:'general',availableVerbs:[]}});
  expect(result).toMatchObject({success:true,sequenceProposal:proposal});expect(validate).toHaveBeenCalledWith(proposal);
  expect(store.create).not.toHaveBeenCalled();expect(store.update).not.toHaveBeenCalled();expect(bridge.executeTool).not.toHaveBeenCalled();
 });
});

it('provides a resolved sequence contract for local model context',async()=>{
 const {createSchemaRegistry}=await import('../schema/SchemaRegistry.js');const {loadAllSchemas}=await import('../schema/SchemaLoader.js');const {fileURLToPath}=await import('node:url');
 const {sequenceActionPromptSchema,sequenceContractSummary}=await import('./sequenceIntent.js');
 const registry=createSchemaRegistry();registry.addSchemas((await loadAllSchemas({basePath:fileURLToPath(new URL('../../../schema',import.meta.url)),recursive:true})).entries);
 const expanded=sequenceContractSummary(sequenceActionPromptSchema(registry));console.log('Sequence action contract characters:',expanded.length);
 const emitted=sequenceIntentTool(AGENT_INTENT_TOOL_DEF,sequenceActionPromptSchema(registry));
 const shape=JSON.stringify((emitted.function.parameters as any).properties.sequenceAction);
 expect(shape).not.toContain('"$ref"');
 // A predicate can have a field named pattern; it must not be a regex constraint.
 expect(shape).not.toMatch(/"pattern"\s*:\s*"/);
 expect(shape).toContain('"position"');expect(shape).toContain('"role"');
 expect(expanded).toContain('save_readout');expect(expanded).toContain('maxMismatches');expect(expanded).not.toContain('"$ref":"http');expect(expanded.length).toBeLessThan(25000);
});

it.each([true,false])('repairs an invalid oligo proposal without executing it (correction succeeds: %s)',async(succeeds)=>{
 const {createSchemaRegistry}=await import('../schema/SchemaRegistry.js');const {loadAllSchemas}=await import('../schema/SchemaLoader.js');const {fileURLToPath}=await import('node:url');const {createValidator}=await import('../validation/AjvValidator.js');
 const {sequenceActionPromptSchema}=await import('./sequenceIntent.js');
 const registry=createSchemaRegistry();registry.addSchemas((await loadAllSchemas({basePath:fileURLToPath(new URL('../../../schema',import.meta.url)),recursive:true})).entries);
 const validator=createValidator();for(const id of registry.getTopologicalOrder())validator.addSchema(registry.getById(id)!.schema,id);
 const invalid={operation:'save_oligo',requestId:'probe',oligo:{modifications:[{type:'reporter',dye:'FAM'}]}};
 const valid={operation:'create_oligo',requestId:'probe',sequence:{label:'FAM-QSY probe',residues:'AATGGCATGACTGAGTCGATG',alphabet:'dna',topology:'linear'},modifications:[{position:'5-prime',label:'FAM',role:'reporter'},{position:'3-prime',label:'QSY',role:'quencher'}]};
 const requests:any[]=[];
 const inference={async *completeStream(request:any){requests.push(structuredClone(request));const proposal=requests.length>1&&succeeds?valid:invalid;yield {id:'test',choices:[{index:0,delta:{role:'assistant',content:'',tool_calls:[{id:'seq',type:'function',function:{name:'agent_intent',arguments:JSON.stringify({intent:'sequence_action',sequenceAction:proposal})}}]},finish_reason:'tool_calls'}]};}} as unknown as InferenceClient;
 const bridge={getToolDefinitions:()=>[],executeTool:vi.fn()} as unknown as ToolBridge;const store={create:vi.fn(),update:vi.fn(),get:vi.fn()} as any;
 const expanded=sequenceActionPromptSchema(registry);
 const orchestrator=createAgentOrchestrator(inference,bridge,{baseUrl:'http://test',model:'test'},{draftFlowMode:'forced-tool'},{store,sequenceActionSchema:expanded,validateSequenceAction:data=>validator.validate(data,'https://computable-lab.com/schema/bio/sequence-action.schema.yaml')});
 const result=await orchestrator.run({prompt:'Add probe AATGGCATGACTGAGTCGATG with FAM and Thermo QSY',surface:'sequences',context:{labwares:[],eventSummary:'',vocabPackId:'general',availableVerbs:[]}});
 expect(requests).toHaveLength(succeeds?2:3);
 expect(requests[0].messages[0].content).toContain('New primer/probe bases plus modifications use create_oligo');expect(requests[0].messages[0].content).toContain('Example FAM-QSY probe');
 const feedback=requests[1].messages.find((m:any)=>m.role==='tool').content;expect(feedback).toContain('create_oligo');expect(feedback).not.toContain('endpointRef');
 if(succeeds)expect(result).toMatchObject({success:true,sequenceProposal:valid});else {expect(result.success).toBe(false);expect(result.error).toContain('Nothing was saved');expect(result.error!.length).toBeLessThan(500);}
 expect(store.create).not.toHaveBeenCalled();expect(store.update).not.toHaveBeenCalled();expect(bridge.executeTool).not.toHaveBeenCalled();
});

it.each(['json','encoded_action','prose_then_tool','prose_only'])('requires a validated sequence proposal when tool selection is automatic: %s',async(mode)=>{
 const proposal={operation:'create_oligo',requestId:'automatic-tool',sequence:{label:'Probe',residues:'AATGGCATGACTGAGTCGATG',alphabet:'dna',topology:'linear'},modifications:[{position:'5-prime',label:'FAM',role:'reporter'},{position:'3-prime',label:'QSY',role:'quencher'}]};
 let calls=0;const inference={async *completeStream(){calls++;const native=mode==='encoded_action'||mode==='prose_then_tool'&&calls>1;const args={intent:'sequence_action',sequenceAction:mode==='encoded_action'?JSON.stringify(proposal):proposal};yield {id:'test',choices:[{index:0,delta:{role:'assistant',content:mode==='json'?JSON.stringify(args):native?'':'I can help with that.',...(native?{tool_calls:[{id:'seq',type:'function',function:{name:'agent_intent',arguments:JSON.stringify(args)}}]}:{})},finish_reason:native?'tool_calls':'stop'}]};}} as unknown as InferenceClient;
 const bridge={getToolDefinitions:()=>[],executeTool:vi.fn()} as unknown as ToolBridge;const store={create:vi.fn(),update:vi.fn(),get:vi.fn()} as any;const validate=vi.fn().mockReturnValue({valid:true});
 const agent=createAgentOrchestrator(inference,bridge,{baseUrl:'http://test',model:'test'},{draftFlowMode:'forced-tool'},{store,sequenceActionSchema:schema,validateSequenceAction:validate});
 const result=await agent.run({prompt:'Create a FAM-QSY probe',surface:'sequences',context:{labwares:[],eventSummary:'',vocabPackId:'general',availableVerbs:[]}});
 if(mode==='prose_only'){expect(calls).toBe(3);expect(result.success).toBe(false);expect(result.error).toContain('Nothing was saved');expect(validate).not.toHaveBeenCalled();}
 else{expect(result).toMatchObject({success:true,sequenceProposal:proposal});expect(validate).toHaveBeenCalledWith(proposal);expect(calls).toBe(mode==='prose_then_tool'?2:1);}
 expect(store.create).not.toHaveBeenCalled();expect(store.update).not.toHaveBeenCalled();expect(bridge.executeTool).not.toHaveBeenCalled();
});
