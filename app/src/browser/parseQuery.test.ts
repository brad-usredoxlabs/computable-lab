import { describe, expect, it } from 'vitest'
import { parseQuery, stringifyQuery } from './parseQuery'

describe('parseQuery', () => {
  it('extracts free-text q from bare words', () => {
    expect(parseQuery('tris hcl buffer')).toEqual({
      q: 'tris hcl buffer',
      facets: {},
    })
  })

  it('routes type:X to the type filter', () => {
    expect(parseQuery('type:material')).toEqual({
      q: '',
      type: ['material'],
      facets: {},
    })
  })

  it('supports comma-separated types', () => {
    expect(parseQuery('type:material,labware')).toEqual({
      q: '',
      type: ['material', 'labware'],
      facets: {},
    })
  })

  it('routes key:value to facets with $.key prefix', () => {
    expect(parseQuery('vendor:Sigma')).toEqual({
      q: '',
      facets: { '$.vendor': ['Sigma'] },
    })
  })

  it('keeps the $. prefix when the user supplies one', () => {
    expect(parseQuery('$.vendor:Sigma')).toEqual({
      q: '',
      facets: { '$.vendor': ['Sigma'] },
    })
  })

  it('parses double-quoted values with spaces', () => {
    expect(parseQuery('vendor:"Thermo Fisher"')).toEqual({
      q: '',
      facets: { '$.vendor': ['Thermo Fisher'] },
    })
  })

  it('coerces numbers and booleans on the value side', () => {
    expect(parseQuery('pH:7.4 active:true count:0')).toEqual({
      q: '',
      facets: {
        '$.pH': [7.4],
        '$.active': [true],
        '$.count': [0],
      },
    })
  })

  it('mixes type, facets, and free text', () => {
    expect(parseQuery('type:material vendor:Sigma tris hcl')).toEqual({
      q: 'tris hcl',
      type: ['material'],
      facets: { '$.vendor': ['Sigma'] },
    })
  })

  it('leaves URL-like tokens as free text', () => {
    expect(parseQuery('see http://example.com/x')).toEqual({
      q: 'see http://example.com/x',
      facets: {},
    })
  })

  it('handles empty input', () => {
    expect(parseQuery('')).toEqual({ q: '', facets: {} })
    expect(parseQuery('   ')).toEqual({ q: '', facets: {} })
  })

  it('round-trips through stringifyQuery (modulo ordering)', () => {
    const parsed = parseQuery('type:material vendor:Sigma pH:7.4 tris')
    const stringified = stringifyQuery(parsed)
    // Re-parse to check it survives the round-trip semantically.
    expect(parseQuery(stringified)).toEqual(parsed)
  })

  it('treats `key:` with empty value as free text', () => {
    expect(parseQuery('vendor:')).toEqual({
      q: 'vendor:',
      facets: {},
    })
  })
})
