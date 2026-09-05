/**
 * selectionToSurfaceContext — pure builder that turns a Find-surface selection
 * (well/cell node ids) into a well-formed SurfaceContext (phase 3, Task 3.1).
 *
 * Pure + unit-testable (no API, no DOM): ids → well refs, surface=find, active
 * object = the selection collection, prompt = the user's goal (editable) or a
 * sane default.
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
  prompt?: string
  asOf?: string
  label?: string
}

export function selectionToSurfaceContext(input: SelectionToSurfaceContextInput): SurfaceContext {
  const prompt = input.prompt?.trim() || DEFAULT_PROMPT
  const ctx: SurfaceContext = {
    surface: 'find',
    active: {
      objectType: 'collection',
      objectId: `selection:${input.ids.length > 0 ? input.ids.join('+') : 'empty'}`,
      label: input.label ?? `Find selection (${input.ids.length} wells)`,
    },
    selection: idsToSelection(input.ids),
    prompt,
  }
  if (input.asOf) ctx.asOf = input.asOf
  return ctx
}