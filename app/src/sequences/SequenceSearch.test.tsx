/**
 * ISEQ-1 RED — SequenceSearch (spec §6): the Sequences ingestion tab surface.
 *
 * Arms:
 *  (1) initial state: Nucleotide/Protein pills + Canonical RefSeq toggle render;
 *      Search disabled below 2 chars.
 *  (2) search pins the canonical-flagged hit in the Canonical RefSeq card
 *      (testid sequence-canonical) and keeps general hits visible below.
 *  (3) canonicalOnly toggle sets canonicalOnly=true on the proxy call.
 *  (4) organism input passes through as the organism query param.
 *  (5) protein pill switches the proxy source to ncbi_protein.
 *  (6) Import posts the EXISTING save_sequence shape (mirrors
 *      SequenceImport.tsx:22-23) with alphabet 'iupac_rna' for U-containing
 *      residues — the executable fence against the §3.5 alphabet trap. The
 *      residues-derived alphabet is load-bearing, NOT the sequenceSources.ts
 *      iupac_dna hardcode (that is a separate filed defect, §15).
 *  (7) after import the returned recordId is shown.
 *
 * fetch is stubbed for the biosource proxy calls; ./api is mocked so the save
 * payload is assertable verbatim (harness mirrors SequenceImport.test.tsx).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SequenceSearch } from './SequenceSearch'
import { sequenceApi } from './api'

vi.mock('./api', () => ({
  draftApi: vi.fn(),
  sequenceApi: vi.fn(),
  requestId: vi.fn(() => 'req-test'),
  recordRef: (id: string, type = 'sequence') => ({ kind: 'record', id, type }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  vi.clearAllMocks()
})

const REFSEQ_FASTA = '>NR_028961.1 Faecalibacterium prausnitzii strain ATCC 27768 16S ribosomal RNA, partial sequence\nAGUUCCGGAGAGUUUGGUUGAUUAGCCGAUGCCAGCC'

function searchPayload() {
  return {
    results: [
      {
        accession: 'NR_028961',
        uid: '265678656',
        title: 'Faecalibacterium prausnitzii strain ATCC 27768 16S ribosomal RNA, partial sequence',
        organism: 'Faecalibacterium prausnitzii',
        taxId: 853,
        length: 1462,
        biomol: 'rRNA',
        sourcedb: 'refseq',
        canonical: true,
        url: 'https://www.ncbi.nlm.nih.gov/nuccore/NR_028961',
      },
      {
        accession: 'PZ868245',
        uid: '3379869005',
        title: 'Faecalibacterium prausnitzii strain TS M3092 16S ribosomal RNA gene, partial sequence',
        organism: 'Faecalibacterium prausnitzii',
        taxId: 853,
        length: 192,
        biomol: 'genomic',
        sourcedb: 'insd',
        canonical: false,
        url: 'https://www.ncbi.nlm.nih.gov/nuccore/PZ868245',
      },
    ],
    total: 822,
  }
}

type StubCall = { url: URL; init?: RequestInit }

function stubProxy(opts: { fasta?: string; saveRecordId?: string } = {}) {
  const calls: StubCall[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const raw = String(input)
    const url = new URL(raw, 'http://localhost:5192')
    calls.push({ url, init })
    if (url.pathname.includes('/biosource/') && url.pathname.endsWith('/search')) {
      return { ok: true, status: 200, json: async () => searchPayload() } as unknown as Response
    }
    if (url.pathname.includes('/biosource/') && url.pathname.endsWith('/fetch')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accession: 'NR_028961',
          db: 'nucleotide',
          title: 'Faecalibacterium prausnitzii 16S ribosomal RNA',
          organism: 'Faecalibacterium prausnitzii',
          length: 1462,
          sequence: opts.fasta ?? REFSEQ_FASTA,
          url: 'https://www.ncbi.nlm.nih.gov/nuccore/NR_028961',
        }),
      } as unknown as Response
    }
    return { ok: false, status: 404, text: async () => 'not stubbed' } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock as typeof fetch)
  vi.mocked(sequenceApi).mockResolvedValue({ recordId: opts.saveRecordId ?? 'SEQ-TEST-1' })
  return calls
}

async function search(query = '16S F Prausnitzi') {
  fireEvent.change(screen.getByTestId('sequence-query-input'), { target: { value: query } })
  fireEvent.click(screen.getByTestId('sequence-search-button'))
  await screen.findByTestId('sequence-canonical')
}

describe('SequenceSearch', () => {
  it('renders Nucleotide/Protein pills + Canonical RefSeq toggle; Search disabled below 2 chars', () => {
    stubProxy()
    render(<SequenceSearch />)
    expect(screen.getByTestId('sequence-search')).toBeDefined()
    expect(screen.getByTestId('sequence-pill-ncbi_nucleotide')).toBeDefined()
    expect(screen.getByTestId('sequence-pill-ncbi_protein')).toBeDefined()
    expect(screen.getByTestId('sequence-pill-canonical')).toBeDefined()
    expect((screen.getByTestId('sequence-search-button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('sequence-query-input'), { target: { value: 'a' } })
    expect((screen.getByTestId('sequence-search-button') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('sequence-query-input'), { target: { value: '16S' } })
    expect((screen.getByTestId('sequence-search-button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('pins the canonical-flagged hit in the Canonical RefSeq card, general hits stay visible below', async () => {
    stubProxy()
    render(<SequenceSearch />)
    await search()
    const card = screen.getByTestId('sequence-canonical')
    expect(card.textContent).toContain('NR_028961')
    expect(card.textContent).toContain('Faecalibacterium prausnitzii')
    // The general (non-canonical) hit renders in the results list, not the card.
    const list = screen.getByTestId('sequence-results')
    expect(list.textContent).toContain('PZ868245')
    expect(card.textContent).not.toContain('PZ868245')
  })

  it('Canonical RefSeq toggle sets canonicalOnly=true on the proxy search', async () => {
    const calls = stubProxy()
    render(<SequenceSearch />)
    fireEvent.click(screen.getByTestId('sequence-pill-canonical'))
    await search()
    const searchCall = calls.find((c) => c.url.pathname.endsWith('/search'))!
    expect(searchCall.url.searchParams.get('canonicalOnly')).toBe('true')
  })

  it('organism input passes through as the organism query param', async () => {
    const calls = stubProxy()
    render(<SequenceSearch />)
    fireEvent.change(screen.getByTestId('sequence-organism-input'), { target: { value: '853' } })
    await search()
    const searchCall = calls.find((c) => c.url.pathname.endsWith('/search'))!
    expect(searchCall.url.searchParams.get('organism')).toBe('853')
  })

  it('protein pill switches the proxy source to ncbi_protein', async () => {
    const calls = stubProxy()
    render(<SequenceSearch />)
    fireEvent.click(screen.getByTestId('sequence-pill-ncbi_protein'))
    await search('insulin')
    const searchCall = calls.find((c) => c.url.pathname.endsWith('/search'))!
    expect(searchCall.url.pathname).toContain('/biosource/ncbi_protein/search')
  })

  it('Import posts the existing save_sequence shape with residues-derived iupac_rna (U-containing rRNA)', async () => {
    stubProxy()
    render(<SequenceSearch />)
    await search()
    fireEvent.click(screen.getByTestId('sequence-import-button'))
    await waitFor(() => expect(sequenceApi).toHaveBeenCalledWith('/actions', expect.anything()))
    const [, payload] = vi.mocked(sequenceApi).mock.calls[0] as [string, Record<string, unknown>]
    expect(payload.operation).toBe('save_sequence')
    expect(payload.requestId).toBe('req-test')
    const sequence = payload.sequence as Record<string, unknown>
    expect(sequence.residues).toBe('AGUUCCGGAGAGUUUGGUUGAUUAGCCGAUGCCAGCC')
    // §3.5 fence: U-containing residues -> iupac_rna, never 'rna'/'dna'/iupac_dna.
    expect(sequence.alphabet).toBe('iupac_rna')
    expect(sequence.topology).toBe('linear')
    expect(sequence.label).toContain('16S')
    const source = sequence.source as Record<string, unknown>
    expect(source.accession).toBe('NR_028961')
    expect(typeof source.retrievedAt).toBe('string')
  })

  it('shows the returned recordId after import', async () => {
    stubProxy({ saveRecordId: 'SEQ-TEST-42' })
    render(<SequenceSearch />)
    await search()
    fireEvent.click(screen.getByTestId('sequence-import-button'))
    expect(await screen.findByTestId('sequence-imported')).toBeDefined()
    expect(screen.getByTestId('sequence-imported').textContent).toContain('SEQ-TEST-42')
  })
})
