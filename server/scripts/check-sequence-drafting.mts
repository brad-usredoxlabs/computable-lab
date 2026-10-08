/** Browser regression using the real compiler/store in a disposable directory.
 * No AI calls or writes reach the live lab. From server/: node ../node_modules/vite-node/vite-node.mjs scripts/check-sequence-drafting.mts
 * CL_BROWSER_URL and CL_CHROMIUM_PATH optionally select the frontend and installed browser.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import Fastify from 'fastify';
import { createSchemaRegistry } from '../src/schema/SchemaRegistry.js';
import { loadAllSchemas } from '../src/schema/SchemaLoader.js';
import { createValidator } from '../src/validation/AjvValidator.js';
import { LintEngine } from '../src/lint/LintEngine.js';
import { createLocalRepoAdapter } from '../src/repo/LocalRepoAdapter.js';
import { createRecordStore } from '../src/store/RecordStoreImpl.js';
import { PolicyBundleService } from '../src/policy/PolicyBundleService.js';
import { registerDraftRoutes } from '../src/drafts/draftRoutes.js';
import { registerSequenceRoutes } from '../src/sequences/sequenceRoutes.js';
import { AuthorizationService } from '../src/security/AuthorizationService.js';
import type { AppContext } from '../src/server.js';
import type { ToolRegistry } from '../src/ai/ToolRegistry.js';
const root=await mkdtemp(join(tmpdir(),'cl-draft-browser-'));
const schemaDir=fileURLToPath(new URL('../../schema',import.meta.url));
const registry=createSchemaRegistry();const loaded=await loadAllSchemas({basePath:schemaDir,recursive:true});
assert.deepEqual(loaded.errors,[]);registry.addSchemas(loaded.entries);
const validator=createValidator();for(const id of registry.getTopologicalOrder()){const entry=registry.getById(id);if(entry)validator.addSchema(entry.schema,id);}
const store=createRecordStore(createLocalRepoAdapter({basePath:root}),validator,new LintEngine());
const policyBundleService=new PolicyBundleService();policyBundleService.loadFromDir(join(schemaDir,'core/policy-bundles'));
const ctx={store,validator,schemaRegistry:registry,policyBundleService,authorizationService:new AuthorizationService(store),localIdentityService:{resolveRequestUser:async()=>({userId:'USR-BROWSER-TEST'})}} as unknown as AppContext;
const api=Fastify();await api.register(async app=>{registerDraftRoutes(app,ctx);registerSequenceRoutes(app,ctx,{} as ToolRegistry);},{prefix:'/api'});await api.ready();
const browser=await chromium.launch({headless:true,...(process.env.CL_CHROMIUM_PATH?{executablePath:process.env.CL_CHROMIUM_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const probe={operation:'create_oligo',requestId:'browser-probe',sequence:{label:'FAM-QSY probe',residues:'AATGGCATGACTGAGTCGATG',alphabet:'dna',topology:'linear'},vendor:'Thermo Fisher Scientific',modifications:[{position:'5-prime',label:'FAM',role:'reporter'},{position:'3-prime',label:'QSY',role:'quencher'}]};
const primer={operation:'create_oligo',requestId:'browser-primer',sequence:{label:'F prausnitzii DNA gyrase forward primer, bp 1146',residues:'ATGCGCGTAGGTCTGATGCTAGT',alphabet:'dna',topology:'linear'},modifications:[]};
let aiCalls=0;let compileCalls=0;let acceptCalls=0;let lastContext:any;
let releaseLate:(()=>void)|undefined;let startedLate:(()=>void)|undefined;
const lateStarted=new Promise<void>(resolve=>{startedLate=resolve});
await page.route('**/api/**',async route=>{
 const req=route.request();const url=new URL(req.url());
 if(url.pathname.startsWith('/api/drafts/')||url.pathname.startsWith('/api/sequences/')){
  if(url.pathname.endsWith('/compile'))compileCalls++;
  if(url.pathname.endsWith('/accept'))acceptCalls++;
  const response=await api.inject({method:req.method() as 'GET'|'POST',url:url.pathname+url.search,...(req.postData()?{payload:req.postData()!,headers:{'content-type':'application/json'}}:{})});
  await route.fulfill({status:response.statusCode,contentType:'application/json',body:response.body});return;
 }
 if(url.pathname==='/api/ai/assist/stream'){
  aiCalls++;lastContext=req.postDataJSON().context;
  if(aiCalls===7){startedLate?.();await new Promise<void>(resolve=>{releaseLate=resolve});}
  const proposal=aiCalls===2?{...probe,sequence:lastContext.workingForm.sequence}:[5,6].includes(aiCalls)?primer:probe;
  await route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({type:'done',result:{success:true,sequenceProposal:proposal}})}\n\n`});return;
 }
 // Chat history/session persistence must not write into the live lab during this check.
 if(req.method()!=='GET'){await route.fulfill({contentType:'application/json',body:'{}'});return;}
 await route.continue();
});
const scientific=async()=> (await store.list()).filter(r=>['sequence','oligo-spec','record-revision','sequence-action-receipt'].includes((r.payload as any).kind));
async function ready(){await page.getByRole('button',{name:'Accept and save',exact:true}).waitFor();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='Accept and save');return b&&!b.disabled});}
async function prompt(text:string){await page.getByLabel('Message',{exact:true}).fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();await ready();}
try{
 await page.goto(`${process.env.CL_BROWSER_URL??'http://computable:5174'}/sequences`);
 await page.getByRole('heading',{name:'Sequences & assays',exact:true}).waitFor();
 await page.getByLabel('Name',{exact:true}).fill('Unsaved manual work');await page.getByLabel('Sequence, 5′ → 3′',{exact:true}).fill('TTTT');
 await prompt('Add a probe AATGGCATGACTGAGTCGATG with FAM and QSY.');
 assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'FAM-QSY probe');
 assert.equal(await page.getByLabel('Sequence, 5′ → 3′',{exact:true}).inputValue(),probe.sequence.residues);
 assert.deepEqual(await page.getByLabel('Modification label',{exact:true}).evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value)),['FAM','QSY']);
 assert.equal((await scientific()).length,0);
 await page.getByLabel('Name',{exact:true}).fill('My corrected probe');await ready();
 const beforeRevisionCalls=aiCalls;assert.equal(beforeRevisionCalls,1);
 await prompt('Keep my corrected name and review this probe again.');assert.equal(lastContext.workingForm.sequence.label,'My corrected probe');assert.ok(lastContext.draft);
 assert.equal((await scientific()).length,0);
 await page.getByRole('button',{name:'Reject',exact:true}).click();
 assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Unsaved manual work');
 assert.equal(await page.getByLabel('Sequence, 5′ → 3′',{exact:true}).inputValue(),'TTTT');assert.equal((await scientific()).length,0);
 await prompt('Add the FAM QSY probe again.');
 await page.getByLabel('Sequence, 5′ → 3′',{exact:true}).fill('ZZZ');
 await page.locator('.sequence-review-bar [role=alert]').waitFor();
 assert.equal(await page.getByRole('button',{name:'Accept and save',exact:true}).isDisabled(),true);
 assert.equal((await scientific()).length,0);
 await page.getByLabel('Sequence, 5′ → 3′',{exact:true}).fill(probe.sequence.residues);await ready();
 const colors:any[]=[];
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme as 'light'|'dark'});
  await page.waitForFunction(t=>document.querySelector('.cl-app')?.getAttribute('data-theme')===t,theme);
  colors.push(await page.getByLabel('Name',{exact:true}).evaluate(e=>({text:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor,opacity:getComputedStyle(e).opacity})));
  await page.screenshot({path:join(tmpdir(),`cl-draft-${theme}.png`)});
 }
 assert.notDeepEqual(colors[0],colors[1]);assert.equal(colors[0].opacity,'1');assert.equal(colors[1].opacity,'1');
 const review=await page.getByRole('region',{name:'Draft review'}).boundingBox();assert.ok(review&&review.y>=0&&review.y<1000);
 await page.getByRole('button',{name:'Accept and save',exact:true}).focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>!document.querySelector('.sequence-review-bar'));
 await page.getByText(/OLIGO-.*Author:/).waitFor();
 assert.equal(acceptCalls,1);assert.equal(aiCalls,3);assert.ok(compileCalls>aiCalls);
 const records=await scientific();const oligo=records.find(r=>(r.payload as any).kind==='oligo-spec')!;
 assert.deepEqual((oligo.payload as any).modifications,probe.modifications);
 assert.equal((records.find(r=>(r.payload as any).kind==='sequence')!.payload as any).residues,probe.sequence.residues);
 assert.equal(await page.getByLabel('Sequence, 5′ → 3′',{exact:true}).inputValue(),probe.sequence.residues);
 // Replaying the actual old-probe failure must be blocked by the compiler.
 await page.getByLabel('Message',{exact:true}).fill(`Add a primer sequence ${primer.sequence.residues} for F prausnitzii DNA gyrase starting at BP 1146`);
 await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.locator('.sequence-review-bar [role=alert]').filter({hasText:'latest request'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Accept and save',exact:true}).isDisabled(),true);
 assert.equal((await scientific()).length,records.length);
 await page.getByRole('button',{name:'Reject',exact:true}).click();
 // The corrected proposal replaces every old probe field while the probe is selected.
 await prompt(`Add a primer sequence ${primer.sequence.residues} for F prausnitzii DNA gyrase starting at BP 1146`);
 assert.equal(await page.getByLabel('Sequence, 5′ → 3′',{exact:true}).inputValue(),primer.sequence.residues);
 assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),primer.sequence.label);
 assert.equal(await page.getByLabel('Vendor',{exact:true}).inputValue(),'');
 assert.equal(await page.getByLabel('Modification label',{exact:true}).count(),0);
 assert.equal(await page.getByText(/Derived from/).count(),0);
 await page.getByRole('button',{name:'Reject',exact:true}).click();
 assert.equal(await page.getByLabel('Sequence, 5′ → 3′',{exact:true}).inputValue(),probe.sequence.residues);
 assert.deepEqual(await page.getByLabel('Modification label',{exact:true}).evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value)),['FAM','QSY']);
 await prompt(`Add primer ${primer.sequence.residues} again`);
 await page.getByRole('button',{name:'Accept and save',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.sequence-review-bar'));
 await page.getByText(/OLIGO-.*Author:/).waitFor();
 const savedPrimer=(await scientific()).find(r=>(r.payload as any).kind==='sequence'&&(r.payload as any).residues===primer.sequence.residues)!;
 assert.ok(savedPrimer);assert.equal((savedPrimer.payload as any).parentRevisionRef,undefined);
 assert.equal((await store.get(records.find(r=>(r.payload as any).kind==='sequence')!.recordId))?.payload.residues,probe.sequence.residues);
 const finalRecords=await scientific();
 await page.getByLabel('Message',{exact:true}).fill('This response will arrive after I change targets.');
 await page.getByRole('button',{name:'Send',exact:true}).click();await lateStarted;
 await page.getByRole('button',{name:'New sequence',exact:true}).click();releaseLate?.();
 await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent==='Cancel'));
 assert.equal(await page.getByRole('region',{name:'Draft review'}).count(),0);
 assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'');
 assert.equal((await scientific()).length,finalRecords.length);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,aiCalls,compileCalls,acceptCalls,scientificRecords:finalRecords.length,colors,screenshots:['/tmp/cl-draft-light.png','/tmp/cl-draft-dark.png'],liveLabWrites:0}));
}catch(error){await page.screenshot({path:join(tmpdir(),'cl-draft-failure.png')});console.error((await page.locator('body').innerText()).slice(-9000));console.error(errors);throw error;}
finally{await browser.close();await api.close();await rm(root,{recursive:true,force:true});}
