/**
 * REST handlers for run check-in endpoints.
 *
 * Parses natural-language check-in messages into structured execution data:
 * state changes, observations, or deviations from the planned protocol.
 * Auto-persists the parsed data to the in-memory execution events store.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ApiError } from '../types.js';
import type { AppContext } from '../../server.js';
import { createInferenceClient } from '../../ai/InferenceClient.js';
import { RunWorkspaceService } from '../../run-workspace/RunWorkspaceService.js';

// ---------------------------------------------------------------------------
// Request / response shapes
// ---------------------------------------------------------------------------

export interface CheckinBody {
  text: string;
}

export interface CheckinStateChange {
  eventRef: string;
  toState: 'running' | 'completed' | 'skipped' | 'deviated';
}

export interface CheckinObservation {
  text: string;
  eventRef?: string;
}

export interface CheckinDeviation {
  eventRef: string;
  parameter: string;
  plannedValue: string;
  actualValue: string;
  note: string;
}

export interface CheckinResponse {
  interpretation: string;
  suggestedStateChange?: CheckinStateChange;
  observation?: CheckinObservation;
  deviation?: CheckinDeviation;
  persistedEvent?: ExecutionEvent;
}

export interface ExecutionEvent {
  id: string;
  eventRef: string;
  state?: 'pending' | 'current' | 'running' | 'completed' | 'skipped' | 'deviated';
  observations: CheckinObservationWithTimestamp[];
  deviations: CheckinDeviationWithTimestamp[];
  timestamp: string;
}

export interface CheckinObservationWithTimestamp {
  text: string;
  timestamp: string;
  eventRef?: string;
}

export interface CheckinDeviationWithTimestamp {
  eventRef: string;
  parameter: string;
  plannedValue: string;
  actualValue: string;
  note?: string;
  timestamp: string;
}

export interface ExecutionEventsResponse {
  runId: string;
  events: ExecutionEvent[];
}

// ---------------------------------------------------------------------------
// In-memory execution events store
// ---------------------------------------------------------------------------

const executionEventsStore = new Map<string, ExecutionEvent[]>();

function getEventsForRun(runId: string): ExecutionEvent[] {
  return executionEventsStore.get(runId) ?? [];
}

function addEventForRun(runId: string, event: ExecutionEvent): void {
  const list = executionEventsStore.get(runId) ?? [];
  list.push(event);
  executionEventsStore.set(runId, list);
}

// ---------------------------------------------------------------------------
// Handler interface
// ---------------------------------------------------------------------------

export interface CheckinHandlers {
  parseCheckin(
    request: FastifyRequest<{ Params: { runId: string }; Body: CheckinBody }>,
    reply: FastifyReply,
  ): Promise<CheckinResponse | ApiError>;

  getExecutionEvents(
    request: FastifyRequest<{ Params: { runId: string } }>,
    reply: FastifyReply,
  ): Promise<ExecutionEventsResponse | ApiError>;
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

export interface CheckinHandlersOptions {
  ctx: AppContext;
  inferenceConfig?: { baseUrl: string; model: string; apiKey?: string; temperature?: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Summarize planned events from a run's event graph into a compact list the
 * LLM can use to match natural-language references ("the PCR") to event refs.
 */
function summarizePlannedEvents(eventGraph: unknown): string {
  if (!eventGraph || typeof eventGraph !== 'object') return '(no planned events)';

  const eg = eventGraph as Record<string, unknown>;

  // event graph payload shape: { events: [...], labwares: [...] }
  const events = eg.events as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(events) || events.length === 0) return '(no planned events)';

  const lines = events.map((evt, idx) => {
    const eventId = evt.event_id ?? evt.eventId ?? `event-${idx}`;
    const eventType = typeof evt.event_type === 'string' ? evt.event_type : (typeof evt.eventType === 'string' ? evt.eventType : 'unknown');
    const verb = typeof evt.verb === 'string' ? evt.verb : '';
    const material = typeof evt.material_label === 'string' ? evt.material_label : (typeof evt.materialLabel === 'string' ? evt.materialLabel : '');
    const targetWellsRaw = evt.target_wells ?? evt.targetWells ?? [];
    const targetWells = Array.isArray(targetWellsRaw) ? targetWellsRaw.join(', ') : '';
    const params: string[] = [];
    if (verb) params.push(verb);
    if (material) params.push(material);
    if (targetWells) params.push(`wells: ${targetWells}`);
    const paramStr = params.length ? ` [${params.join(', ')}]` : '';
    return `${eventId}: ${eventType}${paramStr}`;
  });

  return lines.join('\n');
}

/**
 * Build a system prompt that instructs the LLM to classify the check-in
 * message into state change, observation, or deviation.
 */
function buildCheckinSystemPrompt(plannedEvents: string): string {
  return [
    'You are a lab execution assistant that parses natural-language check-in messages from scientists.',
    '',
    'The run has the following planned events:',
    plannedEvents,
    '',
    'Classify the message into exactly one of these types:',
    '',
    '1. state_change — The message indicates an event has moved to a new state (running, completed, skipped, deviated).',
    '2. observation — The message is a note or qualitative observation about the experiment.',
    '3. deviation — The message indicates a parameter was changed from the plan.',
    '4. other — The message does not fit the above categories.',
    '',
    'For each type, provide:',
    '- state_change: the eventRef (from the planned events list) and toState.',
    '- observation: the observation text and optionally an eventRef.',
    '- deviation: the eventRef, parameter, plannedValue, actualValue, and note.',
    '',
    'Return ONLY a valid JSON object with this shape (no markdown, no extra text):',
    JSON.stringify({
      interpretation: 'Brief plain-language summary of what the message means for execution',
      suggestedStateChange: { eventRef: 'string', toState: 'running|completed|skipped|deviated' },
      observation: { text: 'string', eventRef: 'string (optional)' },
      deviation: {
        eventRef: 'string',
        parameter: 'string',
        plannedValue: 'string',
        actualValue: 'string',
        note: 'string',
      },
    }, null, 2),
    '',
    'Rules:',
    '- Only include the field(s) relevant to the classification.',
    '- eventRef must match an event ID from the planned events list above.',
    '- interpretation should be concise (1-2 sentences).',
    '- If the message is ambiguous, prefer "observation" and capture the full message as the observation text.',
    '- If no eventRef can be confidently matched, use the most likely match and note it in interpretation.',
  ].join('\n');
}

/**
 * Extract JSON from LLM response — handles markdown code blocks and direct JSON.
 */
function extractJsonFromResponse(text: string): unknown {
  const trimmed = text.trim();

  // Try direct parse first
  try { return JSON.parse(trimmed); } catch {}

  // Try markdown code blocks
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(trimmed)) !== null) {
    if (match[1]) {
      try { return JSON.parse(match[1].trim()); } catch {}
    }
  }

  // Try bracket-balanced extraction
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = firstBrace; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = inString; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(trimmed.substring(firstBrace, i + 1)); } catch {}
          break;
        }
      }
    }
  }

  throw new Error(`Could not extract JSON from response (${trimmed.slice(0, 200)}${trimmed.length > 200 ? '...' : ''})`);
}

function generateEventId(): string {
  return `ee-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Build a persisted ExecutionEvent from the parsed check-in result.
 */
function buildExecutionEvent(
  response: CheckinResponse,
): ExecutionEvent | null {
  const now = new Date().toISOString();
  const observations: CheckinObservationWithTimestamp[] = [];
  const deviations: CheckinDeviationWithTimestamp[] = [];
  let eventRef = '';

  // Extract observation
  if (response.observation) {
    eventRef = response.observation.eventRef ?? eventRef;
    observations.push({
      text: response.observation.text,
      timestamp: now,
      ...(typeof response.observation.eventRef === 'string' ? { eventRef: response.observation.eventRef } : {}),
    });
  }

  // Extract deviation
  if (response.deviation) {
    eventRef = response.deviation.eventRef ?? eventRef;
    const devEntry: CheckinDeviationWithTimestamp = {
      eventRef: response.deviation.eventRef,
      parameter: response.deviation.parameter,
      plannedValue: response.deviation.plannedValue,
      actualValue: response.deviation.actualValue,
      timestamp: now,
    };
    if (typeof response.deviation.note === 'string') {
      devEntry.note = response.deviation.note;
    }
    deviations.push(devEntry);
  }

  // Extract state change event ref
  if (response.suggestedStateChange) {
    eventRef = response.suggestedStateChange.eventRef;
  }

  if (!eventRef && observations.length === 0 && deviations.length === 0) {
    return null;
  }

  const evt: ExecutionEvent = {
    id: generateEventId(),
    eventRef: eventRef || 'unknown',
    observations,
    deviations,
    timestamp: now,
  };

  // Add state if present
  if (response.suggestedStateChange) {
    evt.state = response.suggestedStateChange.toState;
  }

  return evt;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCheckinHandlers(options: CheckinHandlersOptions): CheckinHandlers {
  const { ctx, inferenceConfig } = options;
  const service = new RunWorkspaceService(ctx.store);
  const inferenceClient = inferenceConfig?.baseUrl
    ? createInferenceClient(inferenceConfig)
    : null;

  return {
    async parseCheckin(request, reply) {
      const { runId } = request.params;
      const { text } = request.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'text is required' };
      }

      // Load the run workspace to get planned events
      const workspace = await service.getRunWorkspace(runId);
      if (!workspace) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run not found: ${runId}` };
      }

      // Summarize planned events for the LLM
      const plannedEvents = summarizePlannedEvents(workspace.eventGraph?.payload ?? null);

      // If no inference client configured, return a basic interpretation
      if (!inferenceClient) {
        reply.status(200);
        const basicResponse: CheckinResponse = {
          interpretation: `(AI not configured) Raw check-in: "${text.trim()}"`,
        };
        // Still persist as an observation even without AI
        const evt: ExecutionEvent = {
          id: generateEventId(),
          eventRef: 'unknown',
          observations: [{ text: text.trim(), timestamp: new Date().toISOString() }],
          deviations: [],
          timestamp: new Date().toISOString(),
        };
        addEventForRun(runId, evt);
        basicResponse.persistedEvent = evt;
        return basicResponse;
      }

      const systemPrompt = buildCheckinSystemPrompt(plannedEvents);

      try {
        const completion = await inferenceClient.complete({
          model: inferenceConfig!.model,
          messages: [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: text.trim() },
          ],
          max_tokens: 1024,
          temperature: inferenceConfig?.temperature ?? 0.1,
        });

        const responseText = completion.choices?.[0]?.message?.content ?? '';

        if (!responseText) {
          reply.status(502);
          return {
            error: 'AI_EMPTY_RESPONSE',
            message: 'AI returned an empty response',
          };
        }

        const parsed = extractJsonFromResponse(responseText) as Record<string, unknown>;

        // Build the response, only including present fields
        const response: CheckinResponse = {
          interpretation: typeof parsed.interpretation === 'string'
            ? parsed.interpretation
            : `Parsed check-in: "${text.trim()}"`,
        };

        if (parsed.suggestedStateChange) {
          const sc = parsed.suggestedStateChange as Record<string, unknown>;
          response.suggestedStateChange = {
            eventRef: sc.eventRef as string,
            toState: sc.toState as 'running' | 'completed' | 'skipped' | 'deviated',
          };
        }

        if (parsed.observation) {
          const obs = parsed.observation as Record<string, unknown>;
          const observation: CheckinObservation = {
            text: typeof obs.text === 'string' ? obs.text : '',
          };
          if (typeof obs.eventRef === 'string') {
            observation.eventRef = obs.eventRef;
          }
          response.observation = observation;
        }

        if (parsed.deviation) {
          const dev = parsed.deviation as Record<string, unknown>;
          response.deviation = {
            eventRef: dev.eventRef as string,
            parameter: typeof dev.parameter === 'string' ? dev.parameter : '',
            plannedValue: typeof dev.plannedValue === 'string' ? dev.plannedValue : '',
            actualValue: typeof dev.actualValue === 'string' ? dev.actualValue : '',
            note: typeof dev.note === 'string' ? dev.note : '',
          };
        }

        // AUTO-PERSIST the structured data
        const persisted = buildExecutionEvent(response);
        if (persisted) {
          addEventForRun(runId, persisted);
          response.persistedEvent = persisted;
        }

        return response;
      } catch (err) {
        request.log.error(err, 'Check-in AI parsing failed');
        reply.status(500);
        return {
          error: 'AI_ERROR',
          message: err instanceof Error ? err.message : 'Failed to parse check-in message',
        };
      }
    },

    async getExecutionEvents(request, reply) {
      const { runId } = request.params;

      // Verify the run exists
      const workspace = await service.getRunWorkspace(runId);
      if (!workspace) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Run not found: ${runId}` };
      }

      const events = getEventsForRun(runId);

      return {
        runId,
        events,
      };
    },
  };
}
