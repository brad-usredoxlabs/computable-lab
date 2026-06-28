import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEventEditor } from '../EventEditorContext'
import { useMaterialSearch } from './useMaterialSearch'
import {
  initialState,
  pickedFromFormulation,
  pickedFromSearchItem,
  reducer,
  type PickedMaterial,
} from './state'
import type { Labware } from '../../types/labware'
import type { WellId } from '../../types/plate'
import type { FormulationSummary, MaterialSearchItem, ResolveCandidate } from '../../shared/api/client'
import type { ResolveRef } from '../../shared/api/resolveUtil'
import { DetailTooltip } from '../../shared/taptab/slashMenu/SlashSuggestionList'
import { candidateDetail } from '../../shared/taptab/slashMenu/resolvers'
import type { SlashSuggestionDetail } from '../../shared/taptab/slashMenu/types'
import { MaterialIntentSurface } from '../../shared/material-intent/MaterialIntentSurface'
import { useMaterialProfiles } from '../../shared/material-intent/useMaterialProfiles'
import { materialIntentOptions, toPickerProfileId } from './profileBuilderRegistry'

/**
 * Replaces the two `window.prompt()` calls that the well-context-menu
 * used to fire for "Add material". Opens when the user picks
 * "Add material…" from the well menu. Closes on apply, cancel, or
 * Escape.
 *
 * Phase 1 surface:
 *   • Search local DB + formulations (debounced, instant)
 *   • On-demand ontology search across the configured OLS ontologies
 *   • Pick any result → configure step (volume / count)
 *   • Confirm → dispatch applyAddMaterial with a real recordId
 *   • Cancel / Escape / close button → drop back to the well menu
 *
 * Phases 2–5 will add the four type-specific builder forms in place of
 * the "Create new material →" placeholder row.
 */

export interface AddMaterialModalProps {
  isOpen: boolean
  labware: Labware
  wells: WellId[]
  onClose: () => void
}

export function inferMaterialProfileIdForOntologyCandidate(candidate: Pick<ResolveCandidate, 'namespace' | 'label' | 'curie'>): 'chemical' | 'cell_line' | 'media_composition' | 'sample' | 'other' {
  const ns = candidate.namespace.toUpperCase()
  const text = `${candidate.label} ${candidate.curie}`.toLowerCase()

  if (ns === 'CL' || ns === 'CLO' || ns === 'EFO' || /\b(?:hep\s*g2|hepg2|cell|cells|cell\s*line|culture|hepatocyte|fibroblast|neuron|organoid)\b/.test(text)) return 'cell_line'
  if (ns === 'XCO' || ns === 'MSIO' || /\b(?:medium|media|dmem|dulbecco|serum|fbs|buffer|pbs|hbss|rpmi|emem|mem)\b/.test(text)) return 'media_composition'
  if (ns === 'UBERON' || /\b(?:sample|specimen|tissue|plasma|serum sample)\b/.test(text)) return 'sample'
  if (ns === 'CHEBI') return 'chemical'
  return 'other'
}

export function AddMaterialModal({ isOpen, labware, wells, onClose }: AddMaterialModalProps) {
  const { actions } = useEventEditor()
  const { profiles } = useMaterialProfiles()
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const search = useMaterialSearch()
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Reset everything when the modal closes; opens fresh next time so a
  // stale "configure" state from a prior session doesn't surface.
  // `search.setQuery` is captured through a ref because the search object
  // returned by useMaterialSearch is a fresh reference every render —
  // depending on it directly here would re-run the effect on every render
  // and infinite-loop through dispatch+setQuery.
  const setQueryRef = useRef(search.setQuery)
  setQueryRef.current = search.setQuery
  useEffect(() => {
    if (!isOpen) {
      dispatch({ type: 'reset' })
      setQueryRef.current('')
    }
  }, [isOpen])

  // Autofocus search on open. The input ref settles after the portal
  // mounts, so we wait one frame.
  useEffect(() => {
    if (!isOpen) return
    const id = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [isOpen, state.phase])

  // Escape closes (or backs out of configure, depending on phase).
  useEffect(() => {
    if (!isOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (state.phase === 'configure') {
        dispatch({ type: 'reset' })
        return
      }
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose, state.phase])

  const handleApply = useCallback(() => {
    if (state.phase !== 'configure') return
    const volume_uL = Number(state.volume_uL)
    // Cells often go in at essentially zero volume; allow 0 when the
    // material carries a cell-composition role so the user can ship a
    // pure-cell event (count without volume).
    const allowZeroVolume = state.picked.hasCellComposition
    if (!Number.isFinite(volume_uL) || volume_uL < 0) return
    if (!allowZeroVolume && volume_uL <= 0) return

    let count: number | undefined
    if (state.picked.hasCellComposition && state.count.trim().length > 0) {
      const parsed = Number(state.count)
      if (Number.isFinite(parsed) && parsed >= 0) count = parsed
    }

    actions.applyAddMaterial({
      labwareId: labware.labwareId,
      wells,
      materialRef: state.picked.ref,
      volume_uL,
      role: state.role.trim() || undefined,
      ...(state.picked.concentration ? { concentration: state.picked.concentration } : {}),
      ...(state.picked.compositionSnapshot ? { compositionSnapshot: state.picked.compositionSnapshot } : {}),
      ...(count !== undefined ? { count } : {}),
    })
    onClose()
  }, [actions, labware, onClose, state, wells])

  if (!isOpen) return null

  const wellsLabel =
    wells.length === 1 ? `Well ${wells[0]}` : `${wells.length} wells`

  const node = (
    <div
      className="add-material-scrim"
      role="presentation"
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onClose()
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={dialogRef}
        className="add-material-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Add material to ${wellsLabel}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="add-material-header">
          <div className="add-material-title">
            Add material
            <span className="add-material-target">{wellsLabel}</span>
          </div>
          <button
            type="button"
            className="add-material-close"
            onClick={onClose}
            aria-label="Close"
          >×</button>
        </header>

        {state.phase === 'search' ? (
          <SearchView
            inputRef={inputRef}
            search={search}
            onPickLocal={(item) => dispatch({ type: 'pick', material: pickedFromSearchItem(item) })}
            onPickFormulation={(formulation) =>
              dispatch({ type: 'pick', material: pickedFromFormulation(formulation) })}
            onPickOntology={(candidate) => {
              // Clicking an ontology hit routes into the appropriate
              // builder pre-filled with the term. Namespace decides:
              // CL / NCBITaxon / Uberon → cells (anything biological);
              // everything else → compound (the canonical "create
              // formulation from this ChEBI term" path).
              const ref: ResolveRef = {
                kind: 'ontology',
                id: candidate.curie,
                namespace: candidate.namespace,
                label: candidate.label,
                uri: candidate.uri ?? '',
              }
              dispatch({
                type: 'seed-intent',
                kind: toPickerProfileId(inferMaterialProfileIdForOntologyCandidate(candidate)),
                ontologyRef: ref,
              })
            }}
            onRequestCreate={() => dispatch({ type: 'open-intent' })}
          />
        ) : null}

        {state.phase === 'configure' ? (
          <ConfigureView
            picked={state.picked}
            volumeValue={state.volume_uL}
            countValue={state.count}
            roleValue={state.role}
            onVolumeChange={(value) => dispatch({ type: 'set-volume', value })}
            onCountChange={(value) => dispatch({ type: 'set-count', value })}
            onRoleChange={(value) => dispatch({ type: 'set-role', value })}
            onBack={() => dispatch({ type: 'reset' })}
            onConfirm={handleApply}
          />
        ) : null}

        {state.phase === 'intent' ? (
          <MaterialIntentSurface
            options={materialIntentOptions({
              profiles,
              ...(state.seed?.ontologyRef ? { seedOntologyRef: state.seed.ontologyRef } : {}),
            })}
            seedKind={state.seed?.kind ?? null}
            cancelLabel="Back to search"
            onResolved={(picked) => dispatch({ type: 'pick', material: picked })}
            onCancel={() => dispatch({ type: 'reset' })}
            onError={(message) => dispatch({ type: 'fail', message })}
          />
        ) : null}

        {state.phase === 'error' ? (
          <div className="add-material-error" role="alert">
            <strong>Something went wrong.</strong>
            <p>{state.message}</p>
            <button type="button" onClick={() => dispatch({ type: 'reset' })}>Back to search</button>
          </div>
        ) : null}
      </div>
    </div>
  )

  // Portal into the themed app root, NOT document.body. The `--cl-*` design
  // tokens (and the live `data-theme`) are scoped to `.cl-app`; mounting on
  // body left every token unresolved, so the CSS fell back to its hardcoded
  // *dark* literals — the modal rendered dark and jarring in light mode. The
  // root has no transform, so the fixed-position scrim still covers the
  // viewport and isn't clipped by the root's overflow.
  const themeRoot = document.querySelector('.cl-app') ?? document.body
  return createPortal(node, themeRoot)
}

/**
 * Friendly meta line for a local search hit. A concept-only material is a record
 * already saved in the lab/project — relabel it as an ontology term the user
 * should reuse, instead of the internal "concept only · Bare concept record".
 */
function localResultMeta(item: MaterialSearchItem): string {
  if (item.category === 'concept-only') return 'Ontology · already in your project — pick this'
  const category = item.category.replace(/-/g, ' ')
  return item.subtitle ? `${category} · ${item.subtitle}` : category
}

interface SearchViewProps {
  inputRef: React.RefObject<HTMLInputElement>
  search: ReturnType<typeof useMaterialSearch>
  onPickLocal: (item: MaterialSearchItem) => void
  onPickFormulation: (formulation: FormulationSummary) => void
  onPickOntology: (candidate: ResolveCandidate) => void
  onRequestCreate: () => void
}

function SearchView({
  inputRef,
  search,
  onPickLocal,
  onPickFormulation,
  onPickOntology,
  onRequestCreate,
}: SearchViewProps) {
  const {
    query,
    setQuery,
    localResults,
    formulations,
    ontologyResults,
    loadingLocal,
    loadingOntology,
    error,
  } = search

  const trimmed = query.trim()
  const hasOntologyHits = ontologyResults.length > 0

  // You add a FORMULATION or an INSTANCE to a well — not a bare ontology
  // concept. Hide concept-only records from the addable list; the user reaches
  // those terms through the ontology hits below (which route into a builder that
  // creates a formulation/instance). This also stops accidental reuse of the
  // stray bare concepts the AI mint path used to leave behind.
  const addableLocalResults = localResults.filter((item) => item.category !== 'concept-only')

  // Definition hover card — reuses the AI route's DetailTooltip so a moused-over
  // ontology hit shows its definition + provenance, docked beside the list.
  const ontologyListRef = useRef<HTMLUListElement>(null)
  const [hoveredOntology, setHoveredOntology] = useState<{
    detail: SlashSuggestionDetail
    anchor: DOMRect
    listRect: DOMRect
  } | null>(null)

  function showOntologyDetail(candidate: ResolveCandidate, row: HTMLElement) {
    const listRect = ontologyListRef.current?.getBoundingClientRect()
    const detail = candidateDetail(candidate)
    if (!listRect || !detail) return
    setHoveredOntology({ detail, anchor: row.getBoundingClientRect(), listRect })
  }

  return (
    <div className="add-material-body">
      <div className="add-material-search">
        <input
          ref={inputRef}
          type="text"
          className="add-material-input"
          placeholder="Search materials… (e.g., test compound, DMSO, HepG2)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {loadingLocal ? <span className="add-material-spinner" aria-hidden /> : null}
      </div>

      {error ? <div className="add-material-error-inline" role="alert">{error}</div> : null}

      {trimmed.length < 2 ? (
        <div className="add-material-hint">
          Type at least two characters to search saved materials and formulations.
        </div>
      ) : (
        <div className="add-material-results">
          {formulations.length > 0 ? (
            <section className="add-material-section">
              <div className="add-material-section-title">Saved formulations</div>
              <ul className="add-material-list">
                {formulations.map((formulation) => (
                  <li key={formulation.outputSpec.id}>
                    <button
                      type="button"
                      className="add-material-row"
                      data-category="saved-stock"
                      onClick={() => onPickFormulation(formulation)}
                    >
                      <span className="add-material-row-title">{formulation.outputSpec.name}</span>
                      <span className="add-material-row-meta">
                        {formulation.recipeName}
                        {formulation.outputSpec.concentration
                          ? ` · ${formulation.outputSpec.concentration.value} ${formulation.outputSpec.concentration.unit}`
                          : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {addableLocalResults.length > 0 ? (
            <section className="add-material-section">
              <div className="add-material-section-title">Materials</div>
              <ul className="add-material-list">
                {addableLocalResults.map((item) => (
                  <li key={item.recordId}>
                    <button
                      type="button"
                      className="add-material-row"
                      data-category={item.category}
                      onClick={() => onPickLocal(item)}
                    >
                      <span className="add-material-row-title">{item.title}</span>
                      <span className="add-material-row-meta">
                        {localResultMeta(item)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="add-material-section">
            <div className="add-material-section-title">
              <span>Ontologies</span>
              {loadingOntology ? <span className="add-material-spinner" aria-hidden /> : null}
            </div>
            {hasOntologyHits ? (
              <ul className="add-material-list add-material-list--scroll" ref={ontologyListRef}>
                {ontologyResults.map((candidate) => (
                  <li key={candidate.curie}>
                    <button
                      type="button"
                      className="add-material-row"
                      data-category="ontology"
                      onClick={() => onPickOntology(candidate)}
                      onMouseEnter={(e) => showOntologyDetail(candidate, e.currentTarget)}
                      onMouseLeave={() => setHoveredOntology(null)}
                      onFocus={(e) => showOntologyDetail(candidate, e.currentTarget)}
                      onBlur={() => setHoveredOntology(null)}
                    >
                      <span className="add-material-row-title">
                        {candidate.label}
                        <span className="add-material-row-ontology">
                          {candidate.namespace.toUpperCase()}
                        </span>
                      </span>
                      <span className="add-material-row-meta">
                        {candidate.curie}
                        {candidate.definition ? ` · ${candidate.definition}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : loadingOntology ? (
              <div className="add-material-hint">Searching ontologies…</div>
            ) : (
              <div className="add-material-hint">No ontology matches for "{trimmed}".</div>
            )}
            {hoveredOntology
              ? createPortal(
                  <DetailTooltip
                    detail={hoveredOntology.detail}
                    anchor={hoveredOntology.anchor}
                    listRect={hoveredOntology.listRect}
                  />,
                  document.body,
                )
              : null}
          </section>

          <section className="add-material-section">
            <button
              type="button"
              className="add-material-create-row"
              onClick={onRequestCreate}
            >
              <span>＋ Create new material…</span>
              <span className="add-material-create-meta">Compound · Mixture · Cells · Sample</span>
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

interface ConfigureViewProps {
  picked: PickedMaterial
  volumeValue: string
  countValue: string
  roleValue: string
  onVolumeChange: (value: string) => void
  onCountChange: (value: string) => void
  onRoleChange: (value: string) => void
  onBack: () => void
  onConfirm: () => void
}

function ConfigureView({
  picked,
  volumeValue,
  countValue,
  roleValue,
  onVolumeChange,
  onCountChange,
  onRoleChange,
  onBack,
  onConfirm,
}: ConfigureViewProps) {
  const showCount = picked.hasCellComposition
  const canConfirm = (() => {
    const v = Number(volumeValue)
    if (!Number.isFinite(v) || v < 0) return false
    // For cell materials, allow volume = 0 (pure-cells events). For
    // everything else, the user must enter a real volume.
    if (!showCount && v <= 0) return false
    if (showCount) {
      const c = Number(countValue)
      if (!Number.isFinite(c) || c < 0) return false
    }
    return true
  })()

  return (
    <form
      className="add-material-body"
      onSubmit={(e) => {
        e.preventDefault()
        if (canConfirm) onConfirm()
      }}
    >
      <div className="add-material-picked">
        <span className="add-material-picked-label">Selected</span>
        <div className="add-material-picked-title">{picked.label}</div>
        <code className="add-material-picked-id">{picked.recordId}</code>
        {picked.concentration ? (
          <div className="add-material-picked-meta">
            Carries concentration: {picked.concentration.value} {picked.concentration.unit}
          </div>
        ) : null}
      </div>

      <label className="add-material-field">
        <span className="add-material-field-label">Volume (µL)</span>
        <input
          type="number"
          className="add-material-input"
          value={volumeValue}
          min="0"
          step="any"
          onChange={(e) => onVolumeChange(e.target.value)}
          autoFocus
        />
      </label>

      {showCount ? (
        <label className="add-material-field">
          <span className="add-material-field-label">Cell count</span>
          <input
            type="number"
            className="add-material-input"
            value={countValue}
            min="0"
            step="1"
            onChange={(e) => onCountChange(e.target.value)}
          />
          <span className="add-material-field-hint">
            The selected material has a cells component, so a count makes the
            event-graph replayable for cell-level tracking. Optional — leave
            blank if you only care about volume.
          </span>
        </label>
      ) : null}

      <label className="add-material-field">
        <span className="add-material-field-label">Role</span>
        <input
          type="text"
          className="add-material-input"
          value={roleValue}
          list="add-material-role-options"
          placeholder={showCount ? 'cells' : 'treatment'}
          onChange={(e) => onRoleChange(e.target.value)}
        />
        <datalist id="add-material-role-options">
          <option value="cells" />
          <option value="treatment" />
          <option value="vehicle" />
          <option value="control" />
          <option value="solvent" />
          <option value="additive" />
          <option value="buffer_component" />
        </datalist>
        <span className="add-material-field-hint">
          Optional semantic role for this addition, such as cells, treatment,
          vehicle, or additive.
        </span>
      </label>

      <footer className="add-material-footer">
        <button type="button" className="add-material-btn" onClick={onBack}>Back</button>
        <button
          type="submit"
          className="add-material-btn add-material-btn--primary"
          disabled={!canConfirm}
        >Add to well</button>
      </footer>
    </form>
  )
}

