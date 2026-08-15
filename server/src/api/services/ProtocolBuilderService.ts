/**
 * Protocol Builder Service - Creates protocols from execution traces
 * 
 * This service provides AI-assisted protocol generation from execution runs,
 * incorporating deviations and corrections into the final protocol.
 */

export interface ProtocolDraft {
  protocolName: string;
  protocolDescription?: string;
  version: string;
  steps: Array<{
    eventId: string;
    originalAction: string;
    correctedAction?: string;
    deviationNote?: string;
  }>;
}

export interface ProtocolCreationOptions {
  events: Array<{
    eventId: string;
    action?: string;
    description?: string;
    at?: string;
    t_offset?: string;
  }>;
  deviations: Array<{
    eventId: string;
    deviationType: string;
    expectedValue?: string;
    actualValue?: string;
    severity?: string;
    notes?: string;
  }>;
  corrections: Array<{
    eventId: string;
    originalValue: string;
    correctedValue: string;
    note?: string;
  }>;
  protocolName: string;
  protocolDescription?: string;
  version: string;
}

/**
 * Create a protocol draft from an execution trace.
 * This function applies AI-assisted corrections to incorporate deviations
 * into the final protocol steps.
 */
export async function createProtocolFromExecutionTrace(
  options: ProtocolCreationOptions,
): Promise<ProtocolDraft> {
  const { events, deviations, corrections, protocolName, protocolDescription, version } = options;

  // Sort events by timestamp
  const sortedEvents = [...events].sort((a, b) => {
    const timeA = a.at || a.t_offset || '';
    const timeB = b.at || b.t_offset || '';
    return timeA.localeCompare(timeB);
  });

  // Build steps with corrections applied
  const steps = sortedEvents.map((event): ProtocolDraft['steps'][number] => {
    const correction = corrections.find((c) => c.eventId === event.eventId);
    const deviation = deviations.find((d) => d.eventId === event.eventId);

    const baseStep = {
      eventId: event.eventId,
      originalAction: event.action || event.description || 'Unknown action',
    };

    // Only include correctedAction if it exists (to satisfy exactOptionalPropertyTypes)
    if (correction?.correctedValue) {
      return {
        ...baseStep,
        correctedAction: correction.correctedValue,
        ...(correction.note && { deviationNote: correction.note }),
      };
    }

    // Only include deviationNote if it exists
    if (deviation?.notes) {
      return {
        ...baseStep,
        deviationNote: deviation.notes,
      };
    }

    return baseStep;
  });

  // Return the protocol draft
  const result: ProtocolDraft = {
    protocolName,
    ...(protocolDescription && { protocolDescription }),
    version,
    steps,
  };

  return result;
}

/**
 * Apply deviation corrections to protocol steps
 */
export function applyCorrectionsToSteps(
  steps: ProtocolDraft['steps'],
  corrections: ProtocolCreationOptions['corrections'],
): ProtocolDraft['steps'] {
  return steps.map((step) => {
    const correction = corrections.find((c) => c.eventId === step.eventId);
    if (correction) {
      return {
        ...step,
        correctedAction: correction.correctedValue,
        deviationNote: correction.note,
      } as ProtocolDraft['steps'][number];
    }
    return step;
  });
}
