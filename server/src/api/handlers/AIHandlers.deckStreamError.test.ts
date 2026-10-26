/**
 * L2-CHAT-1 gatefix1 D2 — a streamed draft-turn error must land in
 * backend.log (error level), not just the SSE stream.
 *
 * The tier-2 gate found the deck-chat failure invisible to status monitoring:
 * the handler calls reply.raw.writeHead(200) and then streams
 * {"type":"error"} on failure, so backend.log had ZERO 5xx and the harness
 * trail recorded 0 console/page errors — only the chat log text carried the
 * failure. Orch ruling: add a ONE-LINE server-side error log for the streamed
 * error event; do NOT change the transport/status-code contract.
 *
 * This test drives the REAL /api/ai/draft-events/stream handler
 * (createAIHandlers().draftEventsStream — the route's bound implementation)
 * with the exact captured deck-chat body and a failing orchestrator, and
 * asserts:
 *   1. the error is still STREAMED to the client ({"type":"error"}) — the
 *      SSE 200-then-error-event contract is the product's design, unchanged;
 *   2. the SAME failure is logged at error level (request.log.error) so it
 *      lands in backend.log.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createAIHandlers } from './AIHandlers.js';
import type { AgentOrchestrator } from '../../ai/types.js';

/** The exact captured deck-chat body (live-capture.json) — three fields absent. */
function capturedBody() {
  return {
    prompt: 'add a new plate P1 and transfer A1->P1',
    context: {
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
      // labwares / eventSummary / availableVerbs: ABSENT, as captured.
    },
    history: [],
  };
}

function mockReply() {
  const write = vi.fn();
  return {
    status: vi.fn(),
    send: vi.fn(),
    raw: { writeHead: vi.fn(), write, end: vi.fn() },
    _write: write,
  } as unknown as FastifyReply & { _write: ReturnType<typeof vi.fn> };
}

function mockRequest(body: unknown) {
  const error = vi.fn();
  return {
    body,
    headers: {},
    log: { error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    _error: error,
  } as unknown as FastifyRequest & { _error: ReturnType<typeof vi.fn> };
}

describe('draftEventsStream — streamed errors land in the server log (D2)', () => {
  it('streams the error AND logs it at error level on a failed turn', async () => {
    const orchestrator = {
      // Simulate the D1 crash class: the turn dies inside the orchestrator
      // (pre-fix this was the prompt builder's TypeError on the captured
      // body; post-D1 it is fixed at the prompt path, but ANY orchestrator
      // failure must still be logged, not just streamed).
      run: vi.fn().mockRejectedValue(
        new TypeError("Cannot read properties of undefined (reading 'length')"),
      ),
    } as unknown as AgentOrchestrator;

    const handlers = createAIHandlers(orchestrator);
    const request = mockRequest(capturedBody());
    const reply = mockReply();

    await handlers.draftEventsStream(request, reply);

    // The SSE contract is UNCHANGED: 200 is written, the error event is the
    // client-visible trace...
    const writeHead = (reply as never as { raw: { writeHead: ReturnType<typeof vi.fn> } }).raw.writeHead;
    expect(writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'text/event-stream' }));
    const frames = (reply as never as { _write: { mock: { calls: unknown[][] } } })._write.mock.calls
      .map((c) => String(c[0]))
      .filter((f) => f.startsWith('data: '))
      .map((f) => JSON.parse(f.slice('data: '.length)));
    expect(frames.some((f) => f.type === 'error' && /reading 'length'/.test(f.message))).toBe(true);
    // ...and the same failure now lands in the server log (backend.log).
    const errorLog = (request as never as { _error: { mock: { calls: unknown[][] } } })._error.mock.calls;
    expect(errorLog.length).toBeGreaterThan(0);
    expect(String(errorLog[0][1])).toContain('draft-events/stream failed');
    // The error event still comes after the status event — no transport
    // reordering, no status-code change.
    expect(frames.findIndex((f) => f.type === 'error')).toBeGreaterThan(
      frames.findIndex((f) => f.type === 'status'),
    );
  });
});
