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

export type SlashCommandKind = 'material' | 'labware' | 'protocol' | 'source' | 'target' | 'tube' | 'equipment'

/**
 * Rich hover detail for a suggestion row. Shown as a side tooltip on
 * mouseover so the user can judge a hit (which ontology, what it means)
 * before inserting it. All fields optional — rows without a detail block
 * simply don't get a tooltip.
 */
export interface SlashSuggestionDetail {
  /** Human-readable provenance, e.g. "On-box ontology (OAK)", "EBI OLS4 (remote)", "Workspace record". */
  source?: string
  /** Ontology / namespace prefix, e.g. "CHEBI", "local". */
  ontology?: string
  /** CURIE or record id, e.g. "CHEBI:17790", "MAT-tris-7f2a". */
  id?: string
  /** Full IRI, when known. */
  iri?: string
  /** Term definition / description text. */
  definition?: string
  /** Extra labelled rows (record kind, category, match score, …). */
  extra?: Array<{ label: string; value: string }>
}

/** A suggestion shown in the menu and inserted as a mention on select. */
export interface SlashSuggestion {
  /** Stable key for React lists + dedupe across resolvers. */
  key: string
  label: string
  /** Short badge string used by the UI (e.g. "Formulation", "Labware"). */
  badge: string
  /** Secondary line shown under the label. */
  subtitle?: string
  /** Hover tooltip content (ontology provenance, definition, IRI, …). */
  detail?: SlashSuggestionDetail
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
  /**
   * L2-CLARIFY-PICKER-1 P1: whether this row may hold the FOCUSED (keyboard)
   * default. The defaultability decision is the DATA flag ONLY: it is the
   * registry's `candidate_ranking.families.<family>.can_be_default` for the
   * row's family (the label shape only CLASSES the family; it never decides
   * defaultability). A composition row's never-default behavior comes from
   * the data — the shipped YAML declares `can_be_default: false` for the
   * `composition` family (the W1 bug: Enter on the opened list committed a
   * composition); a family the data declares `can_be_default: true`, or a
   * family whose flag is ABSENT, is defaultable. Absent (no ranking
   * declared) or `true` = defaultable; `false` = the first-defaultable focus
   * skips the row.
   */
  canBeDefault?: boolean
  /**
   * L2-CLARIFY-PICKER-1 P2: the per-row commit-consequence line — what picking
   * this row BINDS, generated from the row's own record (no new chrome) by
   * `consequenceFor` (./clarifyPickerRanking) using the ONE shared kind-word
   * vocabulary (./tokens `ANSWER_KIND_WORD` / `KIND_WORD`). e.g.
   * `binds material record MAT-dmem-ykg0 "DMEM" (concept)` vs
   * `binds formulation MSP-… (composition of 6 components)`. Rendered inline
   * so the W3 hover-card unreachability stops mattering. Absent when the row
   * carries no bindable record (e.g. the mint floor).
   */
  consequence?: string
  /**
   * L2-CLARIFY-PICKER-1 P1: the presentation label of the CONTAINS section this
   * row collapsed under (the data-declared `contains_section_label` template,
   * e.g. `contains "DMEM" (9)`). Present ONLY on the first row of a contains
   * band; a row in the equality band or the below-contains band carries none.
   */
  sectionLabel?: string
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
  | {
      type: 'tube'
      sizeLabel: string
      maxVolume_uL: number
      label: string
    }
  | {
      type: 'equipment'
      id: string
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
  /**
   * Which material LAYER the menu is answering for. Set by the clarification
   * picker from the request's `materialLayer`; absent for the general `/m`
   * menu, where the biologist browses everything on purpose.
   *
   * When set, the menu offers ONLY that layer: a question about a prepared
   * solution must not offer a bare compound, and "which compound?" must not
   * offer an aliquot. Asking the biologist to choose between layers is asking
   * them to do the data modelling.
   */
  materialLayer?: 'material' | 'material-spec' | 'material-instance' | 'aliquot' | 'vendor-product'
  /**
   * L2-CLARIFY-PICKER-1 P2 (advc-c1 DEFECT 8): this resolver pass is a
   * PICKER-constructed one (the clarification card's bounded mount pass + the
   * open popover), not the doc-editor `/m` menu. Only picker passes attach the
   * per-row commit-consequence line + the focus-default flag (the W1
   * never-default row is a PICKER concern); the editor's `/m` stays
   * chrome-free and byte-stable (bait 6). Absent for editor invocations.
   */
  pickerRows?: boolean
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
