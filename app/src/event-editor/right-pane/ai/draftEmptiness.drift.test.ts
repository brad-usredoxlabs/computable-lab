/**
 * draftEmptiness DRIFT PIN (Ruling 3) — relocated.
 *
 * L2-CHAT-UI-1 LEG D (spec §2.2 honestWall row, §3): this pin lived in
 * AiTabPanel.honestWall.test.tsx:528-603, which dies in the deletion commit.
 * It is RULING-3 machinery (the client draftProducedNothing predicate vs the
 * SERVER's 7-channel guard draftProducedNothingOnServer), NOT AiTabPanel
 * chrome, so it is ported here beside the surviving draftEmptiness.ts module
 * (useAiChat.ts:590-591 counts it — the universal wall keeps the predicate).
 *
 * The pin asserts the relationship CLIENT ⊇ SERVER (never ==): a per-channel
 * predicate-term regex against the sliced server helper body, plus a functional
 * superset arm proving every server channel is counted by the client while the
 * client's extra set is EXACTLY {equipmentRequirements, proseDeliverable}.
 * protocolEdit is in NEITHER set (its jurisdiction is the protocolEdit arm +
 * fall-through-to-wall, Ruling 1).
 *
 * RED-first: at base this file does not exist (the pin only lived in the
 * dying AiTabPanel test); it is GREEN the moment commit A lands it. It needs
 * NO mocks (pure predicate + server-source read), so the AiTabPanel pdfjs
 * mock it previously rode under is gone.
 */
import { describe, expect, it } from 'vitest'
import type { AiClarificationRequest } from '../../../types/ai'

const CLARIFICATION: AiClarificationRequest = {
  id: 'unresolved-c-0123456789',
  kind: 'material',
  prompt: 'The draft names "Test Reagent" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.',
  menuProvider: '/m',
  query: 'Test Reagent',
  options: [],
  allowCreateLocal: true,
}

describe('draftEmptiness — DRIFT PIN (Ruling 3), relocated from AiTabPanel.honestWall.test.tsx', () => {
  // Drift pin (Ruling 3, fix-run-2): the client predicate and the SERVER's
  // 7-channel guard must not drift. The relationship is pinned as CLIENT ⊇
  // SERVER (never ==): the server arm asserts a PREDICATE-TERM REGEX per
  // canonical channel against the sliced helper body —
  // draftArgDiagnostics.draftProducedNothingOnServer (L2-FREEFORM-1 H5
  // extracted the guard from the draft-tool arm's inline `const emptyResult =`
  // into ONE server helper; the arm still counts the SAME 7 channels —
  // a bare comment naming a channel must NOT satisfy the regex) — and the
  // superset arm asserts functionally that every server channel is counted
  // by the client while the client's extra set is EXACTLY
  // {equipmentRequirements, proseDeliverable} (H5: the doc-discussion prose
  // marker). protocolEdit is NOT in either set — its jurisdiction is the
  // protocolEdit arm + fall-through-to-wall (Ruling 1).
  it('client predicate ⊇ server 7-channel helper; per-channel regex terms; protocolEdit is arm-governed, not predicate-counted', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { draftProducedNothing } = await import('./draftEmptiness')

    // --- Server arm: slice the ONE server guard helper. ---
    // L2-FREEFORM-1 H5: the 7-channel check now lives in
    // draftArgDiagnostics.draftProducedNothingOnServer (extracted from the
    // draft-tool arm's inline expression — the behavior is byte-identical,
    // the location is the helper). The pin asserts the helper's source
    // counts EXACTLY the 7 canonical channels (per-predicate-term regex)
    // and NONE of the client-superset members.
    const serverSource = readFileSync(
      resolve(process.cwd(), '../server/src/ai/draftArgDiagnostics.ts'),
      'utf8',
    )
    const helperStart = serverSource.indexOf('export function draftProducedNothingOnServer')
    expect(helperStart).toBeGreaterThanOrEqual(0)
    // The helper body (signature + the 7-channel return expression) — the
    // slice runs to the function's CLOSING brace (not the parameter type's
    // own brace), so the predicate terms below are all in range.
    const bodyStart = serverSource.indexOf('): boolean {', helperStart)
    const guardBlock = serverSource.slice(
      bodyStart,
      serverSource.indexOf('\n}', bodyStart),
    )
    expect(guardBlock.length).toBeGreaterThan(0)

    const serverChannels = [
      'events', 'clarificationRequests', 'error', 'labwareAdditions',
      'labwareRequirements', 'recordCreations', 'deckLayout',
    ]
    for (const channel of serverChannels) {
      // A predicate-term regex: `result.<channel>?.length` or
      // `!result.<channel>` — prose in a comment naming the channel must
      // NOT satisfy this.
      const Q = String.fromCharCode(92)
      const term = new RegExp(`result${Q}.${channel}${Q}?${Q}.length|!result${Q}.${channel}${Q}b`)
      expect(guardBlock).toMatch(term)
    }
    // The server helper counts EXACTLY the 7 canonical channels: no
    // client-superset member leaked into the server text.
    expect(guardBlock).not.toMatch(/result\.equipmentRequirements\b/)
    expect(guardBlock).not.toMatch(/result\.proseDeliverable\b/)
    expect(guardBlock).not.toMatch(/result\.protocolEdit\b/)
    // The draft-tool arm still APPLIES the helper (the extraction did not
    // orphan the original guard site — the arm is in the orchestrator).
    const orchestratorSource = readFileSync(
      resolve(process.cwd(), '../server/src/ai/AgentOrchestrator.ts'),
      'utf8',
    )
    expect(orchestratorSource).toMatch(/const emptyResult = draftProducedNothingOnServer\(result\)/)

    // --- Superset arm: functional per-channel behaviour of the client. ---
    expect(draftProducedNothing({ success: true, events: [] })).toBe(true)
    expect(draftProducedNothing({ success: true, events: [], recordCreations: [{ kind: 'material', name: 'X' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], labwareRequirements: [{ classCurie: 'CL:24_well_plate' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], labwareAdditions: [{ recordId: 'LBW-x' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], deckLayout: { platformId: 'p', variantId: 'v' } })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], clarificationRequests: [CLARIFICATION] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], error: 'boom' })).toBe(false)
    // The client's ONE sanctioned extra (Ruling 1: a client-surface deliverable
    // — buildPreviewFromDraft mounts ghosts from it; the D1 negative asserts
    // setPreview + previewPlacements > 0 as its destination).
    expect(draftProducedNothing({ success: true, events: [], equipmentRequirements: [{ classCurie: 'equipment:water_bath' }] })).toBe(false)
    // L2-FREEFORM-1 H5 (OQ3): the doc-discussion prose marker is the client's
    // SECOND sanctioned superset member — a paragraph of answer is a
    // deliverable, never "produced nothing" (the wall must not false-fire
    // on a legitimate prose answer).
    expect(draftProducedNothing({ success: true, events: [], clarificationNeeded: 'the document says 37 degrees', proseDeliverable: true })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], proseDeliverable: true })).toBe(false)
    // protocolEdit is NOT predicate-counted: an ops-only envelope IS empty
    // (the arm owns delivery; the fall-through remnant walls). This leg
    // INVERTS the cycle-1 pin, which is deleted per Ruling 3.
    expect(draftProducedNothing({ success: true, events: [], protocolEdit: { ops: [{ op: 'x' }] } })).toBe(true)
  })
})
