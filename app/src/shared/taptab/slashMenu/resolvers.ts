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
} from '../../api/client'
import type {
  SlashResolver,
  SlashResolverContext,
  SlashMention,
  SlashSuggestion,
} from './types'

const PAGE = 8
const MATERIAL_PAGE = 12

export const resolveMaterial: SlashResolver = async (query, ctx) => {
  const q = query.trim()
  // First paint: workspace records + formulations only. Both come from
  // the local SQLite-backed indices and return in <50ms, so the menu
  // pops the instant the user finishes typing the query — no waiting on
  // OAK SQLite scans or remote OLS4 calls. The ontology tiers stream
  // in via onUpdate below.
  const [materialRes, formulations] = await Promise.all([
    apiClient.searchMaterials({ q, limit: MATERIAL_PAGE * 2 }),
    apiClient.getFormulationsSummary({ q, limit: MATERIAL_PAGE }),
  ])
  abortIfNeeded(ctx)

  const workspace = materialSuggestions(materialRes.items, formulations)
  const initial = workspace.slice(0, MATERIAL_PAGE)
  const seen = new Set(initial.map((s) => s.key))

  // Below-first-paint: chain the two resolve() calls so the on-box OAK
  // tier (still 1-2s on a cold snapshot scan) lands as the second paint,
  // and the remote OLS4 tier lands as the third. Each call only emits
  // additions that aren't already on screen — the menu rebuilds in
  // strictly additive order. Aborts when the user keeps typing.
  if (q && ctx.onUpdate) {
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
    })()
  }

  return initial
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

/**
 * Map external-ontology resolve() candidates (CHEBI/GO/…) to material
 * mentions carrying the CURIE as the id. Local-record candidates are skipped
 * (the workspace search already covers them) and the tier-5 mint affordance is
 * left to the material picker.
 */
function ontologySuggestions(candidates: ResolveCandidate[]): SlashSuggestion[] {
  return candidates
    .filter((c) => (c.source === 'oak' || c.source === 'ols4') && c.curie)
    .map((c) => ({
      key: `ontology:${c.curie}`,
      label: c.label,
      badge: c.namespace ? c.namespace.toUpperCase() : 'Ontology',
      subtitle: c.curie,
      mention: { type: 'material', entityKind: 'material', id: c.curie, label: c.label },
    }))
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
      mention: { type: 'labware', id: hit.recordId, label: hit.label },
    })
  }
  return [...records, ...defs].slice(0, PAGE)
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

const MATERIAL_CATEGORY_RANK: Record<MaterialSearchItem['category'], number> = {
  'saved-stock': 0,
  'vendor-reagent': 1,
  'prepared-material': 2,
  'biological-derived': 3,
  'concept-only': 4,
}

function materialSuggestions(
  items: MaterialSearchItem[],
  formulations: FormulationSummary[],
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

  const seen = new Set<string>()
  return [...formulationItems, ...items]
    .filter((item) => {
      if (seen.has(item.recordId)) return false
      seen.add(item.recordId)
      return true
    })
    .sort((a, b) => {
      const ar = MATERIAL_CATEGORY_RANK[a.category] ?? 10
      const br = MATERIAL_CATEGORY_RANK[b.category] ?? 10
      return ar === br ? a.title.localeCompare(b.title) : ar - br
    })
    .map((item) => {
      const entityKind = materialMentionKind(item.kind)
      const mention: Extract<SlashMention, { type: 'material' }> = {
        type: 'material',
        entityKind,
        id: item.recordId,
        label: item.title,
      }
      return {
        key: `${entityKind}:${item.recordId}`,
        label: item.title,
        badge: materialBadge(entityKind),
        subtitle: item.subtitle || item.recordId,
        mention,
      }
    })
}

function materialMentionKind(kind: string): MaterialMentionKind {
  if (kind === 'material-spec') return 'material-spec'
  if (kind === 'material-instance') return 'material-instance'
  if (kind === 'aliquot') return 'aliquot'
  if (kind === 'vendor-product') return 'vendor-product'
  return 'material'
}

function materialBadge(kind: MaterialMentionKind): string {
  if (kind === 'material-spec') return 'Formulation'
  if (kind === 'material-instance' || kind === 'aliquot') return 'Instance'
  if (kind === 'vendor-product') return 'Vendor'
  return 'Concept'
}

function abortIfNeeded(ctx: SlashResolverContext): void {
  if (ctx.signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}
