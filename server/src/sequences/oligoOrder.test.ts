import { describe, expect, it } from 'vitest';
import { extractOligoRows } from './oligoOrder.js';
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
});
