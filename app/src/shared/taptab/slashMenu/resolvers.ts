/**
 * Default resolvers for the five built-in slash commands. Each resolver
 * queries the existing record/search surfaces for record-driven kinds and
 * reads from the cross-endpoint `SelectionContext` for the editor-driven
 * kinds (source, target).
 *
 * The resolvers are exported individually so consumers can override one
 * (e.g. a future endpoint that wants to inject in-deck labware ahead of
 * indexed records) without re-implementing the whole set.
 */

import { searchJsonLd } from '../../api/jsonLdSearchClient'
import {
  apiClient,
  type FormulationSummary,
  type MaterialSearchItem,
  type ResolveCandidate,
  type VendorExaHit,
} from '../../api/client'
import type {
  SlashResolver,
  SlashResolverContext,
  SlashMention,
  SlashSuggestion,
} from './types'
import { filterTubePresets } from '../../../types/tubeSizes'
import { exaVendorEnabled } from '../../lib/integrationFlags'
// L2-CLARIFY-PICKER-1 (P1): the intent-ranking comparator is structural
// imperative code; its policy (family ranks, can-be-default flags, the
// contains-section label) is DATA served by the registry and cached in
// ./policy. The composition pseudo-family's structural signal and the
// per-row consequence line live in ./clarifyPickerRanking (one source).
import {
  aggregateComponentTokens,
  isCompositionLabel,
  materialCandidates,
  type CandidateRankingPolicy,
} from './clarifyPickerRanking'
import { getCandidateRankingPolicy } from './policy'
// L2-TERM-1 (UC-D4): the badge/vocabulary tier words live in ONE declarative
// table (tokens.ts) — every surface reads them from there, never re-spells
// them as scattered string branches.
import { LOCAL_VOCABULARY, VOCABULARY_BADGE, VOCABULARY_SUBTITLE, menuLabelKey } from './tokens'

/**
 * The mint floor row's label, one source (L2-SUITE-A-uifix2 FIX2 [D5]): the
 * resolver floor (below) and the ClarificationPicker's VISIBLE card row both
 * render this — the copy is data (the creation-entry-points funnel floor),
 * never re-spelled per surface.
 *
 * L2-CLARIFY-CARD-1 (P5/W7): the copy now STATES the consequence — the mint is
 * a NEW material record in the lab's local namespace (a durable write of the
 * named noun), not a bare "local term" (that word survives ONLY in the server
 * wire label and MINT_OFFER_PREFIX, spec Reviewer bait 6). The popover's mint
 * floor row and the picker card's mint row say the SAME thing (one source).
 */
export function mintLocalTermLabel(query: string): string {
  return `Create material record "${query}" in the lab (new record)`
}

const PAGE = 8
const MATERIAL_PAGE = 12

/**
 * L2-CLARIFY-PICKER-1: the structural aggregate joiners and the component-token
 * splitter live in ./clarifyPickerRanking (ONE source — the composition
 * pseudo-family's signal and the search-shape list are the same sanctioned
 * literals). resolvers.ts imports them; the local copies are deleted.
 *
 * MENU-CANDIDATES-1 Fix B (why the splitter exists): a record titled
 * 'Thermo DMEM' can never match the aggregate needle
 * 'Thermo trypsin-EDTA + Thermo DMEM + …' by substring, so without this the
 * per-component records are filtered out server-side before any menu logic
 * sees them. `aggregateComponentTokens` (imported) returns [] for any query
 * that is not an aggregate (no joiner, or nothing left after splitting) — the
 * byte-stability guarantee for delimiter-free queries like 'tris' or 'dmem'.
 */

export const resolveMaterial: SlashResolver = async (query, ctx) => {
  const q = query.trim()
  const layer = ctx.materialLayer

  // A scoped question offers that layer ONLY. Offering a bare concept beside a
  // formulation beside an aliquot (the old flat menu) is what left the biologist
  // with "no godly idea which one to pick" — the layer is the question's, not
  // theirs to guess.
  if (layer === 'material-spec') return resolveFormulationLayer(q, ctx)
  if (layer === 'material-instance' || layer === 'aliquot') return resolveInstanceLayer(q, ctx, layer)
  if (layer === 'vendor-product') return resolveVendorLayer(q, ctx)

  const scopedToConcept = layer === 'material'

  // MENU-CANDIDATES-1: the label-collapse ledger for THIS menu opening. The
  // first paint seeds it; the streamed component searches below merge through
  // the SAME dedup so a component hit that re-surfaces an already-shown
  // (kind, title) row does not duplicate it.
  const menuSeenLabels = new Set<string>()

  // First paint: workspace records (+ formulations, unless the question is about
  // the concept itself). Both come from the local SQLite-backed indices and
  // return in <50ms, so the menu pops the instant the user finishes typing the
  // query — no waiting on OAK SQLite scans or remote OLS4 calls. The ontology
  // tiers stream in via onUpdate below.
  const [materialRes, formulations] = await Promise.all([
    apiClient.searchMaterials({ q, limit: MATERIAL_PAGE * 2 }),
    scopedToConcept
      ? Promise.resolve([] as FormulationSummary[])
      : apiClient.getFormulationsSummary({ q, limit: MATERIAL_PAGE }),
  ])
  abortIfNeeded(ctx)

  // L2-CLARIFY-PICKER-1 (P1): the data-declared candidate-ranking policy, read
  // once (module cache; null when the registry declares none — no fallback
  // table). The PURE comparator applies it; a null policy keeps the
  // resolver-emitted order (byte-stable).
  const policy = await getCandidateRankingPolicy()
  const workspace = materialSuggestions(
    materialRes.items,
    formulations,
    menuSeenLabels,
    policy,
    q,
    ctx.pickerRows === true,
  )
  const initial = workspace.slice(0, MATERIAL_PAGE)
  const seen = new Set(initial.map((s) => s.key))

  // The funnel's floor (creation-entry-points spec §6): minting a new
  // local-namespace term is always offered, always last, never the
  // keyboard default. Selecting it creates a draft material record
  // server-side, then inserts the pill — tier-1 finds it next search.
  if (q) {
    initial.push({
      key: `mint:${q}`,
      label: mintLocalTermLabel(q),
      // L2-TERM-1 (UC-D4): the mint floor's tier words come from the
      // declarative vocabulary map (byte-identical words, one source).
      badge: VOCABULARY_BADGE.mint,
      subtitle: VOCABULARY_SUBTITLE.mint,
      detail: {
        source: 'New local term (tier 5 — last resort)',
        ontology: LOCAL_VOCABULARY,
        definition:
          `Creates a draft material record named "${q}" in the lab's local namespace. ` +
          'Prefer an existing workspace record or ontology term above when one matches.',
      },
      pinBottom: true,
      mention: { type: 'material', entityKind: 'material', id: '', label: q },
      resolveMention: async () => {
        const res = await apiClient.mintLocalTerm('material', q, q)
        return {
          type: 'material',
          entityKind: 'material',
          id: res.recordId,
          label: res.label,
        }
      },
    })
  }

  // Below-first-paint: chain the two resolve() calls so the on-box OAK
  // tier (still 1-2s on a cold snapshot scan) lands as the second paint,
  // and the remote OLS4 tier lands as the third. Each call only emits
  // additions that aren't already on screen — the menu rebuilds in
  // strictly additive order. Aborts when the user keeps typing.
  if (q && ctx.onUpdate) {
    // MENU-CANDIDATES-1 Fix B: an aggregate label (the card prefills the full
    // fact label) fires one extra search per component token so the store's
    // per-component records surface. Delimiter-free queries get an empty token
    // list and behave byte-identically to before.
    appendComponentHits(aggregateComponentTokens(q), seen, menuSeenLabels, ctx, policy)
    void (async () => {
      try {
        const localRes = await apiClient.resolve({
          term: q,
          kinds: ['material'],
          limit: PAGE,
          localOnly: true,
        })
        if (ctx.signal.aborted) return
        appendOntologyHits(localRes.candidates, seen, ctx.onUpdate!)
      } catch {
        /* local-only path failure — fall through to the full call below */
      }
      try {
        const fullRes = await apiClient.resolve({
          term: q,
          kinds: ['material'],
          limit: PAGE,
        })
        if (ctx.signal.aborted) return
        appendOntologyHits(fullRes.candidates, seen, ctx.onUpdate!)
      } catch {
        /* remote-tail failure — silently drop, user has earlier paints */
      }
      // Exa vendor-product tier streams in last — real web products, minted
      // locally on select so the funnel never emits a bare ontology CURIE. Not
      // for a concept-scoped question: a catalog item is a different layer.
      if (!scopedToConcept) appendVendorExaHits(ctx, seen, q, 'catalog')
    })()
  }

  return initial
}

/**
 * "Which prepared solution?" — formulations ONLY.
 *
 * The layer is the question's: a biologist asked which prepared solution to use
 * must not be offered a bare compound or a freezer tube. Offering all three (the
 * old flat /m menu) made the choice a modelling decision instead of a lab one.
 */
async function resolveFormulationLayer(
  query: string,
  ctx: SlashResolverContext,
): Promise<SlashSuggestion[]> {
  const formulations = await apiClient.getFormulationsSummary({
    ...(query ? { q: query } : {}),
    limit: MATERIAL_PAGE,
  })
  abortIfNeeded(ctx)
  // L2-CLARIFY-PICKER-1 (P1): the data-declared ranking applies to the scoped
  // /m layer too (the ClarificationPicker cards set materialLayer).
  const policy = await getCandidateRankingPolicy()
  return materialSuggestions([], formulations, undefined, policy, query.trim(), ctx.pickerRows === true)
}

/**
 * "Which tube / lot?" — instances and aliquots ONLY, searched as lab records
 * (kind `material-instance` / `aliquot`) so the biologist picks the physical
 * thing in front of them, not the concept it realises.
 */
async function resolveInstanceLayer(
  query: string,
  ctx: SlashResolverContext,
  layer: 'material-instance' | 'aliquot',
): Promise<SlashSuggestion[]> {
  const found = await apiClient.searchRecordsByKind(query, layer, MATERIAL_PAGE)
  abortIfNeeded(ctx)
  const items: MaterialSearchItem[] = found.records.map((record) => ({
    recordId: record.recordId,
    kind: layer,
    title: record.title || record.recordId,
    category: layer === 'aliquot' ? 'prepared-material' : 'saved-stock',
    subtitle: layer === 'aliquot' ? 'a specific aliquot in the lab' : 'a specific preparation in the lab',
  }))
  const policy = await getCandidateRankingPolicy()
  return materialSuggestions(items, [], undefined, policy, query.trim(), ctx.pickerRows === true)
}

/** "Which catalog item?" — vendor products ONLY (a catalog identity is its own layer). */
async function resolveVendorLayer(
  query: string,
  ctx: SlashResolverContext,
): Promise<SlashSuggestion[]> {
  if (!query) return []
  const found = await apiClient.searchVendorProducts({ q: query, limit: MATERIAL_PAGE })
  abortIfNeeded(ctx)
  const items: MaterialSearchItem[] = found.items.map((hit) => ({
    recordId: `${hit.vendor}:${hit.catalogNumber}`,
    kind: 'vendor-product',
    title: hit.name,
    category: 'vendor-reagent',
    subtitle: [hit.vendor, hit.catalogNumber].filter(Boolean).join(' '),
  }))
  const policy = await getCandidateRankingPolicy()
  return materialSuggestions(items, [], undefined, policy, query.trim(), ctx.pickerRows === true)
}

function appendOntologyHits(
  candidates: ResolveCandidate[],
  seen: Set<string>,
  onUpdate: (more: SlashSuggestion[]) => void,
): void {
  const additions: SlashSuggestion[] = []
  for (const s of ontologySuggestions(candidates)) {
    if (seen.has(s.key)) continue
    seen.add(s.key)
    additions.push(s)
  }
  if (additions.length > 0) onUpdate(additions)
}

// MENU-CANDIDATES-1 Fix A: the display-label dedupe key — the ONE canonical
// shape lives in ./tokens (menuLabelKey) so the resolver and the comparator's
// contains-section count (advc-c1 DEFECT 8b) compute on the SAME key. The
// normalization is whitespace/case only (OQ2 ruling: entityKind + normalized
// title) — titles compared as the biologist reads them, not as search needles.

/**
 * MENU-CANDIDATES-1 Fix B: per-component search for an aggregate query.
 * The card prefills the /m search with the fact's FULL aggregate label
 * (server shorthandChat sets query = fact.label — untouched per Ruling 4),
 * and every server tier asks "does the RECORD contain the QUERY", so a
 * record titled 'Thermo DMEM' can never surface. Fire one additional
 * searchMaterials per trimmed component token and stream the hits through
 * the SAME label dedup via the existing onUpdate path: exact-token titles
 * land after the direct hits, before the mint row (pinBottom keeps mint
 * last). Mint is never suppressed; no term is minted or invented for
 * 'the aggregate'.
 */
function appendComponentHits(
  tokens: string[],
  seenKeys: Set<string>,
  seenLabels: Set<string>,
  ctx: SlashResolverContext,
  policy: CandidateRankingPolicy | null,
): void {
  const onUpdate = ctx.onUpdate
  if (!onUpdate) return
  void Promise.all(
    tokens.map((token) =>
      apiClient
        .searchMaterials({ q: token, limit: MATERIAL_PAGE })
        .then((res) => res.items ?? [])
        .catch(() => [] as MaterialSearchItem[]),
    ),
  ).then((perToken) => {
    if (ctx.signal.aborted) return
    const merged: SlashSuggestion[] = []
    for (const [i, items] of perToken.entries()) {
      // Same dedup as the first paint: the shared seenLabels ledger collapses
      // re-surfaced same-titled rows, and seenKeys keeps rows already on
      // screen from repeating. Each token's page is ranked against its OWN
      // component noun (the data-declared policy; null keeps emitted order).
      const tokenNoun = tokens[i] ?? ''
      for (const s of materialSuggestions(items, [], seenLabels, policy, tokenNoun, ctx.pickerRows === true)) {
        if (seenKeys.has(s.key)) continue
        seenKeys.add(s.key)
        merged.push(s)
      }
    }
    if (merged.length > 0) onUpdate(merged)
  })
}

/**
 * Build slash suggestions from Exa vendor-product hits, minting the local
 * record on select (via the shared `/vendor/exa/from` path). Keeps the funnel
 * honest: vendor hits are a real, discoverable end (badge "Web"), never a bare
 * ontology CURIE — selecting one lands a durable local record.
 */
function vendorExaSuggestions(
  hits: VendorExaHit[],
  category: 'catalog' | 'labware' | 'equipment',
): SlashSuggestion[] {
  return hits.map((hit) => {
    const mentionType =
      category === 'equipment'
        ? { type: 'equipment' as const, id: '' as const }
        : category === 'labware'
          ? { type: 'labware' as const, id: '' as const }
          : { type: 'material' as const, entityKind: 'vendor-product' as const, id: '' as const }
    return {
      key: `vendor-exa:${hit.url}`,
      label: hit.title,
      badge: 'Web',
      subtitle: hit.url,
      detail: {
        source: 'Exa web search',
        id: hit.url,
        ...(hit.snippet ? { definition: hit.snippet.slice(0, 300) } : {}),
        extra: [{ label: 'Kind', value: category }],
      },
      mention: { ...mentionType, label: hit.title } as SlashMention,
      resolveMention: async () => {
        const created = await apiClient.createFromVendorExa(hit)
        if (category === 'equipment') {
          return { type: 'equipment', id: created.recordId, label: created.label }
        }
        if (category === 'labware') {
          return { type: 'labware', id: created.recordId, label: created.label }
        }
        return { type: 'material', entityKind: 'vendor-product', id: created.recordId, label: created.label }
      },
    }
  })
}

/** Kick off an Exa vendor-product search and append results via onUpdate.
 *
 * SHORTHAND-CORPUS WS6 D1: the vendor tier is a DECLARED capability. The
 * gate mirrors the server's own semantics (server/src/integrations/exa.ts
 * normalizeConfig: disabled iff `enabled === false`; absent config = enabled)
 * via the once-per-page-load cached config read (integrationFlags) — never a
 * per-keystroke fetch. When the integration is declared off, NO request fires
 * (a credential-less deployment 502s deterministically and the browser logs a
 * resource error the app cannot suppress); the local/ontology tiers are
 * untouched. Enabled/absent: behavior is byte-identical to before.
 */
function appendVendorExaHits(
  ctx: { signal: AbortSignal; onUpdate?: SlashResolverContext['onUpdate'] },
  seen: Set<string>,
  q: string,
  category: 'catalog' | 'labware' | 'equipment',
): void {
  if (!q || !ctx.onUpdate) return
  void exaVendorEnabled().then((enabled) => {
    if (!enabled || ctx.signal.aborted) return
    return apiClient
      .searchVendorExa({ q, category, limit: PAGE })
      .then((res) => {
        if (ctx.signal.aborted) return
        const additions = vendorExaSuggestions(res.items ?? [], category).filter((s) => {
          if (seen.has(s.key)) return false
          seen.add(s.key)
          return true
        })
        if (additions.length > 0) ctx.onUpdate!(additions)
      })
      .catch(() => {
        /* Exa unavailable — silently drop; user has earlier paints */
      })
  })
}

/**
 * Map external-ontology resolve() candidates (CHEBI/GO/…) to material
 * mentions carrying the CURIE as the id. Local-record candidates are skipped
 * (the workspace search already covers them) and the tier-5 mint affordance is
 * left to the material picker.
 */
const RESOLVE_SOURCE_LABEL: Record<ResolveCandidate['source'], string> = {
  'canonical-term': 'Canonical lab term (identity spine)',
  'local-record': 'Workspace record (this lab)',
  oak: 'On-box ontology snapshot (OAK)',
  ols4: 'EBI Ontology Lookup Service (remote)',
  vendor: 'Vendor / Exa web',
  mint: 'New local term',
}

export function candidateDetail(c: ResolveCandidate): SlashSuggestion['detail'] {
  return {
    source: RESOLVE_SOURCE_LABEL[c.source] ?? c.source,
    ontology: c.namespace || undefined,
    id: c.curie || undefined,
    ...(c.uri ? { iri: c.uri } : {}),
    ...(c.definition ? { definition: c.definition } : {}),
    extra: [
      { label: 'Tier', value: `${c.tier} · ${c.source}` },
      ...(c.level && c.level !== 'unknown' ? [{ label: 'Level', value: c.level }] : []),
    ],
  }
}

function ontologySuggestions(candidates: ResolveCandidate[]): SlashSuggestion[] {
  return candidates
    // Canonical identity-spine hits (tier 0) are the lab's OWN canonical term
    // node — they must never be dropped, or a lab alias (e.g. "F praus",
    // spelled 8 ways) resolves nowhere in /m even though the backend ranked it
    // first. True ontology tiers (OAK + OLS4) follow.
    .filter((c) => {
      if (c.source === 'canonical-term') return Boolean(c.curie)
      return (c.source === 'oak' || c.source === 'ols4') && Boolean(c.curie)
    })
    .map((c) => {
      if (c.source === 'canonical-term') {
        const termId = c.curie.replace(/^local:/, '')
        return {
          key: `term:${termId}`,
          label: c.label,
          badge: 'Canonical',
          subtitle: termId,
          detail: candidateDetail(c),
          // References the canonical TERM record (a local id, not the local:
          // CURIE prefix) so downstream materialization/refs resolve to the
          // lab's identity node.
          mention: { type: 'material', entityKind: 'material', id: termId, label: c.label },
        }
      }
      return {
        key: `ontology:${c.curie}`,
        label: c.label,
        // L2-TERM-1 (UC-D4): a TRUE ontology hit keeps its namespace badge;
        // the fallback word comes from the vocabulary map (these rows ARE
        // ontology hits — the map is the single spelling of the tier).
        badge: c.namespace ? c.namespace.toUpperCase() : VOCABULARY_BADGE.ontology,
        subtitle: c.curie,
        detail: candidateDetail(c),
        mention: { type: 'material', entityKind: 'material', id: c.curie, label: c.label },
      }
    })
}

export const resolveLabware: SlashResolver = async (query, ctx) => {
  const q = query.trim()
  // Records (indexed labware instances) AND definitions (the lbw-def-…
  // registry) in parallel. Records first so user-curated workspace plates
  // win the order; definitions fill in when the workspace is bare (fresh
  // appliance) or no record matches the query.
  const [recordRes, defRes] = await Promise.all([
    searchJsonLd({ q: q || undefined, type: 'labware', limit: PAGE }),
    apiClient
      .searchLabwareDefinitions({ q, limit: PAGE })
      .catch(() => ({ hits: [] as Array<{ recordId: string; label: string }>, total: 0 })),
  ])
  abortIfNeeded(ctx)

  const records: SlashSuggestion[] = recordRes.hits.map((hit) => ({
    key: `labware:${hit.recordId}`,
    label: hit.label,
    badge: 'Labware',
    subtitle: hit.recordId,
    detail: {
      source: 'Workspace record (this lab)',
      ontology: LOCAL_VOCABULARY,
      id: hit.recordId,
      extra: [{ label: 'Kind', value: 'labware instance' }],
    },
    mention: { type: 'labware', id: hit.recordId, label: hit.label },
  }))
  const seen = new Set(records.map((s) => s.key))
  const defs: SlashSuggestion[] = []
  for (const hit of defRes.hits) {
    const key = `labware:${hit.recordId}`
    if (seen.has(key)) continue
    seen.add(key)
    defs.push({
      key,
      label: hit.label,
      badge: 'Definition',
      subtitle: hit.recordId,
      detail: {
        source: 'Labware definition registry (on-box)',
        id: hit.recordId,
        extra: [{ label: 'Kind', value: 'labware definition' }],
      },
      mention: { type: 'labware', id: hit.recordId, label: hit.label },
    })
  }
  // Exa web vendor-product tier — streams after local records + definitions so
  // a fresh appliance can still discover vendor labware off the web.
  appendVendorExaHits(ctx, seen, q, 'labware')
  return [...records, ...defs].slice(0, PAGE)
}

export const resolveEquipment: SlashResolver = async (query, ctx) => {
  const q = query.trim()
  const recordRes = await searchJsonLd({
    q: q || undefined,
    type: 'equipment',
    limit: PAGE,
  })
  abortIfNeeded(ctx)

  const records: SlashSuggestion[] = recordRes.hits.map((hit) => ({
    key: `equipment:${hit.recordId}`,
    label: hit.label,
    badge: 'Equipment',
    subtitle: hit.recordId,
    detail: {
      source: 'Workspace record (this lab)',
      ontology: LOCAL_VOCABULARY,
      id: hit.recordId,
      extra: [{ label: 'Kind', value: 'equipment' }],
    },
    mention: { type: 'equipment', id: hit.recordId, label: hit.label },
  }))

  if (q.length >= 2) {
    const seen = new Set(records.map((s) => s.key))
    // Exa-backed equipment creation streams after local records so a fresh
    // appliance can still find instruments off the web.
    appendVendorExaHits(ctx, seen, q, 'equipment')
  }
  return records
}

export const resolveProtocol: SlashResolver = async (query, ctx) => {
  const res = await searchJsonLd({
    q: query.trim() || undefined,
    type: ['protocol', 'graph-component'],
    limit: PAGE,
  })
  abortIfNeeded(ctx)
  return res.hits.map((hit) => ({
    key: `${hit.kind}:${hit.recordId}`,
    label: hit.label,
    badge: hit.kind === 'graph-component' ? 'Component' : 'Protocol',
    subtitle: hit.recordId,
    mention: {
      type: 'protocol',
      entityKind: hit.kind === 'graph-component' ? 'graph-component' : 'protocol',
      id: hit.recordId,
      label: hit.label,
    },
  }))
}

/**
 * Source/target resolvers read from the cross-endpoint `SelectionContext`.
 * Today only the event-editor publishes (well selections); future endpoints
 * — `/browser` (row selections), `/protocols` (candidate picks) — drop into
 * the same context and will appear here automatically.
 */
/**
 * Tube command (`/t`) — fully local. Offers the shared tube-size presets,
 * filtered by query (e.g. `/t 15` → 15 mL). A tube mention is a size literal,
 * not a record, so there is no network round-trip or progressive streaming.
 */
export const resolveTube: SlashResolver = async (query) =>
  filterTubePresets(query).map((preset) => ({
    key: `tube:${preset.sizeLabel}`,
    label: `${preset.sizeLabel} tube`,
    badge: 'Tube',
    subtitle: `${preset.maxVolume_uL} µL capacity`,
    mention: {
      type: 'tube',
      sizeLabel: preset.sizeLabel,
      maxVolume_uL: preset.maxVolume_uL,
      label: `${preset.sizeLabel} tube`,
    },
  }))

export const resolveSource: SlashResolver = async (_query, ctx) =>
  resolveSelection('source', ctx)

export const resolveTarget: SlashResolver = async (_query, ctx) =>
  resolveSelection('target', ctx)

function resolveSelection(
  kind: 'source' | 'target',
  ctx: SlashResolverContext,
): SlashSuggestion[] {
  const selection = ctx.selection
  if (!selection) {
    return [
      {
        key: `${kind}:none`,
        label: `No ${kind} selected`,
        badge: kind === 'source' ? 'Source' : 'Target',
        subtitle: 'Open an editor and select a source/target first',
        disabled: true,
        mention: {
          type: 'selection',
          selectionKind: kind,
          labwareId: '',
          wells: [],
          label: `${kind}: none`,
        },
      },
    ]
  }

  const payload = kind === 'source' ? selection.source : selection.target
  if (!payload) {
    return [
      {
        key: `${kind}:empty`,
        label: `No ${kind} selected`,
        badge: kind === 'source' ? 'Source' : 'Target',
        subtitle: `Select wells in the ${kind} pane first`,
        disabled: true,
        mention: {
          type: 'selection',
          selectionKind: kind,
          labwareId: '',
          wells: [],
          label: `${kind}: none`,
        },
      },
    ]
  }

  if (payload.kind === 'wells') {
    const label = formatSelectionLabel(
      kind === 'source' ? 'Source' : 'Target',
      payload.label,
      payload.wells,
    )
    return [
      {
        key: `${kind}:${payload.labwareId}:${payload.wells.join(',')}`,
        label,
        badge: kind === 'source' ? 'Source' : 'Target',
        subtitle: `${payload.labwareId} • ${payload.wells.length} well${payload.wells.length === 1 ? '' : 's'}`,
        mention: {
          type: 'selection',
          selectionKind: kind,
          labwareId: payload.labwareId,
          wells: payload.wells,
          label,
        },
      },
    ]
  }

  // Records-shape selection (Phase 3 onward).
  return [
    {
      key: `${kind}:records:${payload.refs.map((r) => r.recordId).join(',')}`,
      label:
        payload.label ??
        `${payload.refs.length} record${payload.refs.length === 1 ? '' : 's'}`,
      badge: kind === 'source' ? 'Source' : 'Target',
      subtitle: payload.refs.map((r) => r.recordId).join(', '),
      mention: {
        type: 'selection',
        selectionKind: kind,
        labwareId: '',
        wells: payload.refs.map((r) => r.recordId),
        label: payload.label ?? `${kind}: ${payload.refs.length} records`,
      },
    },
  ]
}

function formatSelectionLabel(
  prefix: string,
  labwareLabel: string | undefined,
  wells: string[],
): string {
  const preview = wells.length > 6 ? `${wells.slice(0, 6).join(', ')}…` : wells.join(', ')
  return `${prefix}: ${labwareLabel ?? 'selection'} ${preview}`.trim()
}

type MaterialMentionKind = Extract<SlashMention, { type: 'material' }>['entityKind']

// L2-CLARIFY-PICKER-1 (P1): the old hardcoded per-category rank table is
// DELETED. The comparator's rank table, the can-be-default flags, and the
// contains-section label are DATA — declared on the registry `candidate_ranking`
// block (OQ2), served by the server (OQ1), read once through ./policy, and
// applied by the PURE comparator in ./clarifyPickerRanking. Absent declaration
// => NO ranking at all: the rows keep their resolver-emitted order (backend
// relevance). There is no fallback table, ever — no rank integer survives in
// resolvers.ts (grep-clean asserted in resolvers.test.ts).

/**
 * Build the material candidate rows for one /m first-paint (or a scoped layer).
 *
 * `policy` is the data-declared candidate-ranking declaration (null when the
 * registry declares none — the ABSENT-declaration => no-ranking rule) and `noun`
 * is the query the ranking orders against (the resolver's trimmed query). The
 * PURE comparator (clarifyPickerRanking.materialCandidates) reorders; this
 * function builds the SlashSuggestion shape (badge/subtitle/detail/mention) and
 * runs the downstream dedupe — which stays DOWNSTREAM of the comparator so the
 * survivor of a byte-identical pair is still "the first in the comparator's
 * order" (the MENU-CANDIDATES-1 Fix A pin).
 */
function materialSuggestions(
  items: MaterialSearchItem[],
  formulations: FormulationSummary[],
  seenLabels?: Set<string>,
  policy: CandidateRankingPolicy | null = null,
  noun = '',
  pickerRows = false,
): SlashSuggestion[] {
  const formulationItems: MaterialSearchItem[] = formulations.map((summary) => ({
    recordId: summary.outputSpec.id,
    kind: 'material-spec',
    title: summary.outputSpec.name,
    category: 'saved-stock',
    subtitle: [
      summary.outputSpec.concentration
        ? `${summary.outputSpec.concentration.value} ${summary.outputSpec.concentration.unit}`
        : null,
      summary.outputSpec.solventLabel ? `in ${summary.outputSpec.solventLabel}` : null,
    ].filter(Boolean).join(' ') || 'Saved stock or formulation',
  }))

  // L2-CLARIFY-PICKER-1: dedup by recordId UPSTREAM of the comparator (the old
  // `seen` filter) — a record that surfaces in both the formulation summary and
  // the search page is one candidate, and the FIRST occurrence wins. Then the
  // PURE comparator orders the unique rows. No local rank table here — the data
  // is the authority. The row's DETAIL/SUBTITLE are built from the ORIGINAL
  // item (category + subtitle are search facts, never the comparator's resolved
  // family) so the no-policy byte-stability pin serializes identically to the
  // pre-fix resolver.
  const seenRecordIds = new Set<string>()
  const allItems: MaterialSearchItem[] = []
  const itemById = new Map<string, MaterialSearchItem>()
  for (const item of [...formulationItems, ...items]) {
    if (seenRecordIds.has(item.recordId)) continue
    seenRecordIds.add(item.recordId)
    allItems.push(item)
    itemById.set(item.recordId, item)
  }
  const ranked = materialCandidates(allItems, noun, policy)

  const labelKeys = seenLabels ?? new Set<string>()
  const rows: SlashSuggestion[] = []
  for (const row of ranked) {
    const item = itemById.get(row.recordId)
    // MENU-CANDIDATES-1 Fix A: display-label dedup, kept DOWNSTREAM of the
    // comparator so the survivor is the first in the comparator's order (the
    // byte-identical per-accept MSP-DRAFT specs + prior-drive aggregate mints
    // all share one title; collapsing them frees page slots). Presentation
    // only: the key stays `entityKind:recordId` and the surviving row keeps its
    // real recordId — selection is still a real record, never an invented term
    // for "the aggregate".
    const labelKey = menuLabelKey(row.mentionKind, row.label)
    if (labelKeys.has(labelKey)) continue
    labelKeys.add(labelKey)

    const entityKind = row.mentionKind
    const mention: Extract<SlashMention, { type: 'material' }> = {
      type: 'material',
      entityKind,
      id: row.recordId,
      label: row.label,
    }
    // L2-TERM-1 (UC-D4): the row's OWN structural signal (a multi-part
    // composite title — the aggregate joiner the platform writes, nothing
    // name-specific) reads the row as a composition. A composition is not a
    // term under any ontology: it badges Composition, never the kind's local
    // tier.
    const isComposition = isCompositionLabel(row.label)
    const badge = isComposition ? VOCABULARY_BADGE.composition : materialBadge(entityKind)
    // L2-SUITE-A-uifix2 [D]: the composition row's SUBTITLE must not re-spell
    // its own badge word (re-gate DEFECT 4). It carries the LAYER the row is:
    // a local record reads the honest local-record word, a formulation reads
    // its layer word. Two layers that share a title then render DISTINCTLY
    // (the layer is the differentiator the badge dropped), and the badge
    // renders exactly once per row.
    const subtitle = isComposition
      ? entityKind === 'material'
        ? VOCABULARY_SUBTITLE.local
        : materialBadge(entityKind)
      : entityKind === 'material'
        ? VOCABULARY_SUBTITLE.local
        : (item?.subtitle || item?.recordId)
    const suggestion: SlashSuggestion = {
      key: row.key,
      label: row.label,
      badge,
      subtitle,
      detail: {
        source: 'Workspace record (this lab)',
        ontology: LOCAL_VOCABULARY,
        id: row.recordId,
        ...(item?.subtitle && entityKind !== 'material' ? { definition: item.subtitle } : {}),
        extra: [
          { label: 'Kind', value: item?.kind ?? entityKind },
          { label: 'Category', value: item?.category ?? row.family },
        ],
      },
      mention,
      // L2-CLARIFY-PICKER-1 (P1/P2): the per-row P2 fields attach ONLY to
      // PICKER-constructed rows (the `pickerRows` flag — advc-c1 DEFECT 8:
      // the doc-editor /m path must NOT gain consequence chrome; bait 6 keeps
      // the editor byte-stable). The comparator derives them whenever a
      // ranking is declared; the resolver gates the ATTACHMENT. eOPT:
      // conditionally spread, never `: undefined`. `canBeDefault` is `false`
      // ONLY when the data says the family is non-defaultable (the
      // composition protection lives in the YAML); `consequence` is the P2
      // commit line.
      ...(pickerRows && row.canBeDefault !== undefined ? { canBeDefault: row.canBeDefault } : {}),
      ...(pickerRows && row.consequence ? { consequence: row.consequence } : {}),
      ...(pickerRows && row.sectionLabel ? { sectionLabel: row.sectionLabel } : {}),
    }
    rows.push(suggestion)
  }

  // L2-SUITE-A-uifix2 [D]: dedupe rows by their RENDERED identity (badge +
  // label + subtitle) — a row that would render byte-identically to an earlier
  // row is duplicative chrome (the dead-chrome rule). The survivor is the first
  // in the comparator's order, keeping its real recordId (presentation only:
  // selection still lands a real record, never an invented term). Idempotent.
  return dedupeSuggestionRows(rows)
}

// The material mention kind (the entityKind a candidate binds) is derived by
// the comparator's `mentionKindOf` (./clarifyPickerRanking) — the resolver no
// longer re-derives it (one source). `MaterialMentionKind` (below) remains the
// shared type for the badge/vocabulary table.

/**
 * L2-SUITE-A-uifix2 [D] (re-gate DEFECT 4, MINOR dead-chrome rule): collapse
 * suggestion rows that RENDER byte-identically — same badge + label +
 * subtitle — to a single row, keeping the FIRST in rank order (the caller has
 * already rank-sorted) with its real recordId. A row that would paint
 * indistinguishably next to an earlier row is duplicative chrome.
 *
 * Presentation only: the surviving row keeps its real `key` / `recordId`, so
 * selection still lands a real record — never an invented or merged term.
 * Rows that differ in any visible field (badge, label, OR subtitle) are
 * distinct candidates and all survive. Idempotent: a second pass over the
 * output changes nothing.
 *
 * NOTE on the scope of this dedup: it is keyed on the row's RENDERED identity,
 * not its recordId — so it is a safety net for rows that (a) came from
 * distinct records but (b) render the same words. The primary duplication in
 * the re-gate (the composition row re-spelling its own badge word) is fixed
 * UPSTREAM in the row builder (materialSuggestions), which makes the two
 * same-titled layers render DISTINCTLY (layer in the subtitle). This function
 * catches any residual byte-identical pair.
 */
export function dedupeSuggestionRows(rows: SlashSuggestion[]): SlashSuggestion[] {
  const seen = new Set<string>()
  const out: SlashSuggestion[] = []
  for (const row of rows) {
    const rendered = [row.badge, row.label, row.subtitle ?? ''].join('\u0000')
    if (seen.has(rendered)) continue
    seen.add(rendered)
    out.push(row)
  }
  return out
}

/**
 * L2-TERM-1 (UC-D4): the badge/vocabulary policy for workspace material
 * records as a single declarative table keyed by mention kind. The old
 * fallback spelled a bare `material` record 'Ontology' — a record of THIS
 * lab reading as an ontology term. The honest tier is Local (the kind is
 * the concept layer, the source is the workspace, not an ontology); a
 * multi-part composite label is a Composition, never a term at all.
 */
const MATERIAL_BADGE_BY_KIND: Record<MaterialMentionKind, string> = {
  'material': VOCABULARY_BADGE.local,
  'material-spec': 'Formulation',
  'material-instance': 'Instance',
  'aliquot': 'Instance',
  'vendor-product': 'Vendor',
}

function materialBadge(kind: MaterialMentionKind): string {
  return MATERIAL_BADGE_BY_KIND[kind]
}

function abortIfNeeded(ctx: SlashResolverContext): void {
  if (ctx.signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}
