import type {
  AgentClarification,
  AgentClarificationAnswer,
  AgentClarificationKind,
  AgentClarificationMenuProvider,
  AgentClarificationOption,
  AgentClarificationRequest,
} from './types.js';
import type { Gap } from '../compiler/pipeline/CompileContracts.js';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

export function normalizeClarificationKind(raw: unknown): AgentClarificationKind {
  const value = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (value.includes('aliquot')) return 'aliquot';
  if (value.includes('labware') || value.includes('plate') || value.includes('tube') || value.includes('reservoir')) return 'labware';
  if (value.includes('vendor')) return 'vendor-product';
  if (value.includes('material') || value.includes('reagent') || value.includes('cell')) return 'material';
  if (value.includes('ontology')) return 'ontology';
  if (value.includes('well')) return 'well-selection';
  if (value.includes('sequence') || value.includes('step')) return 'sequence';
  if (value.includes('parameter') || value.includes('volume') || value.includes('count') || value.includes('concentration') || value.includes('percent') || value.includes('%')) return 'parameter';
  return 'general';
}

export function menuProviderForKind(kind: AgentClarificationKind): AgentClarificationMenuProvider {
  if (kind === 'labware') return '/l';
  if (kind === 'material' || kind === 'aliquot' || kind === 'vendor-product' || kind === 'ontology') return '/m';
  return 'choice';
}

function parseOption(raw: unknown): AgentClarificationOption | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = asString(r.id);
  const label = asString(r.label);
  if (!id || !label) return null;
  const out: AgentClarificationOption = { id, label };
  const snippet = asString(r.snippet);
  if (snippet) out.snippet = snippet;
  const source = asString(r.source);
  if (source) out.source = source;
  if (typeof r.score === 'number' && Number.isFinite(r.score)) out.score = r.score;
  const ref = asRecord(r.ref);
  if (ref) out.ref = ref;
  return out;
}

function splitNumberedPrompt(prompt: string): string[] {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  const markers = [...normalized.matchAll(/(?:^|\s)(\d+)\.\s+/g)];
  if (markers.length < 2) return [];
  return markers
    .map((marker, index) => {
      const start = (marker.index ?? 0) + marker[0].length;
      const end = index + 1 < markers.length ? markers[index + 1]!.index ?? normalized.length : normalized.length;
      return normalized.slice(start, end).trim();
    })
    .filter((part) => part.length > 0);
}

function optionKind(option: AgentClarificationOption): AgentClarificationKind {
  return normalizeClarificationKind((option.label + ' ' + (option.snippet ?? '') + ' ' + (option.source ?? '')).trim());
}

function isInventoryDepthRequest(request: AgentClarificationRequest): boolean {
  const text = [request.kind, request.entityType, request.prompt, request.query, request.snippet]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!/(aliquot|inventory|vial|source)/.test(text)) return false;
  return /(which|should|search|available|look for|use)/.test(text);
}

function expandCompoundChoiceRequest(request: AgentClarificationRequest): AgentClarificationRequest[] {
  if (request.menuProvider !== 'choice') return [request];
  const parts = splitNumberedPrompt(request.prompt);
  if (parts.length < 2) return [request];
  return parts.map((prompt, index) => {
    const kind = normalizeClarificationKind(prompt);
    const options = request.options.filter((option) => optionKind(option) === kind);
    return {
      ...request,
      id: request.id + '-' + String(index + 1),
      kind,
      prompt,
      entityType: kind,
      menuProvider: menuProviderForKind(kind),
      options,
    };
  });
}

export function parseClarificationRequests(raw: unknown): AgentClarificationRequest[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentClarificationRequest[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const prompt = asString(r.prompt) ?? asString(r.message);
    if (!prompt) continue;
    const kind = normalizeClarificationKind(r.kind ?? r.entityType);
    const id = asString(r.id) ?? `clarify-${out.length + 1}`;
    const options = Array.isArray(r.options)
      ? r.options.map(parseOption).filter((o): o is AgentClarificationOption => o !== null)
      : [];
    const menuProviderRaw = asString(r.menuProvider);
    const menuProvider: AgentClarificationMenuProvider =
      menuProviderRaw === '/m' || menuProviderRaw === '/l' || menuProviderRaw === 'choice'
        ? menuProviderRaw
        : menuProviderForKind(kind);

    const request: AgentClarificationRequest = { id, kind, prompt, menuProvider, options };
    const entityType = asString(r.entityType);
    if (entityType) request.entityType = entityType;
    const query = asString(r.query);
    if (query) request.query = query;
    const roleId = asString(r.roleId);
    if (roleId) request.roleId = roleId;
    const slot = asString(r.slot);
    if (slot) request.slot = slot;
    const snippet = asString(r.snippet);
    if (snippet) request.snippet = snippet;
    if (typeof r.allowCreateLocal === 'boolean') request.allowCreateLocal = r.allowCreateLocal;
    const sourceSpan = asRecord(r.sourceSpan);
    if (sourceSpan) {
      const start = typeof sourceSpan.start === 'number' ? sourceSpan.start : undefined;
      const end = typeof sourceSpan.end === 'number' ? sourceSpan.end : undefined;
      if (start !== undefined || end !== undefined) request.sourceSpan = { ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}) };
    }
    for (const expanded of expandCompoundChoiceRequest(request)) {
      if (!isInventoryDepthRequest(expanded)) out.push(expanded);
    }
  }
  return out;
}

export function clarificationRequestFromLegacy(
  clarification: AgentClarification,
  index = 0,
): AgentClarificationRequest {
  const kind = normalizeClarificationKind(clarification.entityType);
  const request: AgentClarificationRequest = {
    id: clarification.id ?? `clarify-${index + 1}`,
    kind,
    prompt: clarification.prompt,
    entityType: clarification.entityType,
    menuProvider: clarification.menuProvider ?? menuProviderForKind(kind),
    options: clarification.options,
  };
  if (clarification.query) request.query = clarification.query;
  if (clarification.roleId) request.roleId = clarification.roleId;
  if (clarification.slot) request.slot = clarification.slot;
  if (clarification.snippet) request.snippet = clarification.snippet;
  if (clarification.allowCreateLocal !== undefined) request.allowCreateLocal = clarification.allowCreateLocal;
  return request;
}

export function legacyClarificationFromRequests(
  requests: AgentClarificationRequest[],
): AgentClarification | undefined {
  const first = requests[0];
  if (!first) return undefined;
  return {
    id: first.id,
    prompt: first.prompt,
    entityType: first.entityType ?? first.kind,
    options: first.options,
    menuProvider: first.menuProvider,
    ...(first.query ? { query: first.query } : {}),
    ...(first.roleId ? { roleId: first.roleId } : {}),
    ...(first.slot ? { slot: first.slot } : {}),
    ...(first.snippet ? { snippet: first.snippet } : {}),
    ...(first.allowCreateLocal !== undefined ? { allowCreateLocal: first.allowCreateLocal } : {}),
  };
}

export function clarificationRequestsFromGaps(gaps: readonly Gap[]): AgentClarificationRequest[] {
  const requests: AgentClarificationRequest[] = [];
  for (const gap of gaps) {
    if (gap.kind !== 'clarification' && gap.kind !== 'unresolved_ref') continue;
    const details = asRecord(gap.details);
    const kind = normalizeClarificationKind(details?.kind ?? details?.entityType ?? details?.reason ?? gap.message);
    const query = asString(details?.query) ?? asString(details?.label);
    requests.push({
      id: asString(details?.id) ?? `gap-${requests.length + 1}`,
      kind,
      prompt: gap.message,
      entityType: asString(details?.entityType) ?? kind,
      menuProvider: menuProviderForKind(kind),
      ...(query ? { query } : {}),
      options: [],
    });
  }
  return requests;
}

export function parseClarificationAnswers(raw: unknown): AgentClarificationAnswer[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentClarificationAnswer[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const requestId = asString(r.requestId);
    if (!requestId) continue;
    const answer: AgentClarificationAnswer = { requestId };
    const optionId = asString(r.optionId);
    if (optionId) answer.optionId = optionId;
    const label = asString(r.label);
    if (label) answer.label = label;
    const value = asString(r.value);
    if (value) answer.value = value;
    const mentionToken = asString(r.mentionToken);
    if (mentionToken) answer.mentionToken = mentionToken;
    const ref = asRecord(r.ref);
    if (ref) answer.ref = ref;
    out.push(answer);
  }
  return out;
}
