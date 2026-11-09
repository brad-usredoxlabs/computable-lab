/**
 * FAME-3 GATE-FIX-1 D1 (gate-l1t1520, major) — the empty-success system
 * bubble must NOT fire on a turn whose proposal was ALREADY handled by the
 * record-draft relay.
 *
 * The defect: on /analysis, the model's record_draft_proposal frame renders
 * the WorkstateProposalCard ("appends one assignment ...") via
 * onRecordDraftProposal, and the SAME turn's done event (success, zero
 * events / labwareAdditions / applianceJobs / sequenceProposal) ALSO
 * renders the contradictory "AI completed the task but did not propose any
 * changes." system bubble directly next to the card.
 *
 * The fix (generic, no record-drafting names in the guard data): the done
 * branch tracks, for the CURRENT turn only, whether a handled proposal
 * frame already left the assistant a proposal; the empty-success bubble is
 * suppressed exactly in that case. A turn that proposed nothing still gets
 * the bubble (the existing empty.test.ts legs pin that — they must stay
 * green).
 *
 * RED at base: the done guard (useAiChat.ts) does not know about the
 * handled record-draft frame, so the bubble renders next to the card's
 * callback — this test asserts the callback fired AND the bubble is absent.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAiChat } from './useAiChat';
import type { AiContext } from '../../types/aiContext';

// Mock the aiClient module (same shape as useAiChat.empty.test.ts).
vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}));

const mockAiContext: AiContext = {
  surface: 'event-editor',
  summary: 'Test summary',
  surfaceContext: {},
};

describe('useAiChat — a HANDLED record-draft proposal suppresses the empty-success bubble', () => {
  it('done after a record_draft_proposal frame: the relay gets the draft AND the "did not propose any changes" bubble stays absent', async () => {
    const { streamAssist } = await import('../api/aiClient');
    const onRecordDraftProposal = vi.fn();

    (streamAssist as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      // The record-drafting INTENT frame first (the card relay), then the
      // done event: success, no events / labware / applianceJobs / sequence
      // proposal — the shape the gate saw on /analysis.
      yield { type: 'record_draft_proposal', recordDraft: { operation: 'edit-record' } };
      yield {
        type: 'done',
        success: true,
        events: [],
        labwareAdditions: [],
        result: {
          success: true,
          events: [],
          labwareAdditions: [],
        },
      };
    });

    const { result } = renderHook(() =>
      useAiChat({
        aiContext: mockAiContext,
        onAcceptEvent: vi.fn(),
        onAddLabwareFromRecord: vi.fn(),
        onRecordDraftProposal,
      })
    );

    void result.current.sendPrompt('test prompt');

    // The card relay received the draft verbatim (the frame was HANDLED).
    await waitFor(() => {
      expect(onRecordDraftProposal).toHaveBeenCalledWith({ operation: 'edit-record' });
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    // The defect: the contradictory bubble rendered next to the card.
    // With the frame handled, nothing was "unproposed" — the bubble must
    // stay absent (the card IS the proposal).
    expect(
      result.current.messages.some(
        (m) => m.role === 'system' && m.content === 'AI completed the task but did not propose any changes.'
      ),
      'the handled record-draft turn must not render the empty-success bubble next to the card',
    ).toBe(false);
  });
});
