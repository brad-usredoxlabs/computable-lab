import type { ToolDefinition } from '../ai/types.js';
import { readFileSync } from 'node:fs';
export const sequenceAuthoringGuidance = readFileSync(new URL('../../prompts/sequence-authoring.md', import.meta.url), 'utf8');
/** Extend the existing forced emission tool. The action vocabulary comes from its YAML schema. */
export function sequenceIntentTool(base: ToolDefinition, schema: Record<string,any>): ToolDefinition {
 const tool=structuredClone(base);const parameters=tool.function.parameters as Record<string,any>;
 parameters.properties.intent.enum.push('sequence_action');
 // Local grammar engines do not consistently support $defs or arbitrary regexes.
 // Supply inline structural guidance; Ajv still enforces the complete canonical schema.
 function toolShape(value:any):any {
   if(Array.isArray(value))return value.map(toolShape);
   if(!value||typeof value!=='object')return value;
   const result:Record<string,unknown>={};
   for(const key of ['type','enum','const','required'])if(value[key]!==undefined)result[key]=value[key];
   if(value.additionalProperties!==undefined)result.additionalProperties=toolShape(value.additionalProperties);
   if(value.const!==undefined&&!value.type)result.type=typeof value.const;
   if(value.properties)result.properties=Object.fromEntries(Object.entries(value.properties).map(([k,v])=>[k,toolShape(v)]));
   for(const key of ['items','oneOf','anyOf'])if(value[key])result[key]=toolShape(value[key]);
   return result;
 }
 parameters.properties.sequenceAction={description:'One proposal for the latest user request. New primers/probes use create_oligo (modifications: [] when unmodified). New objects do not inherit the displayed sequence, dyes or parentRevisionRef. Only explicit revisions use context.workingForm/context.draft to preserve unchanged fields. Nothing executes until accepted.',oneOf:schema.oneOf.map(toolShape)};
 tool.function.description += ' Choose sequence_action for sequence editing, assay setup, analysis endpoint configuration, sequence analysis, order import or contextual interpretation.';
 return tool;
}
export function sequenceContractSummary(schema:Record<string,any>):string {
 const actions=schema.oneOf.map((variant:any)=>({operation:variant.properties.operation.const,required:variant.required,fields:variant.properties,...(variant.description?{description:variant.description}:{}),...(variant.examples?{examples:variant.examples}:{})}));
 // Repeated reference/record structures otherwise dominate a local model's context.
 const counts=new Map<string,number>();
 const eligible=(v:any)=>v && typeof v==='object' && !Array.isArray(v) && (v.type || v.anyOf || v.oneOf || v.allOf);
 function count(v:any):void {if(!v||typeof v!=='object')return;if(eligible(v)){const key=JSON.stringify(v);if(key.length>250)counts.set(key,(counts.get(key)??0)+1);}Object.values(v).forEach(count);}
 count(actions);const names=new Map([...counts].filter(([,n])=>n>1).map(([key],i)=>[key,`sequenceShape${i+1}`]));
 const definitions:Record<string,unknown>={};
 function compact(v:any,skip?:string):any {if(!v||typeof v!=='object')return v;if(Array.isArray(v))return v.map(x=>compact(x));const key=eligible(v)?JSON.stringify(v):'';const name=names.get(key);if(name&&name!==skip){if(!(name in definitions)){definitions[name]={};definitions[name]=compact(v,name);}return {$ref:`#/$defs/${name}`};}return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,compact(x)]));}
 const result=compact(actions);return JSON.stringify({actions:result,$defs:definitions});
}
/** Resolve record-field references for model context using the already loaded schema registry. */
export function sequenceActionPromptSchema(registry:import('../schema/SchemaRegistry.js').SchemaRegistry):Record<string,unknown> {
 const id='https://computable-lab.com/schema/bio/sequence-action.schema.yaml';
 function expand(value:any,base:string,seen:Set<string>):any {
  if(Array.isArray(value))return value.map(x=>expand(x,base,seen));
  if(!value||typeof value!=='object')return value;
  if(value.$ref && String(value.$ref).endsWith('#/$defs/FAIRCommon'))return {description:'Session authorship and timestamps are supplied by the server.'};
  if(value.$ref) {
   const url=new URL(value.$ref,base);const ref=url.toString();const root=url.origin+url.pathname;
   if(seen.has(ref))return {description:'Nested predicate using the same declarative lint operators.'};
   let target=registry.getById(root)?.schema as any;
   if(url.hash)for(const key of url.hash.slice(2).split('/'))target=target?.[key.replace(/~1/g,'/').replace(/~0/g,'~')];
   if(target)return expand(target,root,new Set([...seen,ref]));
  }
  const output:Record<string,unknown>={};
  for(const [k,v] of Object.entries(value))if(!['$schema','$id','$defs','title','readOnly','examples','description'].includes(k))output[k]=expand(v,base,seen);
  return output;
 }
 const original=registry.getById(id)!.schema as Record<string,any>;
 const expanded=expand(original,id,new Set());
 expanded.oneOf.forEach((variant:any,i:number)=>{for(const key of ['description','examples'])if(original.oneOf[i][key])variant[key]=original.oneOf[i][key];});
 return expanded;
}

/** Some provider tool adapters encode a nested object as a JSON string.
 * Decode only this transport wrapper; the authoritative validator checks its contents.
 */
export function decodeSequenceAction(value: unknown): unknown {
 if(typeof value!=='string')return value;
 try {return JSON.parse(value) as unknown;} catch {return value;}
}
