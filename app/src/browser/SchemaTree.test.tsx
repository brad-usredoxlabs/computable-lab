import { describe, expect, it } from 'vitest'
import { deriveSchemaNode, groupByDomain } from './SchemaTree'
import type { SchemaInfo } from '../types/kernel'

function info(path: string, title = ''): SchemaInfo {
  return { id: `https://example/${path}`, path, title: title || path }
}

describe('deriveSchemaNode', () => {
  it('derives domain + kind from a schema path', () => {
    const node = deriveSchemaNode(info('schema/lab/material.schema.yaml', 'Material'))
    expect(node).toMatchObject({ domain: 'lab', kind: 'material', title: 'Material' })
  })

  it('uses the first segment under schema/ as the domain when nested', () => {
    const node = deriveSchemaNode(
      info('schema/lab/datatypes/ref.schema.yaml', 'Reference'),
    )
    expect(node).toMatchObject({ domain: 'lab', kind: 'ref' })
  })

  it('returns null for paths missing a domain folder', () => {
    expect(deriveSchemaNode(info('schema/material.schema.yaml'))).toBeNull()
  })

  it('returns null for paths missing the .schema.yaml suffix', () => {
    expect(deriveSchemaNode(info('schema/lab/material.yaml'))).toBeNull()
  })

  it('falls back to kind when title is empty', () => {
    const node = deriveSchemaNode(info('schema/lab/material.schema.yaml'))
    expect(node?.title).toBe('schema/lab/material.schema.yaml')
  })
})

describe('groupByDomain', () => {
  it('groups schemas by their first-segment domain in known order', () => {
    const groups = groupByDomain([
      info('schema/lab/material.schema.yaml', 'Material'),
      info('schema/core/lifecycle.meta.schema.yaml', 'Lifecycle'),
      info('schema/studies/study.schema.yaml', 'Study'),
      info('schema/lab/labware.schema.yaml', 'Labware'),
    ])
    expect(groups.map((g) => g.domain)).toEqual(['core', 'studies', 'lab'])
    const lab = groups.find((g) => g.domain === 'lab')
    expect(lab?.nodes.map((n) => n.kind)).toEqual(['labware', 'material'])
  })

  it('sorts unknown domains alphabetically after the known ones', () => {
    const groups = groupByDomain([
      info('schema/zeta/zeta.schema.yaml'),
      info('schema/lab/material.schema.yaml'),
      info('schema/alpha/alpha.schema.yaml'),
    ])
    expect(groups.map((g) => g.domain)).toEqual(['lab', 'alpha', 'zeta'])
  })

  it('skips malformed entries silently', () => {
    const groups = groupByDomain([
      info('schema/material.schema.yaml'), // missing domain
      info('schema/lab/material.schema.yaml', 'Material'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.nodes).toHaveLength(1)
  })
})
