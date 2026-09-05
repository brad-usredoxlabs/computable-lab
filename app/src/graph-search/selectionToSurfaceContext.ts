/**
 * selectionToSurfaceContext — pure builder that turns a Find-surface selection
 * (well/cell node ids) into a well-formed SurfaceContext (phase 3, Task 3.1),
 * carrying the RESOLVED well data (not just ids) so the AI has the substance
 * it needs to answer.
 *
 * Pure + unit-testable (no API, no DOM): ids → well refs, surface=find, active
 * object = the selection collection, prompt = the user's goal (editable) or a
 * sane default. `nodes` maps graph-node id → its resolved properties; those
 * properties are attached to each SelectionItem.data so the AI sees the real
 * data about each selected well.
 */
import type { SurfaceContext, SelectionItem } from '../shared/context/SurfaceContext'

const DEFAULT_PROMPT = 'Analyze these wells'

/**
 * Group ids into well refs. Well ids already carry a `well:` prefix (graph
 * node ids are like `well:1`); cell ids are `cell:<n>`. We keep the id as-is
 * and type by prefix so the AI can resolve them unambiguously.
 */
export function idsToSelection(ids: readonly string[]): SelectionItem[] {
  return ids.map((id) => {
    const isWell = id.startsWith('well:') || id.startsWith('plate:')
    return {
      ref: {
        kind: 'record',
        id,
        type: id.startsWith('cell:') ? 'cell' : 'well',
        ...(isWell ? { label: id } : {}),
      },
    }
  })
}

export interface SelectionToSurfaceContextInput {
  ids: readonly string[]
  /** Optional per-id resolved graph-node properties to carry into the AI context. */
  nodes?: Record<string, Record<string, unknown> | undefined>
  prompt?: string
  asOf?: string
  label?: string
}

export function selectionToSurfaceContext(input: SelectionToSurfaceContextInput): SurfaceContext {
  const prompt = input.prompt?.trim() || DEFAULT_PROMPT
  const selection: SelectionItem[] = idsToSelection(input.ids).map((item) => {
    const data = input.nodes?.[item.ref.id]
    if (!data || Object.keys(data).length === 0) return item
    return { ...item, data }
  })
  const ctx: SurfaceContext = {
    surface: 'find',
    active: {
      objectType: 'collection',
      objectId: `selection:${input.ids.length > 0 ? input.ids.join('+') : 'empty'}`,
      label: input.label ?? `Find selection (${input.ids.length} wells)`,
    },
    selection,
    prompt,
  }
  if (input.asOf) ctx.asOf = input.asOf
  return ctx
}