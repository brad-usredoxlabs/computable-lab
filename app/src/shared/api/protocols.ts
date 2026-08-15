/**
 * Protocol API client methods for protocol creation and promotion.
 * These methods enable the UI to interact with the protocol backend.
 */

/**
 * Protocol draft from execution run
 */
export interface ProtocolDraftFromRun {
  protocolName: string;
  protocolDescription?: string;
  version: string;
  steps: Array<{
    eventId: string;
    originalAction: string;
    correctedAction?: string;
    deviationNote?: string;
  }>;
  deviations: Array<{
    eventId: string;
    deviationType: string;
    expectedValue?: string;
    actualValue?: string;
    severity?: string;
    correctionApplied: boolean;
  }>;
  runSummary: {
    runId: string;
    totalSteps: number;
    completedSteps: number;
    deviatedSteps: number;
    duration?: string;
  };
}

/**
 * Generate a protocol draft from an execution run
 * @param runId - The execution run ID
 * @param protocolName - Optional protocol name
 * @param protocolDescription - Optional protocol description
 * @param version - Protocol version (defaults to '1.0.0')
 * @param corrections - Optional corrections to apply to steps
 * @returns Protocol draft with AI-assisted corrections
 */
export async function generateProtocolDraftFromRun(
  runId: string,
  protocolName?: string,
  protocolDescription?: string,
  version = '1.0.0',
  corrections?: Array<{
    eventId: string;
    originalValue: string;
    correctedValue: string;
    note?: string;
  }>,
): Promise<ProtocolDraftFromRun> {
  const response = await fetch('/api/protocols/promote-from-run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      runId,
      protocolName,
      protocolDescription,
      version,
      corrections,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'UNKNOWN_ERROR', message: 'Failed to generate protocol draft' }));
    throw new Error(error.message || 'Failed to generate protocol draft');
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to generate protocol draft');
  }

  return result.draft!;
}

/**
 * Create a protocol from a draft
 * @param draft - Protocol draft data
 * @param derivedFromRunId - The run ID this protocol is derived from
 * @param studyId - Optional study ID to link the protocol to
 * @param projectId - Optional project ID to link the protocol to
 * @returns Created protocol record
 */
export async function createProtocolFromDraft(
  draft: {
    protocolName: string;
    protocolDescription?: string;
    version: string;
    steps: Array<{
      eventId: string;
      originalAction: string;
      correctedAction?: string;
      deviationNote?: string;
    }>;
  },
  derivedFromRunId: string,
  studyId?: string,
  projectId?: string,
): Promise<{
  success: boolean;
  protocolId: string;
  protocolRecord: unknown;
}> {
  const response = await fetch('/api/protocols/create-from-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      draft,
      derivedFromRunId,
      studyId,
      projectId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'UNKNOWN_ERROR', message: 'Failed to create protocol' }));
    throw new Error(error.message || 'Failed to create protocol');
  }

  return response.json();
}
