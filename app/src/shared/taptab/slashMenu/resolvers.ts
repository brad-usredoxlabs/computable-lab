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
import { apiClient, type FormulationSummary, type MaterialSearchItem } from '../../api/client'
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
  const [materialRes, formulations] = await Promise.all([
    apiClient.searchMaterials({ q, limit: MATERIAL_PAGE * 2 }),
    apiClient.getFormulationsSummary({ q, limit: MATERIAL_PAGE }),
  ])
  abortIfNeeded(ctx)
  return materialSuggestions(materialRes.items, formulations).slice(0, MATERIAL_PAGE)
}

export const resolveLabware: SlashResolver = async (query, ctx) => {
  const res = await searchJsonLd({
    q: query.trim() || undefined,
    type: 'labware',
    limit: PAGE,
  })
  abortIfNeeded(ctx)
  return res.hits.map((hit) => ({
    key: `labware:${hit.recordId}`,
    label: hit.label,
    badge: 'Labware',
    subtitle: hit.recordId,
    mention: { type: 'labware', id: hit.recordId, label: hit.label },
  }))
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
