import type { AppContext } from '../../../server.js';
import type { RecordEnvelope } from '../../../types/RecordEnvelope.js';
import { compileAssistPlusPlan } from '../../compilers/assistPlusCompiler.js';

type FetchLikeResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  headers?: {
    get: (name: string) => string | null;
  };
};

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<FetchLikeResponse>;
export type AssistEmitterMode = 'local' | 'pyalab' | 'default';

export type AssistPlannedRunPayload = {
  recordId: string;
  title: string;
  sourceRef: { id: string };
  deckLayout?: {
    assignments?: Array<{
      labwareRole: string;
      position: string;
      orientation?: 'landscape' | 'portrait';
    }>;
  };
};

export type AssistEventGraphPayload = {
  events?: Array<{
    eventId?: string;
    event_type?: string;
  }>;
};

export type AssistExecutionPlanPayload = {
  placements?: {
    labware?: Array<{
      labware_ref?: string;
      slot_id?: string;
      orientation?: 'default' | 'rot90' | 'rot180' | 'rot270';
    }>;
    tipracks?: Array<{
      tiprack_id?: string;
      slot_id?: string;
      tip_type?: string;
      starting_tip?: string;
      next_tip_well?: string;
      consumed_count?: number;
      depleted?: boolean;
    }>;
  };
  strategy?: {
    tip_policy?: string;
  };
  tip_management?: {
    mode?: 'robot' | 'manual';
    pause_on_depletion?: boolean;
    replacement_policy?: 'full_rack_default' | 'partial_override';
    runtime_actions?: Array<{
      action_id?: string;
      kind?: 'pause_for_tip_reload' | 'operator_prompt' | 'note';
      message?: string;
      target_tiprack_id?: string;
    }>;
  };
};

export type AssistEmitterInput = {
  robotPlanId: string;
  plannedRun?: AssistPlannedRunPayload;
  protocolEnvelope?: RecordEnvelope | null;
  eventGraph?: AssistEventGraphPayload | null;
  executionPlan?: AssistExecutionPlanPayload | null;
};

export type AssistEmitterOutput = {
  deckSlots: unknown[];
  pipettes: unknown[];
  executionSteps: unknown[];
  vialabXml: string;
  notes?: string;
  emitter: 'local_ts' | 'pyalab_http';
  emitterVersion?: string;
};

export interface AssistPlusEmitter {
  emit(input: AssistEmitterInput): Promise<AssistEmitterOutput>;
}

type PyalabEmitJsonResponse = {
  vialabXml?: string;
  xml?: string;
  artifactXml?: string;
  deckSlots?: unknown[];
  pipettes?: unknown[];
  executionSteps?: unknown[];
  notes?: string;
  emitterVersion?: string;
};

function parseJsonMaybe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

class LocalAssistPlusEmitter implements AssistPlusEmitter {
  async emit(input: AssistEmitterInput): Promise<AssistEmitterOutput> {
    const compiled = compileAssistPlusPlan({
      robotPlanId: input.robotPlanId,
      ...(input.plannedRun ? { plannedRun: input.plannedRun } : {}),
      ...(input.protocolEnvelope !== undefined ? { protocolEnvelope: input.protocolEnvelope } : {}),
      ...(input.eventGraph ? { eventGraph: input.eventGraph } : {}),
      ...(input.executionPlan ? { executionPlan: input.executionPlan } : {}),
    });
    return {
      deckSlots: compiled.deckSlots,
      pipettes: compiled.pipettes,
      executionSteps: compiled.executionSteps,
      vialabXml: compiled.vialabXml,
      notes: compiled.notes,
      emitter: 'local_ts',
      emitterVersion: 'computable-lab-assist-local-v1',
    };
  }
}

class PyalabHttpAssistPlusEmitter implements AssistPlusEmitter {
  private readonly url: string;
  private readonly token: string | undefined;
  private readonly fetchFn: FetchLike;
  private readonly fallback: LocalAssistPlusEmitter;

  constructor(url: string, fetchFn: FetchLike, token?: string) {
    this.url = url;
    this.fetchFn = fetchFn;
    this.token = token;
    this.fallback = new LocalAssistPlusEmitter();
  }

  async emit(input: AssistEmitterInput): Promise<AssistEmitterOutput> {
    const fallbackCompiled = await this.fallback.emit(input);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
    };
    const body = JSON.stringify({
      targetPlatform: 'integra_assist',
      contractVersion: '1',
      robotPlanId: input.robotPlanId,
      execution: {
        ...(input.plannedRun ? { plannedRun: input.plannedRun } : {}),
        ...(input.protocolEnvelope ? { protocolEnvelope: input.protocolEnvelope } : {}),
        ...(input.eventGraph ? { eventGraph: input.eventGraph } : {}),
        ...(input.executionPlan ? { executionPlan: input.executionPlan } : {}),
      },
    });

    const response = await this.fetchFn(this.url, {
      method: 'POST',
      headers,
      body,
    });
    const responseText = await response.text();
    if (!response.ok) {
      const summary = responseText.trim();
      throw new Error(`pyalab emitter request failed (${response.status}): ${summary.length > 0 ? summary : 'empty response'}`);
    }

    const parsedJson = parseJsonMaybe(responseText) as PyalabEmitJsonResponse | undefined;
    const headerType = response.headers?.get('content-type') ?? '';
    const isJson = headerType.includes('application/json') || (responseText.trim().startsWith('{') && responseText.trim().endsWith('}'));
    const vialabXml = isJson
      ? parsedJson?.vialabXml ?? parsedJson?.xml ?? parsedJson?.artifactXml
      : responseText;

    if (typeof vialabXml !== 'string' || vialabXml.trim().length === 0) {
      throw new Error('pyalab emitter response did not include XML content');
    }

    return {
      deckSlots: Array.isArray(parsedJson?.deckSlots) ? parsedJson.deckSlots : fallbackCompiled.deckSlots,
      pipettes: Array.isArray(parsedJson?.pipettes) ? parsedJson.pipettes : fallbackCompiled.pipettes,
      executionSteps: Array.isArray(parsedJson?.executionSteps) ? parsedJson.executionSteps : fallbackCompiled.executionSteps,
      vialabXml,
      ...(typeof parsedJson?.notes === 'string'
        ? { notes: parsedJson.notes }
        : fallbackCompiled.notes !== undefined
          ? { notes: fallbackCompiled.notes }
          : {}),
      emitter: 'pyalab_http',
      emitterVersion: typeof parsedJson?.emitterVersion === 'string' ? parsedJson.emitterVersion : 'pyalab-http-v1',
    };
  }
}

export function createAssistPlusEmitter(
  _ctx: AppContext,
  fetchFn?: FetchLike,
  modeOverride: AssistEmitterMode = 'default'
): AssistPlusEmitter {
  const resolvedMode = modeOverride === 'default'
    ? (process.env['ASSIST_EMITTER'] ?? process.env['LABOS_ASSIST_EMITTER'] ?? 'local').toLowerCase()
    : modeOverride;
  const mode = resolvedMode.toLowerCase();
  if (mode === 'pyalab' || mode === 'pyalab_http') {
    const url = process.env['LABOS_PYALAB_EMIT_URL'] ?? process.env['PYALAB_EMIT_URL'];
    if (typeof url === 'string' && url.length > 0) {
      const token = process.env['LABOS_PYALAB_EMIT_TOKEN'] ?? process.env['PYALAB_EMIT_TOKEN'];
      return new PyalabHttpAssistPlusEmitter(url, fetchFn ?? (globalThis.fetch as unknown as FetchLike), token);
    }
    console.warn('ASSIST_EMITTER=pyalab requested but LABOS_PYALAB_EMIT_URL is unset; falling back to local Assist emitter');
  }
  return new LocalAssistPlusEmitter();
}
