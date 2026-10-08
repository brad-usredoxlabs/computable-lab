import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SequenceEditor, type SequenceEditorHandle } from './SequenceEditor'
import { draftApi, sequenceApi } from './api'

vi.mock('./api',()=>({draftApi:vi.fn(),sequenceApi:vi.fn()}))
afterEach(cleanup)
beforeEach(()=>{vi.clearAllMocks()})
const probe={sequence:{label:'FAM-QSY probe',residues:'AATGGCATGACTGAGTCGATG',alphabet:'dna',topology:'linear'},oligo:true,vendor:'Thermo',modifications:[{position:'5-prime',label:'FAM',role:'reporter'}]}
const primer={operation:'create_oligo',sequence:{label:'F prausnitzii gyrase forward primer, bp 1146',residues:'ATGCGCGTAGGTCTGATGCTAGT',alphabet:'dna',topology:'linear'},modifications:[]}
const request=`Add a primer sequence ${primer.sequence.residues} that starts at BP 1146`
async function setup(){
 vi.mocked(sequenceApi).mockResolvedValue({sourceId:'REV-probe',sourceHash:'hash',form:structuredClone(probe),author:'USR-test'})
 const ref=createRef<SequenceEditorHandle>();const onSelect=vi.fn()
 render(<SequenceEditor ref={ref} recordId="OLIGO-probe" contract={{alphabets:{dna:{}}}} onSelect={onSelect} onAccepted={async()=>{}} onContext={()=>{}}/>)
 await waitFor(()=>expect(screen.getByLabelText('Sequence, 5′ → 3′')).toHaveValue(probe.sequence.residues))
 return {ref,onSelect}
}
function compilation(intent=primer){return {draftId:'DRAFT-primer',revision:1,reviewHash:'review-primer',canAccept:true,projection:{sequence:intent.sequence,modifications:intent.modifications},writes:[],diagnostics:[]}}

it('shows the compiled new primer and drops old dyes before enabling acceptance',async()=>{
 let finish!:(value:any)=>void
 vi.mocked(draftApi).mockImplementation((path)=>path==='/compile'?new Promise(resolve=>{finish=resolve}):Promise.resolve({recordId:'OLIGO-primer'}))
 const {ref,onSelect}=await setup()
 act(()=>ref.current!.propose(primer,request))
 expect(screen.getByRole('button',{name:'Accept and save'})).toBeDisabled()
 expect(draftApi).toHaveBeenCalledWith('/compile',{adapter:'sequence-authoring',intent:primer,userRequest:request})
 await act(async()=>finish(compilation()))
 expect(screen.getByLabelText('Sequence, 5′ → 3′')).toHaveValue(primer.sequence.residues)
 expect(screen.getByLabelText('Name',{exact:true})).toHaveValue(primer.sequence.label)
 expect(screen.getByLabelText('Vendor')).toHaveValue('')
 expect(screen.queryByLabelText('Modification label')).toBeNull()
 expect(screen.getByRole('button',{name:'Accept and save'})).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'Accept and save'}))
 await waitFor(()=>expect(onSelect).toHaveBeenCalledWith('OLIGO-primer'))
 expect(draftApi).toHaveBeenLastCalledWith('/accept',{draftId:'DRAFT-primer',revision:1,reviewHash:'review-primer'})
})

it('restores the previous probe and its modifications when the new primer is rejected',async()=>{
 vi.mocked(draftApi).mockResolvedValue(compilation())
 const {ref}=await setup()
 await act(async()=>ref.current!.propose(primer,request))
 expect(screen.getByLabelText('Sequence, 5′ → 3′')).toHaveValue(primer.sequence.residues)
 fireEvent.click(screen.getByRole('button',{name:'Reject'}))
 expect(screen.getByLabelText('Sequence, 5′ → 3′')).toHaveValue(probe.sequence.residues)
 expect(screen.getByLabelText('Modification label')).toHaveValue('FAM')
 expect(screen.queryByRole('region',{name:'Draft review'})).toBeNull()
 expect(draftApi).toHaveBeenCalledTimes(1)
})
