import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAiChat } from './useAiChat';
import type { AiContext } from '../../types/aiContext';
import { computeLabwareStates } from '../../graph/lib/eventGraph';
import { createLabware } from '../../types/labware';

// Mock the aiClient module
vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}));

// Use the real mention parser so preview normalization can recover labels from pasted prompt refs.
vi.mock('../lib/aiPromptMentions', async () => {
  const actual = await vi.importActual<typeof import('../lib/aiPromptMentions')>('../lib/aiPromptMentions');
  return actual;
});

const mockAiContext: AiContext = {
  surface: 'event-editor',
  summary: 'Test summary',
  surfaceContext: {},
};

describe('useAiChat empty-success handling', () => {
  it('immediately echoes the submitted prompt and active running state', async () => {
    const { streamAssist } = await import('../api/aiClient');

    (streamAssist as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      await new Promise(() => {});
    });

    const { result } = renderHook(() =>
      useAiChat({
        aiContext: mockAiContext,
        onAcceptEvent: vi.fn(),
        onAddLabwareFromRecord: vi.fn(),
      })
    );

    const prompt = 'Put a reservoir in source and transfer 50 uL to A1.';

    act(() => {
      void result.current.sendPrompt(prompt);
    });

    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: prompt,
    });
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Prompt received. Starting compiler pipeline...',
      isStreaming: true,
    });
    expect(result.current.messages[1]?.streamEvents?.[0]).toEqual({
      type: 'status',
      message: 'Prompt received. Starting compiler pipeline...',
    });
  });

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

    // Wait for the empty-success system message.
    await waitFor(() => {
      expect(
        result.current.messages.some((m) => m.content === 'AI completed the task but did not propose any changes.')
      ).toBe(true);
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

  it('normalizes compiler add-material details so preview state contains source material before transfer', async () => {
    const { streamAssist } = await import('../api/aiClient');
    const prompt = 'Put a [[labware:def:opentrons/nest_12_reservoir_22ml@v1|12-Channel Reservoir]] in the source location and a [[labware:lbw-seed-plate-96-flat|Generic 96 Well Plate, Flat Bottom (seed)]] in the target location. Then add 1000uL of [[aliquot:ALQ-PR9-TEST-CLO-001|Clofibrate stock tube]] to well A1 of the 12-well reservoir and use a 100uL pipette to transfer 50uL of it to well A1 of the 96-well plate.';

    (streamAssist as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield {
        type: 'done',
        result: {
          success: true,
          events: [
            {
              eventId: 'evt-add',
              event_type: 'add_material',
              labwareId: 'def:opentrons/nest_12_reservoir_22ml@v1',
              details: {
                well: 'A1',
                recordId: 'ALQ-PR9-TEST-CLO-001',
                kind: 'aliquot',
                volume_uL: 1000,
              },
            },
            {
              eventId: 'evt-transfer',
              event_type: 'transfer',
              labwareId: 'lbw-seed-plate-96-flat',
              details: {
                source_labware: 'def:opentrons/nest_12_reservoir_22ml@v1',
                source_well: 'A1',
                destination_labware: 'lbw-seed-plate-96-flat',
                wells: ['A1'],
                volume: { value: 50, unit: 'uL' },
              },
            },
          ],
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

    result.current.sendPrompt(prompt);

    await waitFor(() => {
      expect(result.current.previewEvents).toHaveLength(2);
    });

    const addDetails = result.current.previewEvents[0].details as Record<string, any>;
    expect(addDetails.wells).toEqual(['1']);
    expect(addDetails.volume).toEqual({ value: 1000, unit: 'uL' });
    expect(addDetails.aliquot_ref).toEqual({
      kind: 'record',
      id: 'ALQ-PR9-TEST-CLO-001',
      type: 'aliquot',
      label: 'Clofibrate stock tube',
    });

    const reservoir = { ...createLabware('reservoir_12', '12-Channel Reservoir'), labwareId: 'def:opentrons/nest_12_reservoir_22ml@v1' };
    const plate = { ...createLabware('plate_96', 'Generic 96 Well Plate, Flat Bottom (seed)'), labwareId: 'lbw-seed-plate-96-flat' };
    const states = computeLabwareStates(
      result.current.previewEvents,
      new Map([
        [reservoir.labwareId, reservoir],
        [plate.labwareId, plate],
      ])
    );

    const sourceChannel1 = states.get(reservoir.labwareId)?.get('1');
    const targetA1 = states.get(plate.labwareId)?.get('A1');
    expect(sourceChannel1?.volume_uL).toBe(950);
    expect(targetA1?.volume_uL).toBe(50);
    expect(sourceChannel1?.materials[0]?.materialRef).toBe('Clofibrate stock tube');
    expect(targetA1?.materials[0]?.materialRef).toBe('Clofibrate stock tube');
  });

  it('normalizes SBS aliases for y-axis linear reservoirs', async () => {
    const { streamAssist } = await import('../api/aiClient');

    (streamAssist as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      yield {
        type: 'done',
        result: {
          success: true,
          events: [
            {
              eventId: 'evt-add-h1',
              event_type: 'add_material',
              labwareId: 'def:opentrons/nest_8_reservoir_22ml@v1',
              details: {
                well: 'H1',
                recordId: 'ALQ-PR9-TEST-CLO-001',
                kind: 'aliquot',
                volume_uL: 500,
              },
            },
          ],
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

    result.current.sendPrompt('Add 500 uL to well H1 of the 8-channel reservoir.');

    await waitFor(() => {
      expect(result.current.previewEvents).toHaveLength(1);
    });

    const addDetails = result.current.previewEvents[0].details as Record<string, any>;
    expect(addDetails.wells).toEqual(['8']);
  });
});
