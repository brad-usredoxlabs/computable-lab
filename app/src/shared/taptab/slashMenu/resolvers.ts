/**
 * Default resolvers for the five built-in slash commands. Each resolver
 * queries the Phase 1 JSON-LD index for record-driven kinds (material,
 * labware, protocol) and reads from the cross-endpoint `SelectionContext`
 * for the editor-driven kinds (source, target).
 *
 * The resolvers are exported individually so consumers can override one
 * (e.g. a future endpoint that wants to inject in-deck labware ahead of
 * indexed records) without re-implementing the whole set.
 */

import { searchJsonLd } from '../../api/jsonLdSearchClient'
import type {
  SlashResolver,
  SlashResolverContext,
  SlashSuggestion,
} from './types'

const PAGE = 8

export const resolveMaterial: SlashResolver = async (query, ctx) => {
  const res = await searchJsonLd({
    q: query.trim() || undefined,
    type: 'material',
    limit: PAGE,
  })
  abortIfNeeded(ctx)
  return res.hits.map((hit) => ({
    key: `material:${hit.recordId}`,
    label: hit.label,
    badge: 'Concept',
    subtitle: hit.recordId,
    mention: {
      type: 'material',
      entityKind: 'material',
      id: hit.recordId,
      label: hit.label,
    },
  }))
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

function abortIfNeeded(ctx: SlashResolverContext): void {
  if (ctx.signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}
