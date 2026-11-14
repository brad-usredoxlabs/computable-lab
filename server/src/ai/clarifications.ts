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
  if (value.includes('equipment') || value.includes('instrument')) return 'equipment';
  if (value.includes('material') || value.includes('reagent') || value.includes('cell')) return 'material';
  if (value.includes('ontology')) return 'ontology';
  if (value.includes('well')) return 'well-selection';
  if (value.includes('sequence') || value.includes('step')) return 'sequence';
  if (value.includes('parameter') || value.includes('volume') || value.includes('count') || value.includes('concentration') || value.includes('percent') || value.includes('%')) return 'parameter';
  return 'general';
}

export function menuProviderForKind(kind: AgentClarificationKind): AgentClarificationMenuProvider {
  if (kind === 'labware') return '/l';
  if (kind === 'equipment') return '/e';
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
      menuProviderRaw === '/m' || menuProviderRaw === '/l' || menuProviderRaw === '/e' || menuProviderRaw === 'choice'
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

/**
 * Map structured assurance BLOCK findings into menu-backed clarification
 * requests so the UI can render live pickers (materials) or inline answers,
 * reusing the existing ClarificationPicker/QuestionsPanel pattern.
 */
export function clarificationRequestsFromAssurance(
  blockers: Array<{ code: string; mention?: string; candidateIds?: string[]; message: string }>,
  startIndex = 0,
): AgentClarificationRequest[] {
  const requests: AgentClarificationRequest[] = [];
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i]!;
    const kind = normalizeClarificationKind(
      b.code.includes('QUANTITY') ? 'parameter'
        : b.mention ?? b.code,
    );
    // L2-P1-CREATE-DOOR-1 (unit absdoor): a binding blocker with NO candidates
    // is a miss this lab's records do not hold — declare it as a NAMED
    // unresolved slot (context §2.7: identity is a record id, never a name; a
    // miss is a named unresolved slot). `absence` rides a conditional spread
    // (exactOptionalPropertyTypes: the key is ABSENT, never `undefined`) and
    // is emitted ONLY when there is no candidate to bind. The reason is ONE
    // server-side phrase matching the shipped slash-menu diagnostic
    // (app/src/shared/taptab/slashMenu/resolvers.ts:568: "Not in this lab's
    // records: <label>") — the client renders the server's words verbatim and
    // never composes its own sentence about absence.
    const hasCandidates = b.code === 'AMBIGUOUS_BINDING' && (b.candidateIds?.length ?? 0) > 0;
    const absence =
      b.code === 'AMBIGUOUS_BINDING' && !hasCandidates && b.mention !== undefined && b.mention !== ''
        ? { mention: b.mention, reason: `Not in this lab's records: ${b.mention}` }
        : undefined;
    const request: AgentClarificationRequest = {
      id: `assurance-${startIndex + i + 1}`,
      kind,
      prompt: b.message,
      menuProvider: menuProviderForKind(kind),
      options: [],
      ...(b.mention ? { query: b.mention, snippet: b.mention } : {}),
      ...(absence ? { absence } : {}),
    };
    // For a material ambiguity with known candidates, surface them as options.
    if (hasCandidates) {
      request.options = b.candidateIds!.map((cid) => ({ id: cid, label: cid }));
    }
    requests.push(request);
  }
  return requests;
}

/**
 * L2-P1-EMPTY-TURN-CARD-2 (u1emptycard) — the empty-turn guard's NAMED
 * ABSENCE card.
 *
 * When an agent turn ends having produced NOTHING (the empty-turn guard) and
 * the user's sentence names a labware noun that has NO match in the store or
 * the deck, the done result must ALSO carry a typed clarificationRequest
 * declaring that absence — so the client's existing typed-clarification arm
 * renders the actionable clarifier card beside the named-cause error (no
 * client change). Gate defect D1 of PROMPT1-GATE-20261114T192103Z (second
 * occurrence): the prompt-1 manifest utterance ended "No events generated."
 * with ZERO records.
 *
 * The probe is a STORE/DECK EXISTENCE lookup only (the composed
 * `searchLabwareByHint`, the SAME lookup the compile uses) — resolution is
 * never re-asked (compiler/resolve stay untouched).
 *
 * Deterministic, dumb extraction: strip the leading action verb, split on the
 * corpus delimiter set (`,`, `and`), strip parentheticals and trailing
 * catalog fragments, and keep only phrases that carry a labware head noun.
 * The FIRST candidate (longest first) whose probe returns ZERO matches is the
 * NAMED ABSENCE — at most ONE request. Every candidate matches, or none
 * extract, returns [] — a truly contentless turn keeps its current honest
 * error with no card (AC3: a turn naming an EXISTING labware gets no new
 * card; behaviour byte-unchanged).
 */

/**
 * The `[Answered clarifications]` trailer `appendClarificationAnswersToPrompt`
 * appends to the prompt (AgentOrchestrator.ts:278-292). It must never leak
 * into a mention: the trailer is authoritative ANSWER data, not user wording.
 */
const ANSWERED_CLARIFICATIONS_TRAILER = /\n\s*\[Answered clarifications\][\s\S]*$/;

/** Leading action verb the corpus uses to name a labware placement. */
const EMPTY_TURN_ACTION_VERB = /^(?:place|add|create|set up|put|run)\s+/i;

/**
 * The labware head nouns the corpus uses (the existing vocabulary). A head
 * must not be a PREFIX of a longer word: `well` inside "black-walled" is NOT
 * a well (the trailing-letter guard), but the hyphen-token `384-well` is.
 */
const EMPTY_TURN_LABWARE_HEAD =
  /\b(?:plate|plates|tube|rack|racks|reservoir|reservoirs|vial|cryobox|well)(?![a-z])/i;

/** A fragment that is pure well/deck/volume/count noise - never a noun. */
const EMPTY_TURN_NOISE =
  /^\d+\s*[-]?\s*(?:well|wells|plate|plates|tube|tubes|row|rows|column|columns|channel|channels|slot|slots|microliter|microliters|micro|ml|ul|uL|mL)(?:\s*[-,]?\s*\S*)?$/i;

/**
 * Extract candidate labware noun phrases from a user sentence.
 *
 * Dumb and deterministic: strip the leading action verb, drop parentheticals
 * and the answered-clarifications trailer, split on the corpus delimiter set
 * (`,` and standalone `and`), trim, and keep only fragments that carry a
 * labware head noun and are not pure well/deck/volume/count noise.
 */
export function extractEmptyTurnLabwarePhrases(sentence: string): string[] {
  if (typeof sentence !== 'string') return [];
  const text = sentence.replace(ANSWERED_CLARIFICATIONS_TRAILER, '');
  const noParenthetical = text.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  const withoutVerb = noParenthetical.replace(EMPTY_TURN_ACTION_VERB, '');
  const fragments = withoutVerb
    .split(/,|and(?=\s)/)
    .map((fragment) => fragment.trim().replace(/[.;!?]+$/, '').trim())
    // A leading determiner is not part of the noun ("a Thermo ..." names
    // "Thermo ..."): strip it so the mention (and the prefill) carries the
    // noun, original casing, trimmed.
    .map((fragment) => fragment.replace(/^(?:a|an|the)\s+/i, '').trim())
    // A trailing prepositional phrase is a LOCATION (on the deck, into well
    // A1), not part of the noun: strip it so the probe never carries a
    // location the labware name can never hold.
    .map((fragment) => fragment.replace(/\s+(?:on|onto|into|in|at|to)\b[\s\S]*$/, '').trim())
    .filter(
      (fragment) =>
        fragment.length > 0 &&
        EMPTY_TURN_LABWARE_HEAD.test(fragment) &&
        !EMPTY_TURN_NOISE.test(fragment),
    );
  return fragments;
}

/**
 * Given the user turn text and the composed `searchLabwareByHint`, return
 * `AgentClarificationRequest[]` with AT MOST ONE request: a NAMED ABSENCE for
 * the FIRST candidate (longest first) that the store/deck lookup returns ZERO
 * matches for. Every candidate matches, or none extract, returns [].
 *
 * The request reuses the SAME absence vocabulary as
 * `clarificationRequestsFromAssurance` (line ~257): `absence.mention` is the
 * trimmed original-casing noun, `absence.reason` is the one server-side phrase
 * ``Not in this lab's records: <mention>``, `options` stay empty, and
 * `query`/`snippet` carry the mention. `kind` is normalized via
 * `normalizeClarificationKind` (the plate sentence normalizes 'labware').
 */
export async function emptyTurnAbsenceRequests(
  turnText: string,
  searchLabwareByHint: (hint: string) => Promise<Array<{ recordId: string; title: string }>>,
): Promise<AgentClarificationRequest[]> {
  const candidates = extractEmptyTurnLabwarePhrases(turnText);
  if (candidates.length === 0) return [];
  // Longest first: the most specific (full-phrase) noun is probed first. The
  // probe is the FULL extracted phrase — never a sub-window of it: the labware
  // lookup's name tier is substring-based, so a sub-phrase probe would MISS a
  // record the lab holds under a longer name and declare a false absence.
  const ordered = [...candidates].sort(
    (a, b) => b.length - a.length || candidates.indexOf(a) - candidates.indexOf(b),
  );
  for (const candidate of ordered) {
    const matches = await searchLabwareByHint(candidate);
    if (matches.length === 0) {
      const mention = candidate.trim();
      if (!mention) return [];
      const kind = normalizeClarificationKind(mention);
      const request: AgentClarificationRequest = {
        id: 'empty-turn-absence-1',
        kind,
        // One server-side prompt, the harness's own identity question
        // (filterModelClarifications keeps origin 'harness' verbatim).
        prompt: 'Pick the record this step names.',
        origin: 'harness',
        entityType: kind,
        menuProvider: menuProviderForKind(kind),
        options: [],
        query: mention,
        snippet: mention,
        absence: { mention, reason: `Not in this lab's records: ${mention}` },
      };
      return [request];
    }
  }
  return [];
}
