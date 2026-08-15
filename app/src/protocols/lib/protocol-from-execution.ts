/**
 * Protocol from Execution Transformer
 * 
 * Transforms execution run data into a protocol draft with AI-assisted corrections.
 * This module handles the transformation of execution traces into reusable protocols,
 * incorporating deviations and corrections into the final protocol steps.
 */

import type { DeviationData, RunExecutionState } from '../../shared/api/execution.js';

export interface ProtocolStepDraft {
  eventId: string;
  originalAction: string;
  correctedAction?: string;
  deviationNote?: string;
  ordinal: number;
}

export interface ProtocolDraft {
  protocolName: string;
  protocolDescription?: string;
  version: string;
  steps: ProtocolStepDraft[];
}

export interface RunSummary {
  runId: string;
  totalSteps: number;
  completedSteps: number;
  deviatedSteps: number;
  duration?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DeviationSummary {
  eventId: string;
  deviationType: string;
  expectedValue?: string;
  actualValue?: string;
  severity?: string;
  notes?: string;
  correctionApplied: boolean;
}

export interface ProtocolDraftResponse {
  protocolName: string;
  protocolDescription?: string;
  version: string;
  steps: ProtocolStepDraft[];
  deviations: DeviationSummary[];
  runSummary: RunSummary;
}

/**
 * Transform execution events into protocol steps
 */
export function transformEventsToSteps(
  events: Array<{
    eventId: string;
    action?: string;
    description?: string;
    at?: string;
    t_offset?: string;
  }>,
  corrections: Array<{
    eventId: string;
    originalValue: string;
    correctedValue: string;
    note?: string;
  }>,
): ProtocolStepDraft[] {
  // Sort events by timestamp
  const sortedEvents = [...events].sort((a, b) => {
    const timeA = a.at || a.t_offset || '';
    const timeB = b.at || b.t_offset || '';
    return timeA.localeCompare(timeB);
  });

  return sortedEvents.map((event, index) => {
    const correction = corrections.find((c) => c.eventId === event.eventId);
    
    return {
      eventId: event.eventId,
      originalAction: event.action || event.description || 'Unknown action',
      correctedAction: correction?.correctedValue,
      deviationNote: correction?.note,
      ordinal: index + 1,
    };
  });
}

/**
 * Transform execution deviations into deviation summaries
 */
export function transformDeviations(
  deviations: DeviationData[],
  corrections: Array<{ eventId: string; correctedValue: string }>,
): DeviationSummary[] {
  return deviations.map((deviation) => {
    const correctionApplied = corrections.some((c) => c.eventId === deviation.eventId);
    
    return {
      eventId: deviation.eventId,
      deviationType: deviation.deviationType,
      expectedValue: deviation.expectedValue,
      actualValue: deviation.actualValue,
      severity: deviation.severity || 'info',
      notes: deviation.notes,
      correctionApplied,
    };
  });
}

/**
 * Calculate run summary from execution state
 */
export function calculateRunSummary(
  runId: string,
  executionState: RunExecutionState,
  deviationCount: number,
): RunSummary {
  const events = Object.keys(executionState.executionStates || {});
  const completedSteps = events.filter((eventId) => {
    const state = executionState.executionStates[eventId];
    return state.state === 'completed' || state.state === 'skipped';
  }).length;

  return {
    runId,
    totalSteps: events.length,
    completedSteps,
    deviatedSteps: deviationCount,
    duration: executionState.completedAt && executionState.startedAt
      ? String((new Date(executionState.completedAt).getTime() - new Date(executionState.startedAt).getTime()) / 1000)
      : undefined,
    startedAt: executionState.startedAt,
    completedAt: executionState.completedAt,
  };
}

/**
 * Generate a protocol draft from execution data
 */
export function generateProtocolDraft(
  events: Array<{
    eventId: string;
    action?: string;
    description?: string;
    at?: string;
    t_offset?: string;
  }>,
  corrections: Array<{
    eventId: string;
    originalValue: string;
    correctedValue: string;
    note?: string;
  }>,
  options: {
    protocolName?: string;
    protocolDescription?: string;
    version?: string;
  } = {},
): ProtocolDraft {
  const { protocolName, protocolDescription, version = '1.0.0' } = options;
  
  const steps = transformEventsToSteps(events, corrections);
  
  return {
    protocolName: protocolName || `Protocol from execution`,
    protocolDescription,
    version,
    steps,
  };
}

/**
 * Apply corrections to protocol steps
 */
export function applyCorrectionsToProtocol(
  draft: ProtocolDraft,
  corrections: Array<{
    eventId: string;
    correctedValue: string;
    note?: string;
  }>,
): ProtocolDraft {
  return {
    ...draft,
    steps: draft.steps.map((step) => {
      const correction = corrections.find((c) => c.eventId === step.eventId);
      if (correction) {
        return {
          ...step,
          correctedAction: correction.correctedValue,
          deviationNote: correction.note || step.deviationNote,
        };
      }
      return step;
    }),
  };
}
