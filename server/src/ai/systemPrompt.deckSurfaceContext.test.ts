/**
 * L2-CHAT-1 gatefix1 D1 — the deck chat's captured context body must build a
 * prompt, not crash the turn.
 *
 * The tier-2 gate captured a REAL POST /api/ai/draft-events/stream body from
 * the /deck surface (receipts/L2-CHAT-1/2026-10-26_1235-tier2/live-capture.json).
 * Its `context` carried eventGraphId/runId/platformId/variantId/vocabPackId/
 * placementCount/eventCount/selection/mentions/editorMode but OMITTED
 * `labwares`, `eventSummary`, and `availableVerbs`. The server prompt builder
 * read all three, and the first (formatLabwares) threw
 * "Cannot read properties of undefined (reading 'length')", which the handler
 * streamed back as the assistant reply — every deck-chat turn died before the
 * agent ever ran.
 *
 * This test posts the EXACT captured body shape to the systemPrompt path and
 * asserts the prompt BUILDS with (none)-class degradations instead of
 * throwing. RED before the guard (TypeError), GREEN after.
 */
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './systemPrompt.js';
import type { EditorContext } from './types.js';

/**
 * The EXACT captured context keys (live-capture.json, turn 0), with
 * labwares / eventSummary / availableVerbs deliberately ABSENT — the shape the
 * /deck surface actually sent on the wire. Cast to EditorContext because the
 * pre-fix body violated the server's own contract (the whole point of the bug).
 */
function capturedDeckContext(): EditorContext {
  return {
    eventGraphId: 'EVG-a5-fixture-method',
    runId: 'RUN-2026-09-19-run-vwr8',
    platformId: 'biomix-2',
    variantId: 'biomix-2/1',
    vocabPackId: 'liquid-handling/v1',
    placementCount: 0,
    eventCount: 0,
    selection: null,
    mentions: [],
    editorMode: 'deck',
    // labwares, eventSummary, availableVerbs: ABSENT (as captured)
  } as unknown as EditorContext;
}

describe('the deck chat context degrades instead of crashing the turn (D1)', () => {
  it('builds the prompt from the exact captured body (no TypeError)', () => {
    let prompt: string;
    expect(() => {
      prompt = buildSystemPrompt(capturedDeckContext());
    }).not.toThrow();

    // Each of the three omitted fields degrades to its (none) placeholder
    // right under its template heading — the agent still gets a coherent
    // prompt, so the turn proceeds instead of erroring.
    expect(prompt).toContain('### Labwares\n(none)');
    expect(prompt).toContain('### Event Summary\nNo events yet (empty graph).');
    expect(prompt).toContain('### Active Vocabulary Pack\n(none)');
    // The captured keys that ARE present still render.
    expect(prompt).toContain('RUN-2026-09-19-run-vwr8');
  });

  it('degrades each omitted field independently', () => {
    // labwares omitted, the other two present.
    const noLabwares = {
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    } as unknown as EditorContext;
    const p1 = buildSystemPrompt(noLabwares);
    expect(p1).toContain('### Labwares\n(none)');
    expect(p1).toContain('No events yet.');

    // eventSummary omitted, the other two present.
    const noSummary = {
      labwares: [],
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    } as unknown as EditorContext;
    const p2 = buildSystemPrompt(noSummary);
    expect(p2).toContain('### Event Summary\nNo events yet (empty graph).');

    // availableVerbs omitted (vocabPackId present), labwares + summary present.
    const noVerbs = {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
    } as unknown as EditorContext;
    const p3 = buildSystemPrompt(noVerbs);
    expect(p3).toContain('### Active Vocabulary Pack\n(none)');
  });
});
