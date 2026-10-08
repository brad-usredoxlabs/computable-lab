import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInferenceClient} from './InferenceClient.js';
import type {CompletionRequest} from './types.js';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;vi.restoreAllMocks();});
const tools=[{type:'function' as const,function:{name:'agent_intent',parameters:{type:'object'},description:'Propose'}},{type:'function' as const,function:{name:'other',parameters:{type:'object'},description:'Other'}}];
const request:CompletionRequest={model:'qwen/qwen3.5-plus',messages:[{role:'user',content:'Propose a probe'}],tools,tool_choice:{type:'function',function:{name:'agent_intent'}},max_tokens:4096,cache_key:'local',cache_prompt:true,id_slot:2};
const config={baseUrl:'https://openrouter.ai/api/v1',model:request.model,enableThinking:true};
const response={id:'ok',choices:[{index:0,message:{role:'assistant',content:null,tool_calls:[{id:'call',type:'function',function:{name:'agent_intent',arguments:'{}'}}]},finish_reason:'tool_calls'}]};
const sse=()=>new Response(`data: ${JSON.stringify({id:'ok',choices:[{index:0,delta:response.choices[0]!.message,finish_reason:'tool_calls'}]})}\n\ndata: [DONE]\n\n`);
const collect=async(client:ReturnType<typeof createInferenceClient>,r=request)=>{const chunks=[];for await(const c of client.completeStream(r))chunks.push(c);return chunks;};
describe('OpenRouter provider compatibility',()=>{
 it.each([false,true])('maps reasoning and restricts an automatic Qwen tool choice (stream=%s)',async(stream)=>{
  const bodies:any[]=[];globalThis.fetch=vi.fn(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return stream?sse():new Response(JSON.stringify(response));});
  const client=createInferenceClient(config);if(stream)await collect(client);else await client.complete(request);
  expect(bodies).toHaveLength(1);expect(bodies[0]).toMatchObject({tool_choice:'auto',tools:[tools[0]],reasoning:{enabled:true},max_tokens:4096});
  for(const key of ['chat_template_kwargs','enableThinking','cache_key','cache_prompt','id_slot','max_completion_tokens'])expect(bodies[0]).not.toHaveProperty(key);
  expect(request.tools).toHaveLength(2);expect(request.tool_choice).toEqual({type:'function',function:{name:'agent_intent'}});
 });
 it('honors request-level thinking off and preserves the requested tool when compatible',async()=>{
  let body:any;globalThis.fetch=vi.fn(async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify(response));});
  await createInferenceClient(config).complete({...request,enableThinking:false});
  expect(body.reasoning).toEqual({enabled:false});expect(body.tool_choice).toEqual(request.tool_choice);
 });
 it('handles Qwen default thinking without inventing a reasoning setting',async()=>{
  let body:any;globalThis.fetch=vi.fn(async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify(response));});
  await createInferenceClient({baseUrl:config.baseUrl,model:request.model}).complete(request);
  expect(body.tool_choice).toBe('auto');expect(body).not.toHaveProperty('reasoning');
 });
 it.each([false,true])('retries a routed thinking/tool-choice rejection once (stream=%s)',async(stream)=>{
  const bodies:any[]=[];globalThis.fetch=vi.fn(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));if(bodies.length===1)return new Response(JSON.stringify({error:{message:'Provider returned error',metadata:{raw:'The tool_choice parameter does not support being set to required or object in thinking mode',provider_name:'Alibaba'}}}),{status:400});return stream?sse():new Response(JSON.stringify(response));});
  const client=createInferenceClient(config);const routed={...request,model:'openrouter/auto'};if(stream)await collect(client,routed);else await client.complete(routed);
  expect(bodies).toHaveLength(2);expect(bodies[0].tool_choice).toEqual(request.tool_choice);expect(bodies[1]).toMatchObject({tool_choice:'auto',tools:[tools[0]],reasoning:{enabled:true}});
 });
 it('does not retry unrelated provider failures',async()=>{
  globalThis.fetch=vi.fn(async()=>new Response('{"error":{"message":"Invalid API key"}}',{status:401}));
  await expect(createInferenceClient(config).complete(request)).rejects.toThrow('401');expect(globalThis.fetch).toHaveBeenCalledTimes(1);
 });
 it('surfaces an in-stream provider error instead of yielding empty success',async()=>{
  globalThis.fetch=vi.fn(async()=>new Response('data: {"error":{"code":500,"message":"Provider disconnected"}}\n\n'));
  await expect(collect(createInferenceClient(config))).rejects.toThrow('Provider disconnected');expect(globalThis.fetch).toHaveBeenCalledTimes(1);
 });
 it('preserves local template, cache and forced-tool behavior',async()=>{
  let body:any;globalThis.fetch=vi.fn(async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify(response));});
  await createInferenceClient({...config,baseUrl:'http://local.test/v1'}).complete(request);
  expect(body).toMatchObject({tool_choice:request.tool_choice,chat_template_kwargs:{enable_thinking:true},cache_key:'local',cache_prompt:true,id_slot:2,max_completion_tokens:4096});expect(body).not.toHaveProperty('reasoning');
 });
});
