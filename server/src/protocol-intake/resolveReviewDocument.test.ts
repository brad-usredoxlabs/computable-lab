/**
 * The artifact -> decision-tree join. Real fixtures are the two Zymo docs:
 * the artifact store renamed the PDF while the tree kept the original storage
 * path, which is exactly the case that must still resolve.
 */
import { describe, expect, it } from 'vitest'
import { resolveReviewTree, storedBasename } from './resolveReviewDocument.js'

const SHA = '257f57196f6cd7a337e5ad42d7da74f2ab2c3e1e343a41c898d76c7d085d613b'

const TREES = [
  {
    recordId: 'PDT-vendor-protocol-d4303-d4307-d4309-zymobiomics-96-dna-kit-pdf',
    documentId: 'vendor-protocol:d4303-d4307-d4309-zymobiomics-96-dna-kit-pdf',
    sourcePdf: { artifactPath: '/home/brad/.computable-lab/worktrees/main/artifacts/foundry/pdfs/_d4303_d4307_d4309_zymobiomics_96_dna_kit.pdf', version: '1.7.1' },
  },
  {
    recordId: 'PDT-vendor-protocol-man0018069-magmax-pdf',
    documentId: 'vendor-protocol:man0018069-magmax-pdf',
    sourcePdf: { artifactPath: '/home/brad/.computable-lab/worktrees/main/artifacts/foundry/pdfs/MAN0018069_MagMAXMicrobiomeNuclAcidIsolatKit_SoilSalivaUrine_Manually_UG.pdf' },
  },
]

describe('storedBasename', () => {
  it('decodes percent-encoding and takes the last segment', () => {
    expect(storedBasename('/w/artifacts/foundry/pdfs/Adipogenesis-Assay-Kit%20(Cell-Based)-protocol-book-v2b-ab133102%20(website).pdf')).toBe(
      'adipogenesis-assay-kit (cell-based)-protocol-book-v2b-ab133102 (website).pdf',
    )
    expect(storedBasename('artifacts/foundry/pdfs/x.pdf')).toBe('x.pdf')
  })
})

describe('resolveReviewTree', () => {
  it('matches on the PDF content hash even when the stored file name differs', () => {
    // Same bytes, two names: the artifact renamed the file, the tree kept the
    // download name. Only the sha can join these.
    const match = resolveReviewTree({
      file: { stored_path: 'artifacts/foundry/pdfs/ZymoBIOMICS-96-MagBead-DNA-Kit.pdf', sha256: SHA },
      trees: [{ recordId: 'PDT-a', documentId: 'doc-a', sourcePdf: { artifactPath: '/x/other-name.pdf', sha256: SHA } }],
    })
    expect(match).toEqual({ ok: true, treeRecordId: 'PDT-a', documentId: 'doc-a', matchVia: 'sha256' })
  })

  it('falls back to the stored file name for legacy trees with no sha recorded', () => {
    const match = resolveReviewTree({
      file: { stored_path: 'artifacts/foundry/pdfs/_d4303_d4307_d4309_zymobiomics_96_dna_kit.pdf' },
      trees: TREES,
    })
    expect(match.ok).toBe(true)
    expect(match.ok && match.matchVia).toBe('stored_path_basename')
    expect(match.ok && match.treeRecordId).toBe('PDT-vendor-protocol-d4303-d4307-d4309-zymobiomics-96-dna-kit-pdf')
  })

  it('prefers the sha over a name collision, and stays deterministic', () => {
    const other = { recordId: 'PDT-b', documentId: 'doc-b', sourcePdf: { artifactPath: '/x/same-name.pdf', sha256: 'aaaa' } }
    const collides = { recordId: 'PDT-c', documentId: 'doc-c', sourcePdf: { artifactPath: '/y/same-name.pdf', sha256: SHA } }
    const match = resolveReviewTree({
      file: { stored_path: 'artifacts/foundry/pdfs/same-name.pdf', sha256: SHA },
      trees: [other, collides],
    })
    expect(match.ok && match.treeRecordId).toBe('PDT-c')
    expect(resolveReviewTree({ file: { stored_path: 'a/same-name.pdf', sha256: SHA }, trees: [collides, other] })).toEqual(match)
  })

  it('reports the gap (with the trees it did see) instead of guessing', () => {
    const match = resolveReviewTree({
      file: { stored_path: 'artifacts/foundry/pdfs/unknown-vendor-doc.pdf', sha256: 'deadbeef' },
      trees: TREES,
    })
    expect(match.ok).toBe(false)
    expect(match.ok === false && match.candidates).toEqual([
      'PDT-vendor-protocol-d4303-d4307-d4309-zymobiomics-96-dna-kit-pdf',
      'PDT-vendor-protocol-man0018069-magmax-pdf',
    ])
    expect(match.ok === false && match.gap).toContain('no decision tree')
  })

  it('reports the gap when there are no trees at all', () => {
    const match = resolveReviewTree({ file: { stored_path: 'a/b.pdf' }, trees: [] })
    expect(match.ok).toBe(false)
    expect(match.ok === false && match.candidates).toEqual([])
  })
})