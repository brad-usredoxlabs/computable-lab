import { describe, expect, it } from 'vitest';
import { sequenceRequestDiagnostics } from './sequenceRequestFidelity.js';

const primer='ATGCGCGTAGGTCTGATGCTAGT';
const probe='AATGGCATGACTGAGTCGATG';
const action=(residues:string)=>({operation:'create_oligo',sequence:{residues}});
describe('sequence request fidelity',()=>{
 it('blocks replaying an earlier probe for the newly requested primer',()=>{
  expect(sequenceRequestDiagnostics(action(probe),`Add a primer sequence ${primer} that is a forwadr primer for F prausnitzii DNA gyrase that starts at BP 1146`)).toEqual([{path:'/sequence/residues',message:expect.stringContaining('latest request')}]);
 });
 it('compares canonical bases without modifying the action',()=>{
  const proposal=action('atgcgc gtaggtctgatgctagt');
  expect(sequenceRequestDiagnostics(proposal,`Add primer ${primer}`)).toEqual([]);
  expect(proposal.sequence.residues).toBe('atgcgc gtaggtctgatgctagt');
 });
 it.each([
  `Reverse complement ${primer}`,
  `Mutate ${primer} at position 5`,
  `Compare ${primer} with ${probe}`,
  'Keep my corrected label and review again.',
 ])('does not guess a single literal target for %s',request=>{
  expect(sequenceRequestDiagnostics(action('TTTT'),request)).toEqual([]);
 });
 it('does not apply authoring rules to other operations or direct form edits',()=>{
  expect(sequenceRequestDiagnostics({operation:'save_interval'},`Annotate ${primer}`)).toEqual([]);
  expect(sequenceRequestDiagnostics(action(probe))).toEqual([]);
 });
});
