/**
 * Slash menu — shared types.
 *
 * The slash menu is one TipTap extension that any rich-text surface can mount.
 * Five commands are wired today: material, labware, protocol, source, target —
 * the same set users type into the AI chat and the same set the spec calls
 * out. New commands can be added without touching the extension itself by
 * registering a resolver and the alias list at construction time.
 */

import type { SelectionContextValue } from '../../context/SelectionContext'

export type SlashCommandKind = 'material' | 'labware' | 'protocol' | 'source' | 'target'

/** A suggestion shown in the menu and inserted as a mention on select. */
export interface SlashSuggestion {
  /** Stable key for React lists + dedupe across resolvers. */
  key: string
  label: string
  /** Short badge string used by the UI (e.g. "Formulation", "Labware"). */
  badge: string
  /** Secondary line shown under the label. */
  subtitle?: string
  /** Mention payload — emitted into the editor on select. */
  mention: SlashMention
  /** When true, the row renders disabled (e.g. "no wells selected"). */
  disabled?: boolean
}

/**
 * The data needed to render a mention pill and to serialize it back to the
 * existing `[[kind:id|label]]` wire format on submit. The shape mirrors
 * `PromptMention` in `app/src/types/ai.ts` so token round-trips stay byte-
 * identical for the server-side parser.
 */
export type SlashMention =
  | {
      type: 'material'
      entityKind: 'material' | 'material-spec' | 'material-instance' | 'aliquot' | 'vendor-product'
      id: string
      label: string
    }
  | {
      type: 'labware'
      id: string
      label: string
    }
  | {
      type: 'protocol'
      entityKind: 'protocol' | 'graph-component'
      id: string
      label: string
    }
  | {
      type: 'selection'
      selectionKind: 'source' | 'target'
      labwareId: string
      wells: string[]
      label: string
    }

/**
 * Context handed to resolvers so they can fulfil their query without
 * reaching into React directly. Selection is the cross-endpoint
 * `SelectionContext`; signal is an AbortSignal that fires when the user
 * keeps typing (so resolvers can cancel in-flight searches).
 */
export interface SlashResolverContext {
  selection: SelectionContextValue | null
  signal: AbortSignal
}

/**
 * A resolver returns a (possibly empty) list of suggestions for a given
 * command + query string. Resolvers are async because most query against
 * the JSON-LD index over the wire. The result list is shown in command
 * order, deduped by `key`.
 */
export type SlashResolver = (
  query: string,
  ctx: SlashResolverContext,
) => Promise<SlashSuggestion[]>

/** Alias map → kind. Lookup is case-insensitive. */
export interface SlashCommandSpec {
  kind: SlashCommandKind
  /** Aliases. The first entry is the canonical short form (e.g. "m"). */
  aliases: string[]
  /** Resolver invoked when this command fires. */
  resolve: SlashResolver
}
