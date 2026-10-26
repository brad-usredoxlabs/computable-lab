/**
 * L2-CHAT-1 regatefix2 — D1 (HIGH/blocker): the run's methodDeckLock is the
 * AUTHORITATIVE deck guardrail (eventGraphPersistence.ensureRunDeckLock
 * refuses a save whose platform/variant differs from the lock —
 * RunDeckLockConflictError). The provider's run-record load (EventEditor
 * Context's set_run_deck effect) resolves the deck from the MUTABLE memory
 * (methodPlatform/methodVariantId) and ignores the lock entirely — so a run
 * whose memory drifted off its locked deck (memory manual_freeform, lock
 * manual_collapsed: the live gate-run shape) reopens on the UNLOCKED variant
 * and every adoption save refuses with an uncaught page error.
 *
 * These locks pin the resolution rule the run-load effect must honor:
 *  - a VALID lock (platformId + variantId strings) WINS over the memory —
 *    the route opens on the locked deck (the deck the lock was taken on);
 *  - the memory value is never persisted back as if it were the current deck
 *    (writeRunDeckMemory must not write the memory variant while a different
 *    lock wins — that write is what clobbered the memory onto the freeform
 *    deck in the first place);
 *  - an ABSENT lock falls back to the memory (today's behavior);
 *  - a MATCHING lock is a no-op (memory and lock agree).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { EventEditorProvider, useEventEditor } from './EventEditorContext'

const mocks = vi.hoisted(() => ({
  getRecord: vi.fn(),
  getPlatforms: vi.fn(),
  updateRecord: vi.fn(),
  writeRunDeckMemory: vi.fn(async (_input: { runId: string | null; platformId: string; variantId: string }) => undefined),
  loadAcceptedEventGraph: vi.fn(async () => {
    throw new Error('no graph in this test')
  }),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: mocks.getRecord,
    getPlatforms: mocks.getPlatforms,
    updateRecord: mocks.updateRecord,
  },
}))

vi.mock('./eventGraphPersistence', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./eventGraphPersistence')>()
  return {
    ...orig,
    writeRunDeckMemory: mocks.writeRunDeckMemory,
    loadAcceptedEventGraph: mocks.loadAcceptedEventGraph,
  }
})

const MANUAL_PLATFORM = {
  id: 'manual',
  label: 'Manual',
  allowedVocabIds: ['liquid-handling/v1'],
  defaultVariant: 'manual_collapsed',
  toolTypeIds: [],
  modules: [],
  variants: [
    {
      id: 'manual_freeform',
      title: 'Manual Freeform',
      slots: [],
      surface: { kind: 'lawn' as const, widthMm: 1200, heightMm: 800 },
    },
    {
      id: 'manual_collapsed',
      title: 'Manual Collapsed',
      slots: [],
      surface: { kind: 'lawn' as const, widthMm: 900, heightMm: 600 },
    },
  ],
}

// The live gate-run shape: memory says freeform, the lock says collapsed.
const RUN_PAYLOAD = {
  recordId: 'RUN-LOCK-1',
  methodPlatform: 'manual',
  methodVariantId: 'manual_freeform',
  methodDeckLock: {
    locked: true,
    platformId: 'manual',
    variantId: 'manual_collapsed',
    source: 'first-edit',
    lockedAt: '2026-09-20T00:46:00.869Z',
  },
}

function StateProbe() {
  const { state } = useEventEditor()
  return <p data-testid="probe">{`${state.platformId}/${state.variantId}`}</p>
}

async function resolveDeck(runPayload: Record<string, unknown>) {
  mocks.getRecord.mockResolvedValue({ recordId: 'RUN-LOCK-1', payload: runPayload })
  mocks.getPlatforms.mockResolvedValue([MANUAL_PLATFORM])
  render(
    <EventEditorProvider runId="RUN-LOCK-1">
      <StateProbe />
    </EventEditorProvider>,
  )
  const probe = screen.getByTestId('probe')
  // Platforms resolve first, then the run record: wait until the probe has
  // left the pre-run default (the empty variant) — the deck is resolved.
  await waitFor(() => {
    expect(probe.textContent).not.toBeNull()
    expect(probe.textContent?.split('/')[1]).not.toBe('')
  })
  return probe
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('run-record load — the deck lock beats the deck memory (L2-CHAT-1 regatefix2 D1)', () => {
  it('a valid methodDeckLock resolves the run to the LOCKED deck, not the memory deck', async () => {
    const probe = await resolveDeck(RUN_PAYLOAD)
    expect(probe.textContent).toBe('manual/manual_collapsed')
    // The memory's freeform deck is NOT adopted (it would make every
    // adoption save refuse with RunDeckLockConflictError).
    expect(probe.textContent).not.toContain('manual_freeform')
  })

  it('never persists the MEMORY deck back while a different lock wins (no clobber write)', async () => {
    await resolveDeck(RUN_PAYLOAD)
    // The persist-on-change effect must not write the memory's freeform deck
    // to the record — the lock already declares collapsed the current deck.
    const memoryWrites = mocks.writeRunDeckMemory.mock.calls
      .filter((call) => (call[0] as { variantId?: string } | undefined)?.variantId === 'manual_freeform')
    expect(memoryWrites.length).toBe(0)
  })

  // regatefix2-fix1 D2 (gate defect D2): the gate's probe showed the
  // persist-on-change effect STILL fired with the lock-RESOLVED deck
  // (manual/manual_collapsed) on a mere page load and rewrote the record's
  // methodVariantId — clobbering the user's remembered variant, the exact
  // opposite of the design claim ("suppress the one memory write-back for
  // that forced deck"). The test above only filters the freeform write, so
  // it cannot catch it. This one asserts the NO-WRITE state directly: when
  // the deck was resolved by a DISAGREEING lock, writeRunDeckMemory must
  // not be called AT ALL — the record's memory keeps its remembered
  // variant (read-only convergence; nothing rewritten on load).
  it('when the deck is LOCK-RESOLVED the memory write-back is suppressed entirely (no writeRunDeckMemory call)', async () => {
    await resolveDeck(RUN_PAYLOAD)
    await waitFor(() => {
      // The deck has resolved to the locked variant — if a write-back
      // were to fire it fires now (the persist effect runs on the
      // resolved state).
      expect(screen.getByTestId('probe').textContent).toBe('manual/manual_collapsed')
    })
    expect(mocks.writeRunDeckMemory).not.toHaveBeenCalled()
  })

  it('with NO lock the memory deck still resolves (today\'s behavior preserved)', async () => {
    const probe = await resolveDeck({ ...RUN_PAYLOAD, methodDeckLock: undefined })
    expect(probe.textContent).toBe('manual/manual_freeform')
  })

  it('a MATCHING lock keeps the memory deck (no churn when they agree)', async () => {
    const probe = await resolveDeck({
      ...RUN_PAYLOAD,
      methodVariantId: 'manual_collapsed',
    })
    expect(probe.textContent).toBe('manual/manual_collapsed')
  })
})
