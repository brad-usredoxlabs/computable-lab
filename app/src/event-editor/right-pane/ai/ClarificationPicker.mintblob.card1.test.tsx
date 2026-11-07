/**
 * L2-CLARIFY-CARD-1 M2 (browser regate #4 finding) — the mint blob unwrap
 * unit: when `unresolvedFact.label` is a serialized mint blob
 * `{mint:{label:…}}`, the mint-title row seeds from the inner human label,
 * not the raw serialization.
 *
 * Mirror of ClarificationPicker.mintseed.card1.test.tsx mock setup so the
 * import graph and mocks are the shipped ones.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClarificationPicker, mintLabelFor } from './ClarificationPicker'
import type { AiClarificationRequest } from '../../../types/ai'

// Stub the slash-menu resolvers (+ the shared mint-row label helper)
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
  resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
  mintLocalTermLabel: (q: string) => `Create material record "${q}" in the lab (new record)`,
}))

// The API client: the mint path
const mintLocalTerm = vi.fn()
vi.mock('../../../shared/api/client', () => ({
  apiClient: { mintLocalTerm: (a: string, b: string, c?: string) => mintLocalTerm(a, b, c) },
}))

// Ontology grounding — stub so the import graph is honest
const groundMaterialRef = vi.fn().mockResolvedValue({ kind: 'ontology' })
vi.mock('../../lib/groundMaterialRef', () => ({
  groundMaterialRef: (ref: unknown) => groundMaterialRef(ref),
}))

// THE regate #4 fixture: the exact shape the live stack measured
// unresolvedFact.label = the raw unquoted mint blob (exactly as rendered)
// query = the canonical fold (lowercase)
const nileRedRequest: AiClarificationRequest = {
  id: 'unresolved-c-nile-red-1',
  kind: 'material',
  prompt: 'Choose the material',
  entityType: 'material',
  menuProvider: '/m',
  query: 'nile red stain',
  options: [],
  allowCreateLocal: true,
  unresolvedFact: {
    label: '{mint:{label:Nile Red stain,domain:chemical}}',
    reason: 'unbound',
    actionLocation: { action: 'add_material', argument: 'material' },
  },
}

// Quoted variant — label value is quoted inside the blob
const nileRedQuotedRequest: AiClarificationRequest = {
  id: 'unresolved-c-nile-red-quoted-1',
  kind: 'material',
  prompt: 'Choose the material',
  entityType: 'material',
  menuProvider: '/m',
  query: 'nile red stain',
  options: [],
  allowCreateLocal: true,
  unresolvedFact: {
    label: '{mint:{label:"Nile Red stain",domain:"chemical"}}',
    reason: 'unbound',
    actionLocation: { action: 'add_material', argument: 'material' },
  },
}

// Non-mint blob: {foo:1} — must NOT become the durable name
const nonMintBlobRequest: AiClarificationRequest = {
  id: 'unresolved-c-nonmint-1',
  kind: 'material',
  prompt: 'Choose the material',
  entityType: 'material',
  menuProvider: '/m',
  query: 'some material',
  options: [],
  allowCreateLocal: true,
  unresolvedFact: {
    label: '{foo:1}',
    reason: 'unbound',
    actionLocation: { action: 'add_material', argument: 'material' },
  },
}

// JSON.stringify-form: quoted-key JSON blob
const nileRedJsonRequest: AiClarificationRequest = {
  id: 'unresolved-c-nile-red-json-1',
  kind: 'material',
  prompt: 'Choose the material',
  entityType: 'material',
  menuProvider: '/m',
  query: 'nile red stain',
  options: [],
  allowCreateLocal: true,
  unresolvedFact: {
    label: JSON.stringify({mint:{label:'Nile Red stain',domain:'chemical'}}),
    reason: 'unbound',
    actionLocation: { action: 'add_material', argument: 'material' },
  },
}

afterEach(() => {
  cleanup()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
  mintLocalTerm.mockReset()
  groundMaterialRef.mockReset()
})

describe('ClarificationPicker — L2-CLARIFY-CARD-1 M2: mint blob unwrap', () => {
  it('mintLabelFor unwraps the unquoted mint blob to the inner human label', () => {
    // seedNoun is the query-derived noun (lowercase fold)
    const seedNoun = 'nile red stain'
    // Post-fix: raw label {mint:{label:nile red stain,domain:chemical}} unwraps
    // to 'nile red stain'. Pre-fix: returns the literal serialization
    // '{mint:{label:nile red stain,domain:chemical}}'.
    expect(mintLabelFor(nileRedRequest, seedNoun)).toBe('Nile Red stain')
  })

  it('mintLabelFor also unwraps the quoted form', () => {
    const seedNoun = 'nile red stain'
    expect(mintLabelFor(nileRedQuotedRequest, seedNoun)).toBe('Nile Red stain')
  })

  it('the rendered mint input contains no { or mint: when the label is a mint blob', async () => {
    resolveMaterial.mockResolvedValue([])
    render(<ClarificationPicker request={nileRedRequest} onPick={vi.fn()} />)
    const label = screen.getByTestId('clarification-mint-label') as HTMLInputElement
    // The fix must unwrap the blob — no { or mint: in the value
    expect(label.value).not.toContain('{')
    expect(label.value).not.toContain('mint:')
    expect(label.value).toBe('Nile Red stain')
  })

  it('clicking Create POSTS the unwrapped label to mintLocalTerm', async () => {
    resolveMaterial.mockResolvedValue([])
    mintLocalTerm.mockResolvedValue({ success: true, recordId: 'MAT-nile-001', label: 'Nile Red stain', iri: 'urn:cl:local:MAT-nile-001' })
    render(<ClarificationPicker request={nileRedRequest} onPick={vi.fn()} />)

    fireEvent.click(screen.getByTestId('clarification-mint-create'))
    await waitFor(() => expect(mintLocalTerm).toHaveBeenCalledTimes(1))

    // The exact string posted is the unwrapped human label, not the serialization
    expect(mintLocalTerm.mock.calls[0]?.[0]).toBe('material')
    expect(mintLocalTerm.mock.calls[0]?.[1]).toBe('Nile Red stain')
  })

  it('mintLabelFor unwraps JSON.stringify-form (quoted-key JSON) blobs', () => {
    const seedNoun = 'nile red stain'
    expect(mintLabelFor(nileRedJsonRequest, seedNoun)).toBe('Nile Red stain')
  })

  // NEGATIVE/non-vacuity leg: a non-mint blob must NOT mint a serialized name.
  // The seed must fall through to the query-derived noun — the label {foo:1}
  // is not a mint blob, so mintLabelFor ignores it and uses the query path.
  // This proves the unwrap logic is specific to {mint:{label:…}} blobs.
  it('NON-MINT BLOB: {foo:1} falls through to query-derived noun (not serialized)', () => {
    const seedNoun = 'some material'
    // A non-mint object label must NOT become the durable name.
    // mintLabelFor should fall through to mintNounFromQuery(query) or query.trim().
    // Since query='some material' is a bare noun, mintNounFromQuery returns it.
    expect(mintLabelFor(nonMintBlobRequest, seedNoun)).toBe('some material')
    // Must NOT contain the serialization
    expect(mintLabelFor(nonMintBlobRequest, seedNoun)).not.toBe('{foo:1}')
  })
})
