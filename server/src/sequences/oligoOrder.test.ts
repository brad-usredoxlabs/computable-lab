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
});
