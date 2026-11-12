// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getOntologyRefUrl, type OntologyRef } from './ref'

const OLS = 'https://www.ebi.ac.uk/ols4/ontologies'
const OBO = 'http://purl.obolibrary.org/obo'

function ref(namespace: string, id: string, uri?: string): OntologyRef {
  return uri === undefined
    ? { kind: 'ontology', id, namespace, label: id }
    : { kind: 'ontology', id, namespace, label: id, uri }
}

describe('getOntologyRefUrl NCIT without a stored uri', () => {
  it('builds an OLS4 class link from an uppercase NCIT namespace and CURIE', () => {
    const url = getOntologyRefUrl(ref('NCIT', 'NCIT:C185409'))
    expect(url).not.toBeNull()
    expect(url).toContain('/ontologies/ncit/classes/')
    const iri = decodeURIComponent((url as string).split('/classes/')[1] ?? '')
    expect(iri).toBe(`${OBO}/NCIT_C185409`)
    expect(url).toBe(`${OLS}/ncit/classes/${encodeURIComponent(`${OBO}/NCIT_C185409`)}`)
  })
})

describe('getOntologyRefUrl invariants', () => {
  const members: Array<[string, string, string]> = [
    ['cl', 'CL:0000182', 'CL_0000182'],
    ['chebi', 'CHEBI:16236', 'CHEBI_16236'],
    ['go', 'GO:0006119', 'GO_0006119'],
    ['uberon', 'UBERON:0002107', 'UBERON_0002107'],
    ['obi', 'OBI:0000070', 'OBI_0000070'],
    ['uo', 'UO:0000001', 'UO_0000001'],
    ['ncbitaxon', 'NCBITaxon:9606', 'NCBITaxon_9606'],
  ]

  it.each(members)('keeps the existing %s OLS output byte-for-byte', (ns, id, local) => {
    expect(getOntologyRefUrl(ref(ns.toUpperCase(), id))).toBe(
      `${OLS}/${ns}/classes/${encodeURIComponent(`${OBO}/${local}`)}`,
    )
  })

  it('returns a stored uri verbatim, before any namespace lookup', () => {
    expect(getOntologyRefUrl(ref('NCIT', 'NCIT:C185409', 'https://example.org/term/x'))).toBe(
      'https://example.org/term/x',
    )
  })

  it('returns null for a namespace outside the OLS list', () => {
    expect(getOntologyRefUrl(ref('FOO', 'FOO:0000001'))).toBeNull()
  })
})
