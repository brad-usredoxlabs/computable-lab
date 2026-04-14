import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAiChat } from './useAiChat';
import type { AiContext } from '../../types/aiContext';

// Mock the aiClient module
vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}));

// Mock the parsePromptMentions module
vi.mock('../lib/aiPromptMentions', () => ({
  parsePromptMentions: vi.fn().mockReturnValue([]),
}));

const mockAiContext: AiContext = {
  surface: 'event-editor',
  summary: 'Test summary',
  surfaceContext: {},
};

describe('useAiChat empty-success handling', () => {
  it('appends system message when done event has success=true and empty events/labwareAdditions', async () => {
    const { streamAssist } = await import('../api/aiClient');
    
    // Mock a done event with success=true but empty events and labwareAdditions
    (streamAssist as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
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
      })
    );

    // Trigger the sendPrompt
    result.current.sendPrompt('test prompt');

    // Wait for the messages to be updated
    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    // Find the system message about empty success
    const systemMessages = result.current.messages.filter((m) => m.role === 'system');
    const emptySuccessMessage = systemMessages.find(
      (m) => m.content === 'AI completed the task but did not propose any changes.'
    );

    expect(emptySuccessMessage).toBeDefined();
  });

  it('does NOT append system message when done event has success=true with non-empty events', async () => {
    const { streamAssist } = await import('../api/aiClient');
    
    // Mock a done event with success=true and non-empty events
    (streamAssist as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield {
        type: 'done',
        success: true,
        events: [{ eventId: 'e1', event_type: 'add_material', details: { wells: ['A1'] } }],
        labwareAdditions: [],
        result: {
          success: true,
          events: [{ eventId: 'e1', event_type: 'add_material', details: { wells: ['A1'] } }],
          labwareAdditions: [],
        },
      };
    });

    const { result } = renderHook(() =>
      useAiChat({
        aiContext: mockAiContext,
        onAcceptEvent: vi.fn(),
        onAddLabwareFromRecord: vi.fn(),
      })
    );

    result.current.sendPrompt('test prompt');

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    const systemMessages = result.current.messages.filter((m) => m.role === 'system');
    const emptySuccessMessage = systemMessages.find(
      (m) => m.content === 'AI completed the task but did not propose any changes.'
    );

    expect(emptySuccessMessage).toBeUndefined();
  });

  it('does NOT append system message when done event has success=true with non-empty labwareAdditions', async () => {
    const { streamAssist } = await import('../api/aiClient');
    
    // Mock a done event with success=true and non-empty labwareAdditions
    (streamAssist as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield {
        type: 'done',
        success: true,
        events: [],
        labwareAdditions: [{ recordId: 'lbw-1', reason: 'auto-create' }],
        result: {
          success: true,
          events: [],
          labwareAdditions: [{ recordId: 'lbw-1', reason: 'auto-create' }],
        },
      };
    });

    const { result } = renderHook(() =>
      useAiChat({
        aiContext: mockAiContext,
        onAcceptEvent: vi.fn(),
        onAddLabwareFromRecord: vi.fn(),
      })
    );

    result.current.sendPrompt('test prompt');

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    const systemMessages = result.current.messages.filter((m) => m.role === 'system');
    const emptySuccessMessage = systemMessages.find(
      (m) => m.content === 'AI completed the task but did not propose any changes.'
    );

    expect(emptySuccessMessage).toBeUndefined();
  });

  it('does NOT append system message when done event has success=false', async () => {
    const { streamAssist } = await import('../api/aiClient');
    
    // Mock a done event with success=false
    (streamAssist as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield {
        type: 'done',
        success: false,
        events: [],
        labwareAdditions: [],
        result: {
          success: false,
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
      })
    );

    result.current.sendPrompt('test prompt');

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    const systemMessages = result.current.messages.filter((m) => m.role === 'system');
    const emptySuccessMessage = systemMessages.find(
      (m) => m.content === 'AI completed the task but did not propose any changes.'
    );

    expect(emptySuccessMessage).toBeUndefined();
  });
});
