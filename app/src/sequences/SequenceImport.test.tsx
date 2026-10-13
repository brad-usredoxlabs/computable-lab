/**
 * OLIGO-AI-3 — the review UI offers the AI read honestly (spec §6, plan Task 8).
 *
 * Structural RED: SequenceImport.tsx has no offer gate, no aiRead(), no AI row
 * marks. Arms (mirrors SequenceEditor.test.tsx: mock ./api, jsdom):
 *  (a) dead-chrome negative — no "Read with AI" button before any upload;
 *  (b) the button appears ONLY when the session's diagnostics carry an AI-2
 *      offer signal (OLIGO_AI_READ_OFFERED / OLIGO_PARTIAL_READ) — a clean
 *      read with a jobId gets NO button (§15.5: a button on jobId alone is a
 *      reject; the task says "from the zero/partial-rows diagnostic");
 *  (c) click -> sequenceApi('/order/<id>/ai-read', {}) -> AI rows APPEND
 *      side by side with the deterministic rows (no substitution), each AI
 *      row renders the honesty warning + source quote, the role="status"
 *      notice counts the rows, and the offer is spent (button gone);
 *  (d) error path -> the server's honest message renders verbatim, rows
 *      unchanged;
 *  (e) reopen with an AI-marked candidate -> the warning renders after
 *      reload (the GET carries provenance, no app state magic).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SequenceImport } from './SequenceImport'
import { sequenceApi } from './api'

vi.mock('./api',()=>({draftApi:vi.fn(),sequenceApi:vi.fn(),requestId:vi.fn(()=>'req-test'),recordRef:(id:string,type='sequence')=>({kind:'record',id,type})}))
afterEach(()=>{cleanup();sessionStorage.clear()})
beforeEach(()=>{vi.clearAllMocks()})

const deterministicRow={recordId:'ICD-OLIGO-AAA',label:'Probe Alpha',residues:'ACGTACGT',raw:"5'-ACGT ACGT-3'",page:1,modifications:[],issues:[],metadata:{}}
const aiRow=(n=1)=>({recordId:`ICD-OLIGO-AI${n}`,label:`AI Probe ${n}`,residues:'TTTTACGC',raw:'TTTT ACGC',page:1,modifications:[],issues:[],metadata:{},extractedBy:'ai-draft',model:'settings-model',sourceQuote:`10 Pass AI Probe ${n} |TTTT ACGC 23`})
const offerDiagnostic={severity:'warning',code:'OLIGO_AI_READ_OFFERED',message:'The deterministic read could not account for the document (any-issue). An AI read can be offered.'}

function uploadResponse(diagnostics:any[],candidates=[deterministicRow]){return {jobId:'ING-OTHER-ABC123',artifactId:'IAF-1',sha256:'x',candidates,text:'extracted vendor text',diagnostics}}

async function upload(diagnostics:any[],candidates?:any[]){
 vi.mocked(sequenceApi).mockResolvedValueOnce(uploadResponse(diagnostics,candidates))
 render(<SequenceImport orderOnly/>)
 fireEvent.change(screen.getByLabelText('PDF or text file'),{target:{files:[new File(['x'],'order.pdf')]}})
 await waitFor(()=>expect(screen.getByText(/Review each sequence/)).toBeInTheDocument())
}

it('(a) renders no AI offer button before any upload (dead-chrome negative)',()=>{
 render(<SequenceImport orderOnly/>)
 expect(screen.queryByRole('button',{name:/Read with AI/i})).toBeNull()
})

it('(b) the button appears only from the offer diagnostic — a clean read with a job gets none',async()=>{
 await upload([offerDiagnostic])
 expect(screen.getByRole('button',{name:/Read with AI/i})).toBeInTheDocument()
 cleanup()
 // Same component, same job, NO offer diagnostic -> no button.
 await upload([{severity:'warning',code:'LOCAL_OCR_REVIEW',message:'Transcribed using local OCR.'}])
 expect(screen.queryByRole('button',{name:/Read with AI/i})).toBeNull()
})

it('(b2) OLIGO_PARTIAL_READ alone also offers the read',async()=>{
 await upload([{severity:'warning',code:'OLIGO_PARTIAL_READ',message:'The document declares 4 items but only 2 were recognized.'}])
 expect(screen.getByRole('button',{name:/Read with AI/i})).toBeInTheDocument()
})

it('(c) one click appends AI rows beside the deterministic rows, marks them honestly, and spends the offer',async()=>{
 await upload([offerDiagnostic])
 vi.mocked(sequenceApi).mockResolvedValueOnce({jobId:'ING-OTHER-ABC123',candidates:[aiRow(1),aiRow(2)],diagnostics:[{severity:'warning',code:'AI_READ_REVIEW',message:'The AI read produced 2 candidate row(s) using model settings-model.'}]})
 fireEvent.click(screen.getByRole('button',{name:/Read with AI/i}))
 await waitFor(()=>expect(screen.getByText('2 row(s) read by the AI. Verify every base against the PDF page before importing.')).toBeInTheDocument())
 expect(sequenceApi).toHaveBeenCalledWith('/order/ING-OTHER-ABC123/ai-read',{})
 // No substitution: the deterministic card is still on screen.
 expect(screen.getByDisplayValue('Probe Alpha')).toBeInTheDocument()
 // Both AI cards render the honesty warning.
 expect(screen.getAllByText('AI read — verify against the PDF.')).toHaveLength(2)
 // The quote disclosure is findable for page-vs-read verification.
 expect(screen.getAllByText('AI source quote').length).toBeGreaterThanOrEqual(1)
 expect(screen.getByText('10 Pass AI Probe 1 |TTTT ACGC 23')).toBeInTheDocument()
 // The offer is spent: the button is gone after a successful read.
 expect(screen.queryByRole('button',{name:/Read with AI/i})).toBeNull()
 // The AI_READ_REVIEW diagnostic renders too (banner names the model).
 expect(screen.getByText(/settings-model/)).toBeInTheDocument()
})

it('(d) an honest server error renders verbatim and leaves the rows untouched',async()=>{
 await upload([offerDiagnostic])
 vi.mocked(sequenceApi).mockRejectedValueOnce(new Error('No AI endpoint is configured. Set an AI model in Settings and try again.'))
 fireEvent.click(screen.getByRole('button',{name:/Read with AI/i}))
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('No AI endpoint is configured'))
 expect(screen.getByDisplayValue('Probe Alpha')).toBeInTheDocument()
 expect(screen.queryByText('AI read — verify against the PDF.')).toBeNull()
 // The offer was NOT spent by a failed click — the user can retry honestly.
 expect(screen.getByRole('button',{name:/Read with AI/i})).toBeInTheDocument()
})

it('(e) reopen returns AI-marked candidates with the warning intact (GET carries provenance)',async()=>{
 vi.mocked(sequenceApi).mockResolvedValueOnce({jobId:'ING-OTHER-ABC123',text:'extracted vendor text',candidates:[{...deterministicRow,status:'needs_review'},{...aiRow(1),status:'needs_review'}]})
 render(<SequenceImport orderOnly/>)
 fireEvent.change(screen.getByLabelText('Reopen ingestion job'),{target:{value:'ING-OTHER-ABC123'}})
 fireEvent.click(screen.getByRole('button',{name:'Reopen review'}))
 await waitFor(()=>expect(screen.getByDisplayValue('AI Probe 1')).toBeInTheDocument())
 expect(screen.getByText('AI read — verify against the PDF.')).toBeInTheDocument()
 expect(screen.getByText('10 Pass AI Probe 1 |TTTT ACGC 23')).toBeInTheDocument()
 // Reopen alone (no offer diagnostic in the GET response) does not re-offer.
 expect(screen.queryByRole('button',{name:/Read with AI/i})).toBeNull()
})
