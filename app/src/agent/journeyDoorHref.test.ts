/**
 * journeyDoorHref.test.ts — L2-NOUN-CREATION-JOURNEY-1 (u1journey c3, advc
 * c2 D2+D3).
 *
 * A declared door's ROUTE is decided by the ONE authority
 * (app/src/shared/surfaces/surfaceRoute.ts `declaredSurfaceRoute`) over the
 * declarative surface registry (schema/registry/surfaces/surfaces.yaml via
 * GET /api/surfaces). The created record type that fills `:nodeType` is the
 * JOURNEY DECLARATION's `human_task.output_port.record_type` (`createdType`) —
 * no constant in this module, and no route at all when it is absent.
 */
import { describe, expect, it } from 'vitest'
import type { SurfaceSpec } from '../shared/surfaces'
import { journeyDoorHref } from './journeyDoorHref'

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

const journey = {
  journeyId: 'journey-noun-create',
  checkpointRef: 'cp-journey-noun-create',
  createdType: 'material',
}

describe('journeyDoorHref — declared routes (AC3)', () => {
  it('routes an ingestion door to the registry path for `ingestion`, no token invented', () => {
    const href = journeyDoorHref(
      { id: 'add-from-vendor-or-ontology', surface: 'ingestion', candidateLabel: 'DMEM' },
      journey,
      registry,
    )
    expect(href).not.toBeNull()
    expect(href!.startsWith('/ingestion?')).toBe(true)
    const url = new URL(href!, 'http://localhost')
    expect(url.searchParams.get('prefillName')).toBe('DMEM')
    expect(url.searchParams.get('surface')).toBe('ingestion')
    // The surface declares NO params, so no nodeType rides the URL (D2-iii).
    expect(url.searchParams.has('nodeType')).toBe(false)
  })

  it('routes a record-create door to the registry path with :nodeType filled from the DECLARED type', () => {
    const href = journeyDoorHref(
      { id: 'local-formulation', surface: 'record-create', candidateLabel: 'DMEM' },
      journey,
      registry,
    )
    expect(href!.startsWith('/record/new/material?')).toBe(true)
    expect(new URL(href!, 'http://localhost').searchParams.get('door')).toBe('local-formulation')
  })

  it('follows the projected created type (a different journey type lands elsewhere)', () => {
    const href = journeyDoorHref(
      { id: 'local-formulation', surface: 'record-create', candidateLabel: 'Plate' },
      { ...journey, createdType: 'labware' },
      registry,
    )
    expect(href!.startsWith('/record/new/labware?')).toBe(true)
  })

  it('emits NO route when the declaration names no created type (fail closed)', () => {
    const { createdType: _omitted, ...withoutType } = journey
    expect(
      journeyDoorHref({ id: 'local-formulation', surface: 'record-create', candidateLabel: 'DMEM' }, withoutType, registry),
    ).toBeNull()
  })

  it('emits NO route when the registry has not answered (no TS fallback literal)', () => {
    const { createdType: _omitted2, ...withoutType } = journey
    expect(
      journeyDoorHref({ id: 'add-from-vendor-or-ontology', surface: 'ingestion', candidateLabel: 'DMEM' }, withoutType),
    ).toBeNull()
  })

  it('emits NO route for a surface the registry does not declare', () => {
    expect(
      journeyDoorHref({ id: 'x', surface: 'no-such-surface', candidateLabel: 'DMEM' }, journey, registry),
    ).toBeNull()
  })

  it('emits NO route when the registry declares the token but no params slot for it', () => {
    const noSlot = [
      { id: 'record-create', label: 'Record create', path: '/record/new/:nodeType', objectTypes: ['record'], selectableKinds: [] },
    ] as unknown as SurfaceSpec[]
    expect(
      journeyDoorHref({ id: 'local-formulation', surface: 'record-create', candidateLabel: 'DMEM' }, journey, noSlot),
    ).toBeNull()
  })
})
