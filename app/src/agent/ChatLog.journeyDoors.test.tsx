/**
 * ChatLog.journeyDoors.test.tsx — L2-NOUN-CREATION-JOURNEY-1 (u1journey c2
 * FIX 2).
 *
 * The cycle-1 defect: the GROUPED card rendered the declared journey doors,
 * but the SINGLE-fact absence arm (ChatLog.tsx `renderTypedClarification`,
 * mounted for ONE clarification request) ignored `request.journey` and offered
 * the labware create link. The cycle-1 evidence was a component-direct render
 * of ChatClarificationCard — which cannot see the single arm at all. This test
 * renders ChatLog itself, with ONE request.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest, ChatMessage } from '../types/ai'
import { ChatLog } from './ChatLog'

// The DECLARED surface registry (the authority for door routes) — stubbed at
// the module the components load it from, with the two surfaces the
// noun-create declaration names.
vi.mock('../shared/surfaces/registry', () => ({
  loadSurfaceRegistry: () =>
    Promise.resolve([
      { id: 'ingestion', label: 'Ingestion', path: '/ingestion', objectTypes: ['document'], selectableKinds: ['material'] },
      { id: 'record-create', label: 'Record create', path: '/record/new/:nodeType', params: { nodeType: 'record' }, objectTypes: ['record'], selectableKinds: [] },
    ]),
}))

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

const JOURNEY_MOD = '../../../server/src/compiler/journey/journeyDeclarationDoors.js'
const NOUN = 'DMEM'

const props = { isStreaming: false, prompt: '', onPromptChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn() }

afterEach(cleanup)

describe('ChatLog — single-fact arm renders the DECLARED journey doors (AC2)', () => {
  it('renders one anchor per declared door and NOT the labware create link', async () => {
    const mod = await import(JOURNEY_MOD)
    const declared = mod.nounCreateJourneyForCandidate(NOUN)
    expect(declared).toBeDefined()
    // The UNSLICED declaration: every door the YAML declares, in declared
    // order (c2 sliced this to 2, which hid the third declared door).
    const journey = declared
    expect(journey.doors.length).toBe(3)
    expect(journey.createdType).toBe('material')
    const request = {
      id: 'fact-journey-1',
      kind: 'noun',
      prompt: 'Which material do you mean?',
      options: [],
      absence: { mention: NOUN, reason: mod.notALocalTermReason(NOUN) },
      journey,
    } as unknown as AiClarificationRequest
    const message: ChatMessage = {
      id: 'clar-journey-single',
      role: 'assistant',
      content: 'Which material do you mean?',
      timestamp: 0,
      clarificationRequests: [request],
    }

    render(<ChatLog {...props} messages={[message]} />)

    // ONE chat-log request node (the single arm, not the grouped card).
    const node = screen.getByTestId('chat-log-request-fact-journey-1')
    expect(node.classList.contains('chat-log-clarification')).toBe(true)

    const doors = node.querySelectorAll('[data-testid^="chat-clarification-door-"]')
    expect(doors).toHaveLength(declared.doors.length)
    for (const door of journey.doors) {
      expect(screen.getByTestId(`chat-clarification-door-${door.id}`).tagName).toBe('A')
    }

    // Each door lands on its DECLARED surface's REGISTRY path (AC3), with the
    // created-type token taken from the DECLARED record_type — the journey
    // carries it, not the door module.
    await waitFor(() => {
      for (const door of journey.doors) {
        const href = screen.getByTestId(`chat-clarification-door-${door.id}`).getAttribute('href')
        expect(href).not.toBeNull()
        const expectedPath =
          door.surface === 'record-create' ? `/record/new/${journey.createdType}` : `/${door.surface}`
        expect(href!.startsWith(`${expectedPath}?`)).toBe(true)
      }
    })
    const ingestionHref = screen
      .getByTestId('chat-clarification-door-add-from-vendor-or-ontology')
      .getAttribute('href')
    expect(ingestionHref).toContain('prefillName=DMEM')

    // The labware create link is NOT offered for a material noun.
    expect(screen.queryByTestId('chat-clarification-absent-create')).toBeNull()
    expect(node.querySelector('.chat-clarification-card__absent-reason')).toHaveTextContent(NOUN)
  })

  // Fail CLOSED (advc c2 D2): with no DECLARED created type there is no route
  // for a token surface — the door is dead, never pointed at a guessed type.
  it('renders a dead door (no href) when the declaration names no created type', async () => {
    const mod = await import(JOURNEY_MOD)
    const declared = mod.nounCreateJourneyForCandidate(NOUN)
    const { createdType: _omitted, ...withoutType } = declared
    const request = {
      id: 'fact-journey-notype',
      kind: 'noun',
      prompt: 'Which material do you mean?',
      options: [],
      absence: { mention: NOUN, reason: mod.notALocalTermReason(NOUN) },
      journey: withoutType,
    } as unknown as AiClarificationRequest
    const message: ChatMessage = {
      id: 'clar-journey-notype',
      role: 'assistant',
      content: 'Which material do you mean?',
      timestamp: 0,
      clarificationRequests: [request],
    }

    render(<ChatLog {...props} messages={[message]} />)
    const createDoor = declared.doors.find((door: { surface: string }) => door.surface === 'record-create')
    expect(createDoor).toBeDefined()
    // Give the registry a turn to load: the dead door must STAY dead.
    await waitFor(() => {
      const anchor = screen.getByTestId(`chat-clarification-door-${createDoor.id}`)
      expect(anchor.getAttribute('href')).toBeNull()
      expect(anchor.getAttribute('aria-disabled')).toBe('true')
    })
    // A surface with no token needs no created type, so that door still routes.
    await waitFor(() => {
      expect(
        screen
          .getByTestId('chat-clarification-door-add-from-vendor-or-ontology')
          .getAttribute('href')
          ?.startsWith('/ingestion?'),
      ).toBe(true)
    })
  })
})
