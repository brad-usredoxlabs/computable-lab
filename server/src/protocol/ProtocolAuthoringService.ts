import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { InferenceClient } from '../ai/types.js';
import type { InferenceConfig } from '../config/types.js';

const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const PROTOCOL_IDE_SESSION_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml';

export type ProtocolStructureSuggestionKind =
  | 'material'
  | 'equipment'
  | 'step'
  | 'unresolved_reference'
  | 'variant';

export interface ProtocolStructureSuggestion {
  id: string;
  kind: ProtocolStructureSuggestionKind;
  label: string;
  roleId?: string;
  description?: string;
  sourceText?: string;
  confidence?: number;
  draft?: Record<string, unknown>;
}

export interface ProtocolAuthoringSessionResponse {
  success: true;
  protocolId: string;
  sessionId: string;
  status: string;
}

export interface ProtocolSuggestionResponse {
  success: true;
  protocolId: string;
  suggestions: ProtocolStructureSuggestion[];
}

export interface ProtocolApplySuggestionsResponse {
  success: true;
  protocolId: string;
  applied: {
    materialRoles: number;
    equipmentRoles: number;
    steps: number;
  };
  protocol: RecordEnvelope;
}

export class ProtocolAuthoringError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'ProtocolAuthoringError';
  }
}

export interface ProtocolAuthoringServiceOptions {
  inferenceClient?: InferenceClient;
  inferenceConfig?: InferenceConfig;
}

export class ProtocolAuthoringService {
  constructor(
    private readonly store: RecordStore,
    private readonly options: ProtocolAuthoringServiceOptions = {},
  ) {}

  async createAuthoringSession(protocolId: string): Promise<ProtocolAuthoringSessionResponse> {
    const protocol = await this.getProtocol(protocolId);
    const payload = asRecord(protocol.payload);
    const existingSessionId = getRecordRefId(asRecord(payload.authoring)?.sessionRef);
    if (existingSessionId && await this.store.exists(existingSessionId)) {
      return { success: true, protocolId, sessionId: existingSessionId, status: 'ready' };
    }

    const sessionId = `PIS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const title = stringValue(payload.title) ?? protocolId;
    const prose = protocolProse(payload);
    const sessionEnvelope: RecordEnvelope = {
      schemaId: PROTOCOL_IDE_SESSION_SCHEMA_ID,
      recordId: sessionId,
      payload: {
        kind: 'protocol-ide-session',
        recordId: sessionId,
        sourceMode: 'directive',
        status: 'ready',
        title,
        latestDirectiveText: prose || `Author protocol ${title}`,
        latestProtocolRef: { kind: 'record', id: protocolId, type: 'protocol', label: title },
        sourceSummary: `TapTab authoring session for ${title}`,
        evidenceRefs: [],
        rollingIssueSummary: '',
        issueCardRefs: [],
        notes: 'Protocol authoring sidecar linked to the canonical protocol record.',
      },
      meta: { kind: 'protocol-ide-session', createdAt: now, updatedAt: now },
    };

    const created = await this.store.create({
      envelope: sessionEnvelope,
      message: `Create protocol authoring session ${sessionId} for ${protocolId}`,
      skipLint: true,
    });
    if (!created.success) {
      throw new ProtocolAuthoringError('SESSION_CREATE_FAILED', created.error ?? 'Failed to create authoring session', 500);
    }

    const updatedPayload = {
      ...payload,
      authoring: {
        ...asRecord(payload.authoring),
        sessionRef: { kind: 'record', id: sessionId, type: 'protocol-ide-session', label: `Authoring session for ${title}` },
        linkedAt: now,
      },
    };
    await this.updateProtocol(protocol, updatedPayload, `Link protocol ${protocolId} to authoring session ${sessionId}`);

    return { success: true, protocolId, sessionId, status: 'ready' };
  }

  async suggestStructure(protocolId: string): Promise<ProtocolSuggestionResponse> {
    const protocol = await this.getProtocol(protocolId);
    const payload = asRecord(protocol.payload);
    const prose = protocolProse(payload);
    let suggestions: ProtocolStructureSuggestion[] = [];

    if (this.options.inferenceClient && this.options.inferenceConfig?.model && prose.trim()) {
      suggestions = await this.suggestWithAi(prose).catch(() => []);
    }
    if (suggestions.length === 0) {
      suggestions = suggestWithHeuristics(prose, payload);
    }

    return { success: true, protocolId, suggestions };
  }

  async applySuggestions(
    protocolId: string,
    suggestions: ProtocolStructureSuggestion[],
  ): Promise<ProtocolApplySuggestionsResponse> {
    const protocol = await this.getProtocol(protocolId);
    const payload = asRecord(protocol.payload);
    const roles = { ...asRecord(payload.roles) };
    const materialRoles = Array.isArray(roles.materialRoles) ? [...roles.materialRoles] : [];
    const instrumentRoles = Array.isArray(roles.instrumentRoles) ? [...roles.instrumentRoles] : [];
    const steps = Array.isArray(payload.steps) ? [...payload.steps] : [];

    let appliedMaterials = 0;
    let appliedEquipment = 0;
    let appliedSteps = 0;

    for (const suggestion of suggestions) {
      if (!suggestion || typeof suggestion !== 'object') continue;
      const roleId = normalizeRoleId(suggestion.roleId ?? suggestion.label);
      if (suggestion.kind === 'material' && roleId && !hasRole(materialRoles, roleId)) {
        materialRoles.push({
          roleId,
          ...(suggestion.description ? { description: suggestion.description } : {}),
        });
        appliedMaterials += 1;
      }
      if (suggestion.kind === 'equipment' && roleId && !hasRole(instrumentRoles, roleId)) {
        instrumentRoles.push({
          roleId,
          ...(suggestion.description ? { description: suggestion.description } : {}),
        });
        appliedEquipment += 1;
      }
      if (suggestion.kind === 'step') {
        const stepId = normalizeRoleId(suggestion.roleId ?? suggestion.label) || `step_${steps.length + 1}`;
        if (!hasStep(steps, stepId)) {
          steps.push({
            stepId,
            kind: 'other',
            description: suggestion.description ?? suggestion.sourceText ?? suggestion.label,
            label: suggestion.label,
          });
          appliedSteps += 1;
        }
      }
    }

    const updated = await this.updateProtocol(protocol, {
      ...payload,
      roles: {
        ...roles,
        materialRoles,
        instrumentRoles,
      },
      steps,
    }, `Apply ${suggestions.length} accepted protocol structure suggestion(s) to ${protocolId}`);

    return {
      success: true,
      protocolId,
      applied: {
        materialRoles: appliedMaterials,
        equipmentRoles: appliedEquipment,
        steps: appliedSteps,
      },
      protocol: updated,
    };
  }

  private async getProtocol(protocolId: string): Promise<RecordEnvelope> {
    const protocol = await this.store.get(protocolId);
    if (!protocol) throw new ProtocolAuthoringError('PROTOCOL_NOT_FOUND', `Protocol not found: ${protocolId}`, 404);
    if (asRecord(protocol.payload).kind !== 'protocol') {
      throw new ProtocolAuthoringError('NOT_PROTOCOL', `Record ${protocolId} is not a protocol`, 400);
    }
    return protocol;
  }

  private async updateProtocol(
    envelope: RecordEnvelope,
    payload: Record<string, unknown>,
    message: string,
    skipValidation = false,
  ): Promise<RecordEnvelope> {
    const updated: RecordEnvelope = {
      ...envelope,
      schemaId: envelope.schemaId || PROTOCOL_SCHEMA_ID,
      payload,
      meta: {
        ...(envelope.meta ?? {}),
        kind: 'protocol',
        updatedAt: new Date().toISOString(),
      },
    };
    const result = await this.store.update({ envelope: updated, message, skipLint: true, skipValidation });
    if (!result.success) {
      throw new ProtocolAuthoringError('PROTOCOL_UPDATE_FAILED', result.error ?? 'Failed to update protocol', 500);
    }
    return result.envelope ?? updated;
  }

  private async suggestWithAi(prose: string): Promise<ProtocolStructureSuggestion[]> {
    const client = this.options.inferenceClient;
    const model = this.options.inferenceConfig?.model;
    if (!client || !model) return [];
    const response = await client.complete({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Extract advisory structure suggestions from a lab protocol. Return only JSON with a suggestions array. ' +
            'Each suggestion has kind material, equipment, step, unresolved_reference, or variant; label; optional roleId; description; sourceText; confidence. Do not invent facts.',
        },
        { role: 'user', content: prose.slice(0, 12000) },
      ],
      temperature: this.options.inferenceConfig?.temperature ?? 0,
      max_tokens: Math.min(this.options.inferenceConfig?.maxTokens ?? 2048, 4096),
    });
    const content = response.choices?.[0]?.message?.content ?? '';
    return normalizeSuggestions(parseJsonObject(content)?.suggestions);
  }
}

function protocolProse(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  const description = stringValue(payload.description);
  if (description) parts.push(description);
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  for (const step of steps) {
    const record = asRecord(step);
    const label = stringValue(record.label);
    const detail = stringValue(record.description) ?? stringValue(record.notes);
    if (label || detail) parts.push([label, detail].filter(Boolean).join(': '));
  }
  return parts.join('\n');
}

function suggestWithHeuristics(prose: string, payload: Record<string, unknown>): ProtocolStructureSuggestion[] {
  const suggestions: ProtocolStructureSuggestion[] = [];
  const lower = prose.toLowerCase();
  const materialTerms = ['buffer', 'media', 'reagent', 'antibody', 'enzyme', 'water', 'pbs', 'ethanol', 'sample'];
  const equipmentTerms = ['centrifuge', 'incubator', 'plate reader', 'thermocycler', 'pipette', 'vortex', 'shaker', 'magnet'];

  for (const term of materialTerms) {
    if (lower.includes(term)) {
      suggestions.push(makeSuggestion('material', term, `Material role suggested from prose mention of ${term}.`, 0.62));
    }
  }
  for (const term of equipmentTerms) {
    if (lower.includes(term)) {
      suggestions.push(makeSuggestion('equipment', term, `Equipment role suggested from prose mention of ${term}.`, 0.62));
    }
  }

  const existingSteps = Array.isArray(payload.steps) ? payload.steps : [];
  if (existingSteps.length <= 1) {
    const lines = prose.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 8);
    for (const [index, line] of lines.entries()) {
      if (/^(\d+[.)]|step\s+\d+|add|mix|incubate|wash|transfer|read|centrifuge)\b/i.test(line)) {
        suggestions.push({
          id: `step:${index + 1}:${hashId(line)}`,
          kind: 'step',
          label: line.replace(/^\d+[.)]\s*/, '').slice(0, 80),
          roleId: `step_${index + 1}`,
          description: line,
          sourceText: line,
          confidence: 0.58,
        });
      }
    }
  }

  return dedupeSuggestions(suggestions).slice(0, 24);
}

function makeSuggestion(
  kind: 'material' | 'equipment',
  label: string,
  description: string,
  confidence: number,
): ProtocolStructureSuggestion {
  const roleId = normalizeRoleId(label) || label;
  return {
    id: `${kind}:${roleId}`,
    kind,
    label: titleCase(label),
    roleId,
    description,
    sourceText: label,
    confidence,
  };
}

function normalizeSuggestions(value: unknown): ProtocolStructureSuggestion[] {
  if (!Array.isArray(value)) return [];
  return dedupeSuggestions(value.flatMap((item, index) => {
    const record = asRecord(item);
    const kind = stringValue(record.kind) as ProtocolStructureSuggestionKind | undefined;
    if (!kind || !['material', 'equipment', 'step', 'unresolved_reference', 'variant'].includes(kind)) return [];
    const label = stringValue(record.label) ?? stringValue(record.sourceText) ?? kind;
    const roleId = normalizeRoleId(stringValue(record.roleId) ?? label);
    const suggestion: ProtocolStructureSuggestion = {
      id: stringValue(record.id) ?? `${kind}:${roleId || index}`,
      kind,
      label,
    };
    if (roleId) suggestion.roleId = roleId;
    const description = stringValue(record.description);
    if (description) suggestion.description = description;
    const sourceText = stringValue(record.sourceText);
    if (sourceText) suggestion.sourceText = sourceText;
    if (typeof record.confidence === 'number') suggestion.confidence = record.confidence;
    const draft = asOptionalRecord(record.draft);
    if (draft) suggestion.draft = draft;
    return [suggestion];
  }));
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  for (const attempt of [candidate, candidate.slice(candidate.indexOf('{'), candidate.lastIndexOf('}') + 1)]) {
    if (!attempt || !attempt.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(attempt);
      return asRecord(parsed);
    } catch {
      // keep trying
    }
  }
  return null;
}

function dedupeSuggestions(suggestions: ProtocolStructureSuggestion[]): ProtocolStructureSuggestion[] {
  const seen = new Set<string>();
  const out: ProtocolStructureSuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = `${suggestion.kind}:${suggestion.roleId ?? suggestion.label}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(suggestion);
  }
  return out;
}

function normalizeRoleId(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || undefined;
}

function hasRole(roles: unknown[], roleId: string): boolean {
  return roles.some((role) => stringValue(asRecord(role).roleId) === roleId);
}

function hasStep(steps: unknown[], stepId: string): boolean {
  return steps.some((step) => stringValue(asRecord(step).stepId) === stepId);
}

function getRecordRefId(value: unknown): string | undefined {
  const record = asRecord(value);
  return record.kind === 'record' ? stringValue(record.id) : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function hashId(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}
