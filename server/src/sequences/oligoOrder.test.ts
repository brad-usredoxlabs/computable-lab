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
import { extractOligoRows, ingestOligoOrder } from './oligoOrder.js';
import { sequenceConfig } from './sequenceRuntime.js';
import { aiReadTriggered, readAiFallbackPolicy } from './oligoOrderAiRead.js';
describe('oligo order extraction',()=>{
 it('keeps wrapped bases together, separates labels and retains source anchors',async()=>{
  const rows=await extractOligoRows("Name: Probe A\nSequence: 5'-/56-FAM/ACGT\nACGT/3BHQ_1/-3'\fName: Primer B\nSequence: TTTTACGT");
  expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({label:'Probe A',residues:'ACGTACGT',page:1,issues:[]});
  expect(rows[0]?.modifications).toHaveLength(2);expect(rows[1]?.page).toBe(2);
 });
 it('flags unrecognized modifications instead of guessing bases',async()=>{
  const rows=await extractOligoRows('Name: Custom\nSequence: ACGT[unknown dye]ACGT');
  expect(rows[0]?.issues.length).toBeGreaterThan(0);
  expect(rows[0]?.raw).toContain('[unknown dye]');
 });
 it('does not turn ordinary PDF prose into oligos',async()=>{
  expect(await extractOligoRows('Order confirmation\nThank you for ordering.')).toEqual([]);
 });
 it('reads an Invitrogen certificate of analysis (labeled fields, OCR layout)',async()=>{
  const text=`CELLULAR REDOX LLABS
Invitrogen Custom Primers Order Narher: 13421320
Certificate of Analysis
Line 10 - Cat No. 10336022 - - Manufactured: 2/13/2025 Primer Number: 531282C02
Primer Name: Feligens_869F Primer Length: 24
Researcher Marshall Scale of Synthesis: 50N
Sequence (\u00a7'to 3):  (DNA) - TTA CAG GAC AGG TTC TTG CTG AGG
Molecular Weight (ug/umole): 74249 ug per OD: 27.96
Line 11 - Cat No. 10336022 - - Manufactured: 2/13/2025 Primer Number: 531282C03
Primer Name: Feligens_1035R Primer Length: 26
Sequence (5'to 3'): (DNA) - TGT CAG ATA CTG TAC CAT CAG CAG CC
Molecular Weight (ug/umole): 7,916.2 ng per OD: 28.16
Line 12 - Cat No. 10336022 - - Manufactured: 2/13/2025 Primer Number: 531282C04
Primer Name: Feligens_1084R Primer Length: 26
Sequence (5'to 3):  (DNA) - CCC ATT TAG TAA TAT CAA CCG CAC GG
Molecular Weight (ug/umole): 7,900.2 ug per OD: 2176`;
  const rows=await extractOligoRows(text);
  expect(rows.map(r=>r.label)).toEqual(['Feligens_869F','Feligens_1035R','Feligens_1084R']);
  expect(rows.map(r=>r.residues)).toEqual(['TTACAGGACAGGTTCTTGCTGAGG','TGTCAGATACTGTACCATCAGCAGCC','CCCATTTAGTAATATCAACCGCACGG']);
  expect(rows.every(r=>r.issues.length===0)).toBe(true);
 });
 it('reads an Invitrogen order-summary table (lot/position line after each name)',async()=>{
  const text=`Line No.| CatNo/LotNo. . | Type | Description/Sequenc N Quantity | Amount(OD)
1 10336022 - DNA  Bvulgatus_1602F for Marshall 1 ea @ 23 bases 10.27
530845 A01 ACTCCTGAAGGTCCGAATATCGG
2 10336022 - DNA  Bvulgatus_1803R for Marshall 1 ea @ 23 bases 11.60
530845 A02 CATCATCCAATGGAGCATTACCC
\fInvitrogen
Line No.| Cat No./Lot No. Type | Description/Sequence Quantity: Amount(OD)
14 10336022 - DNA Btheta_1761R for Marshall 1 ea @ 21 bases 8.77
530845 B02 CAACGGAGCATTACCCTGTGC`;
  const rows=await extractOligoRows(text);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({label:'Bvulgatus_1602F',residues:'ACTCCTGAAGGTCCGAATATCGG',page:1});
  expect(rows[2]).toMatchObject({label:'Btheta_1761R',residues:'CAACGGAGCATTACCCTGTGC',page:2});
 });
 it('reads a dye-wrapped modified-oligo table (name and sequence on one line)',async()=>{
  const text=`UNE ITEM: | OUGO P/F: | SEQUENCE NAME: SEQUENCE: MASS: | MEAS MASS: YIELD(PMOL): CONC (uM): BUFFER:
30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM x er
50 Pass Oformi_1786_ABY |ABY-CCG TAT CGC AAG GTT GTC GAC AGT CAC G-QSY 28 362780 10153.44 Pass 6000 100uM x`;
  const rows=await extractOligoRows(text);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({label:'Oformi_1784_ABY',residues:'CACCGTATCGCAAGGTTGTCGACAGTCA',page:1});
  expect(rows[0]?.modifications).toEqual([
   {label:'ABY',role:'reporter',position:'5-prime'},
   {label:'QSY',role:'quencher',position:'3-prime'},
  ]);
  expect(rows[1]?.residues).toBe('CCGTATCGCAAGGTTGTCGACAGTCACG');
 });
 // Task 4: the fallback policy is DECLARED in config, not coded in TypeScript.
 it('declares the AI-read fallback policy as DATA in the shipped config',async()=>{
  const config=await sequenceConfig('oligo-order');
  const aiFallback=config.aiFallback as {enabled:boolean;offerWhen:string[];mode:string;maxContextChars:number;maxTokens:number;responseFormat:string}|undefined;
  expect(aiFallback,'config/sequence-analysis/oligo-order.yaml declares no aiFallback block').toBeDefined();
  expect(aiFallback!.enabled).toBe(true);
  expect(aiFallback!.offerWhen).toEqual(['no-rows','any-issue','declared-count-mismatch']);
  expect(aiFallback!.mode).toBe('manual');
  expect(aiFallback!.maxContextChars).toBe(12000);
  expect(aiFallback!.maxTokens).toBe(4000);
  expect(aiFallback!.responseFormat).toBe('json_object');
  // The declared-count signal rides the existing metadata pattern table.
  expect(typeof (config.metadata as Record<string,unknown>).declaredItemCount).toBe('string');
 });
 // Task 4 flip pair (spec §6): Test A reads the REAL shipped config and asserts
 // the shipped behavior; Test B passes the SAME signals with a flipped policy
 // literal. Same compiled code path, data changed, source untouched. (Never
 // write-flip the shared YAML in a test — concurrent vitest files race on it.)
 it('the trigger predicate is honored from config: shipped data fires, flipped data flips behavior with zero code change',async()=>{
  const config=await sequenceConfig('oligo-order');
  const shipped=readAiFallbackPolicy(config);
  expect(shipped.enabled).toBe(true);
  const signals={rowCount:2,issueRowCount:0,declaredCount:3};
  // Test A — shipped config: the declared-count-mismatch token fires.
  expect(aiReadTriggered(shipped,signals)).toEqual(['declared-count-mismatch']);
  // Test B flip 1 — enabled:false: nothing fires (the file-level flip story).
  expect(aiReadTriggered({...shipped,enabled:false},signals)).toEqual([]);
  // Test B flip 2 — token removed from offerWhen: that trigger gone, any-issue unaffected.
  const withoutMismatch={...shipped,offerWhen:shipped.offerWhen.filter(t=>t!=='declared-count-mismatch')};
  expect(aiReadTriggered(withoutMismatch,signals)).toEqual([]);
  expect(aiReadTriggered(withoutMismatch,{rowCount:1,issueRowCount:1,declaredCount:null})).toEqual(['any-issue']);
 });
 // Task 5: the declaredItemCount regex arms — anchored digits only. Case-
 // insensitivity comes from the loader's new RegExp(pattern,'i'), so the YAML
 // pattern itself carries no flags.
 it('the declaredItemCount pattern counts line items without colliding with price lines',async()=>{
  const declared=async(countLine:string)=>(await extractOligoRows(`Name: Row One\nSequence: ACGTACGT\n${countLine}`))[0]?.metadata.declaredItemCount;
  expect(await declared('ITEMS: 3')).toBe('3');
  expect(await declared('QTY 4')).toBe('4');
  expect(await declared('Total Items: 4')).toBe('4');
  // Must NOT match price/amount lines (anchored (\d+)\s*$).
  expect(await declared('Total Amount: $12.34')).toBeUndefined();
  expect(await declared('Total 1234567 USD')).toBeUndefined();
  // A document that declares NO count stays undetectable at the deterministic
  // layer — honest, not wrong.
  expect(await declared('Total Amount: 12.34')).toBeUndefined();
 });
});
// Task 5 ingest-level detection: the dangerous 2-of-3-rows case must stop being
// silent. Harness mirrors SequenceService.test.ts:16-24 (mkdtemp + recursive
// loadAllSchemas — it picks up schema/sequence-analysis/ post-AI-1 — +
// createRecordStore + fake AppContext). A .txt upload keeps it off the OCR/pdf
// path; the accounted/unaccounted fixture is inline, not a vendor PDF.
let ctx:AppContext;let root:string;
beforeAll(async()=>{
 root=await mkdtemp(join(tmpdir(),'cl-oligo-ingest-'));
 const registry=createSchemaRegistry();const loaded=await loadAllSchemas({basePath:fileURLToPath(new URL('../../../schema',import.meta.url)),recursive:true});
 expect(loaded.errors).toEqual([]);registry.addSchemas(loaded.entries);
 const validator=createValidator();for(const id of registry.getTopologicalOrder()){const e=registry.getById(id);if(e)validator.addSchema(e.schema,id);}
 const store=createRecordStore(createLocalRepoAdapter({basePath:root}),validator,new LintEngine());
 ctx={store,validator,schemaRegistry:registry,workspaceRoot:root,recordsDir:root} as AppContext;
},30000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
describe('oligo order ingest diagnostics',()=>{
 it('a PARTIAL read is a declared failure: OLIGO_PARTIAL_READ + the AI-read offer on the existing response',async()=>{
  // ITEMS: 3 header + two readable labeled-fields rows = accounted 2 / unaccounted 1.
  const text='ITEMS: 3\nName: Row One\nSequence: ACGTACGT\nName: Row Two\nSequence: TGCATGCA';
  const result=await ingestOligoOrder(ctx,'USR-test','partial-order.txt',Buffer.from(text));
  expect(result.candidates).toHaveLength(2);
  const partial=result.diagnostics.find(d=>d.code==='OLIGO_PARTIAL_READ');
  expect(partial,'OLIGO_PARTIAL_READ missing: the 2-of-3-rows case is still silent').toBeDefined();
  expect(partial!.severity).toBe('warning');
  expect(partial!.message).toContain('declares 3 items but only 2');
  // The honest signal OLIGO-AI-3's UI consumes must exist alongside it,
  // quoting the tokens that fired — driven by the config predicate.
  const offer=result.diagnostics.find(d=>d.code==='OLIGO_AI_READ_OFFERED');
  expect(offer,'OLIGO_AI_READ_OFFERED missing alongside the partial read').toBeDefined();
  expect(offer!.message).toContain('declared-count-mismatch');
 });
 it('a document that declares no count stays undetectable: no partial diagnostic, no offer (honest, not wrong)',async()=>{
  const text='Name: Row One\nSequence: ACGTACGT\nName: Row Two\nSequence: TGCATGCA';
  const result=await ingestOligoOrder(ctx,'USR-test','plain-order.txt',Buffer.from(text));
  expect(result.candidates).toHaveLength(2);
  expect(result.diagnostics.some(d=>d.code==='OLIGO_PARTIAL_READ')).toBe(false);
  expect(result.diagnostics.some(d=>d.code==='OLIGO_AI_READ_OFFERED')).toBe(false);
 });
});
