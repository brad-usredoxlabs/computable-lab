import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RefBadge, type OntologyRef } from './RefBadge'

const OLS = 'https://www.ebi.ac.uk/ols4/ontologies'
const OBO = 'http://purl.obolibrary.org/obo'

function ref(namespace: string, id: string, uri?: string): OntologyRef {
  return uri === undefined
    ? { kind: 'ontology', id, namespace, label: id }
    : { kind: 'ontology', id, namespace, label: id, uri }
}

function badgeHref(value: OntologyRef): string | null {
  const { container, unmount } = render(<RefBadge value={value} />)
  const href = container.querySelector('a')?.getAttribute('href') ?? null
  unmount()
  return href
}

describe('RefBadge NCIT link without a stored uri', () => {
  it('renders an OLS4 class link for an uppercase NCIT ref with no uri', () => {
    render(<RefBadge value={ref('NCIT', 'NCIT:C185409')} />)
    const link = screen.getByTitle('View in ontology browser')
    const href = link.getAttribute('href') ?? ''
    expect(href).toContain('/ontologies/ncit/classes/')
    expect(decodeURIComponent(href.split('/classes/')[1] ?? '')).toBe(`${OBO}/NCIT_C185409`)
    expect(href).toBe(`${OLS}/ncit/classes/${encodeURIComponent(`${OBO}/NCIT_C185409`)}`)
  })
})

describe('RefBadge invariants', () => {
  const members: Array<[string, string, string]> = [
    ['cl', 'CL:0000182', 'CL_0000182'],
    ['chebi', 'CHEBI:16236', 'CHEBI_16236'],
    ['go', 'GO:0006119', 'GO_0006119'],
    ['uberon', 'UBERON:0002107', 'UBERON_0002107'],
    ['obi', 'OBI:0000070', 'OBI_0000070'],
    ['uo', 'UO:0000001', 'UO_0000001'],
    ['ncbitaxon', 'NCBITaxon:9606', 'NCBITaxon_9606'],
    ['mondo', 'MONDO:0004994', 'MONDO_0004994'],
  ]

  it.each(members)('keeps the existing %s OLS output byte-for-byte', (ns, id, local) => {
    expect(badgeHref(ref(ns.toUpperCase(), id))).toBe(
      `${OLS}/${ns}/classes/${encodeURIComponent(`${OBO}/${local}`)}`,
    )
  })
  it('keeps a non-OBO stored uri verbatim', () => {
    expect(badgeHref(ref('NCIT', 'NCIT:C185409', 'https://example.org/term/x'))).toBe(
      'https://example.org/term/x',
    )
  })
  it('keeps a purl stored uri OLS-encoded, not hijacked by the namespace list', () => {
    const uri = `${OBO}/NCIT_C185409`
    expect(badgeHref(ref('NCIT', 'NCIT:C185409', uri))).toBe(
      `${OLS}/ncit/classes/${encodeURIComponent(uri)}`,
    )
  })
  it('renders no external link for a namespace outside the OLS list', () => {
    expect(badgeHref(ref('FOO', 'FOO:0000001'))).toBeNull()
  })
  it('yields an identical href on a second render (no per-render drift)', () => {
    expect(badgeHref(ref('NCIT', 'NCIT:C185409'))).toBe(badgeHref(ref('NCIT', 'NCIT:C185409')))
  })
})
