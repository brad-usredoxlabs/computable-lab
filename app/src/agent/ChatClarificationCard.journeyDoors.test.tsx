/**
 * ChatClarificationCard.journeyDoors.test.tsx — L2-NOUN-CREATION-JOURNEY-1
 * (unit u1journey).
 *
 * An unbound MATERIAL noun ("Add 100uL of DMEM to each well.") must NOT be
 * answered with the well-target card: the server projects the DECLARED
 * creation journey (config/journey/declarations/noun-create.yaml) onto the
 * fact and the card renders ONE door per declared alternative. The wheel is
 * pinned to the declaration here: the doors and the hrefs are built from the
 * SAME reader the engine uses (opaque dynamic import — runtime-resolved,
 * tsc-invisible, the absent-card test's discipline), so renaming an
 * alternative_id in the declaration changes this suite's expectations.
 *
 * The doors NAVIGATE (anchors carrying the noun as a CANDIDATE); they never
 * write — apiClient.createRecord stays at zero calls.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest } from '../types/ai'
import * as apiClientModule from '../shared/api/client'
import { ChatClarificationCard } from './ChatClarificationCard'

// c2 FIX 3: the card resolves a door's ROUTE from the declarative surface
// registry (the authority), so the test supplies the two declared surfaces.
vi.mock('../shared/surfaces/registry', () => ({
  loadSurfaceRegistry: () =>
    Promise.resolve([
      { id: 'ingestion', label: 'Ingestion', path: '/ingestion', objectTypes: ['document'], selectableKinds: ['material'] },
      { id: 'record-create', label: 'Record create', path: '/record/new/:nodeType', params: { nodeType: 'record' }, objectTypes: ['record'], selectableKinds: [] },
    ]),
}))

const JOURNEY_MOD = '../../../server/src/compiler/journey/journeyDeclarationDoors.js'

const NOUN = 'DMEM'

async function declaredJourney() {
  const mod = await import(JOURNEY_MOD)
  const journey = mod.nounCreateJourneyForCandidate(NOUN)
  expect(journey).toBeDefined()
  return { mod, journey }
}

function requestFor(
  journey: NonNullable<AiClarificationRequest['journey']>,
  reason: string,
): AiClarificationRequest {
  return {
    id: 'fact-1',
    kind: 'noun',
    prompt: 'Which material do you mean?',
    options: [],
    absence: { mention: NOUN, reason },
    journey,
  } as unknown as AiClarificationRequest
}

function renderCard(requests: AiClarificationRequest[]) {
  return render(
    <ChatClarificationCard
      requests={requests}
      turnKey="t1"
      shownPrompts={new Set()}
      onClarificationSubmit={vi.fn()}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ChatClarificationCard — declared noun-create doors (unit u1journey)', () => {
  it('renders one door per DECLARED alternative and states the noun is not a local term (AC2)', async () => {
    const { mod, journey } = await declaredJourney()
    const reason = mod.notALocalTermReason(NOUN)
    renderCard([requestFor(journey, reason)])

    // The server's own sentence — the card composes none.
    expect(screen.getByText(reason).textContent).toContain(NOUN)

    // Exactly the declared doors, no more: the card holds no door list.
    const declaredIds: string[] = journey.doors.map((d: { id: string }) => d.id)
    const rows = screen.getAllByTestId(/^chat-clarification-door-/)
    expect(rows).toHaveLength(declaredIds.length)
    for (const id of declaredIds) {
      const row = screen.getByTestId(`chat-clarification-door-${id}`)
      expect(row.tagName).toBe('A')
      expect(row.textContent?.toLowerCase()).toBe(id.replace(/-/g, ' '))
    }
    // The three canon doors of this revision (declaration data, asserted as
    // data: if the declaration changes, these expectations change with it).
    expect(declaredIds).toEqual([
      'add-from-vendor-or-ontology',
      'local-formulation',
      'local-product-or-sample',
    ])

    // NOT the well-target / single-create face for this fact.
    expect(screen.queryByTestId('chat-clarification-absent-create')).toBeNull()
  })

  it('carries the noun as a CANDIDATE plus the declared surface/door/journey/checkpoint in the URL (AC3)', async () => {
    const { mod, journey } = await declaredJourney()
    renderCard([requestFor(journey, mod.notALocalTermReason(NOUN))])

    const door1 = screen.getByTestId('chat-clarification-door-add-from-vendor-or-ontology')
    // AC3: the route is the DECLARED surface's registry path (door 1 →
    // `ingestion` → `/ingestion`), not a TypeScript literal — once loaded.
    await waitFor(() => {
      expect(new URL(door1.getAttribute('href') ?? '', 'http://localhost').pathname).toBe('/ingestion')
    })
    const url = new URL(door1.getAttribute('href') ?? '', 'http://localhost')
    expect(url.searchParams.get('prefillName')).toBe(NOUN)
    expect(url.searchParams.get('door')).toBe('add-from-vendor-or-ontology')
    expect(url.searchParams.get('journey')).toBe('journey-noun-create')
    expect(url.searchParams.get('checkpoint')).toBe('cp-journey-noun-create')
    // The surface is the DECLARED one for this alternative, not a literal.
    expect(url.searchParams.get('surface')).toBe(journey.doors[0].surface)
    // Navigation only: nothing is written by rendering/picking a door.
    expect(vi.spyOn(apiClientModule.apiClient, 'createRecord').mock.calls).toHaveLength(0)
  })
})
