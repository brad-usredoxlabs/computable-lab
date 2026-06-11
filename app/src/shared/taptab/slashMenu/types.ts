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
  /**
   * When set, the mention is produced asynchronously on select instead of
   * inserting `mention` directly — the tier-5 mint affordance must create
   * the record server-side before the pill has an id to point at. Resolving
   * to null aborts the insert.
   */
  resolveMention?: () => Promise<SlashMention | null>
  /**
   * Keep this row at the bottom of the list across progressive repaints
   * (the mint affordance stays last — it's the funnel's deliberate last
   * resort, never the default).
   */
  pinBottom?: boolean
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
 * keeps typing (so resolvers can cancel in-flight searches); onUpdate
 * lets a resolver progressively append more candidates after its initial
 * Promise resolves (used by /m to show local hits immediately and merge
 * remote-ontology hits in as they arrive).
 */
export interface SlashResolverContext {
  selection: SelectionContextValue | null
  signal: AbortSignal
  /**
   * Push additional suggestions into the open menu after the initial
   * resolver Promise has resolved. The extension dedups by `key` and
   * preserves the relative order of items already shown, then appends new
   * items. Calls after the menu closes (or the user types another
   * character) are silently dropped — the AbortSignal also fires in that
   * case, so well-behaved resolvers can bail early.
   */
  onUpdate?: (more: SlashSuggestion[]) => void
}

/**
 * A resolver returns a (possibly empty) list of suggestions for a given
 * command + query string. Resolvers are async because most query against
 * the JSON-LD index over the wire. The result list is shown in command
 * order, deduped by `key`. Resolvers MAY also call `ctx.onUpdate` after
 * their initial Promise resolves to stream in late results without
 * blocking the first paint (see /m's tier-3 OLS4 pass).
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
