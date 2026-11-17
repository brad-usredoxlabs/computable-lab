/**
 * journeyDoorHref.test.ts — L2-NOUN-CREATION-JOURNEY-1 (u1journey c2 FIX 3).
 *
 * A declared door's ROUTE comes from the surface registry
 * (schema/registry/surfaces/surfaces.yaml via GET /api/surfaces), never from a
 * TypeScript literal. The two surfaces the noun-create declaration names:
 *   ingestion     -> "/ingestion"              (no params)
 *   record-create -> "/record/new/:nodeType"   (nodeType filled: material)
 * With no registry (not loaded / surface undeclared) the documented fallback
 * route is used.
 */
import { describe, expect, it } from 'vitest'
import type { SurfaceSpec } from '../shared/surfaces'
import { DECLARED_SURFACE_ROUTE, journeyDoorHref } from './journeyDoorHref'

const registry = [
  { id: 'ingestion', label: 'Ingestion', path: '/ingestion', objectTypes: ['document'], selectableKinds: ['material'] },
  {
    id: 'record-create',
    label: 'Record create',
    path: '/record/new/:nodeType',
    params: { nodeType: 'record' },
    objectTypes: ['record'],
    selectableKinds: [],
  },
] as unknown as SurfaceSpec[]

const journey = { journeyId: 'journey-noun-create', checkpointRef: 'cp-journey-noun-create' }

describe('journeyDoorHref — registry-resolved door routes (AC3)', () => {
  it('routes an ingestion door to the registry path for `ingestion`', () => {
    const href = journeyDoorHref({ id: 'add-from-vendor-or-ontology', surface: 'ingestion', candidateLabel: 'DMEM' }, journey, registry)
    expect(href.startsWith('/ingestion?')).toBe(true)
    const url = new URL(href, 'http://localhost')
    expect(url.searchParams.get('prefillName')).toBe('DMEM')
    expect(url.searchParams.get('surface')).toBe('ingestion')
    expect(url.searchParams.get('nodeType')).toBe('material')
  })

  it('routes a record-create door to the registry path with :nodeType filled', () => {
    const href = journeyDoorHref({ id: 'local-formulation', surface: 'record-create', candidateLabel: 'DMEM' }, journey, registry)
    expect(href.startsWith('/record/new/material?')).toBe(true)
    expect(new URL(href, 'http://localhost').searchParams.get('door')).toBe('local-formulation')
  })

  it('falls back to the documented material route when the registry lacks the surface', () => {
    const href = journeyDoorHref({ id: 'local-formulation', surface: 'record-create', candidateLabel: 'DMEM' }, journey)
    expect(href.startsWith(`${DECLARED_SURFACE_ROUTE}?`)).toBe(true)
    expect(new URL(href, 'http://localhost').searchParams.get('surface')).toBe('record-create')
  })
})
