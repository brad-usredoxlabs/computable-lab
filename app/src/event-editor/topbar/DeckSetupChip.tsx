/**
 * DeckSetupChip — the run's DECK SETUP as one compact, cascading control.
 *
 * Before: three separate pulldowns (Deck / Variant / Vocab) each held its own
 * toolbar real estate — worst on a phone. Now: one summary chip; tapping it
 * opens ONE panel whose rows follow the natural order of the decision —
 *
 *   1 · Vocab   →  which verb pack this run speaks
 *   2 · Deck    →  only platforms that CAN run that vocab (allowedVocabIds)
 *   3 · Variant →  only the chosen platform's layouts
 *
 * Each row shows its current value; tapping a row expands ONLY that row's
 * options, and every list below it is filtered by the choices above. Picking a
 * vocab that the current platform does not support re-seats the platform on the
 * first one that does (the reducer then reseeds variant + tool defaults).
 *
 * Everything is DATA: packs from the vocab registry, platforms from
 * state.platforms, variants from the platform manifest, and the vocab→platform
 * filter from `allowedPlatformsForVocab`. No platform/vocab literals.
 *
 * Deck setup is a start-of-run decision: once the run has a deck (or deck
 * content) the rows are shown GREYED so you can read how the run was set up,
 * with one explicit "Switch deck" action that un-greys them. Switching clears
 * the deck (slot ids aren't comparable across decks), and the panel says so.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isDeckSetupLocked, useEventEditor } from '../EventEditorContext'
import { getPlatformManifest } from '../../shared/lib/platformRegistry'
import { allowedPlatformsForVocab } from '../../shared/lib/platformRegistry'
import type { PlatformManifest } from '../../types/platformRegistry'
import { getAllPacks } from '../../shared/vocab/registry'

type Stage = 'vocab' | 'deck' | 'variant'

function optionTestId(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]+/g, '~')}`
}

export function DeckSetupChip() {
  const { state, actions } = useEventEditor()
  const [open, setOpen] = useState(false)
  // A locked run can still be re-planned, but only through an explicit
  // "Switch deck" step inside the panel. Closing the panel re-arms the lock.
  const [switchArmed, setSwitchArmed] = useState(false)
  // Which row's options are expanded. The panel opens on the first step of the
  // cascade, so the choice is always made in order.
  const [stage, setStage] = useState<Stage>('vocab')

  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // The panel is PORTALLED (into the themed .cl-app root when present) and
  // positioned `fixed`: it lives inside a toolbar that scrolls horizontally on
  // a phone (overflow-x:auto), and an absolutely-positioned child of a scroll
  // container is clipped — the panel used to exist in the DOM but never show.
  const [anchor, setAnchor] = useState({ left: 8, top: 0, width: 320 })

  const manifest = getPlatformManifest(state.platforms, state.platformId)
  const platformLabel = manifest?.label ?? state.platformId
  const variants = manifest?.variants ?? []
  const variantTitle = variants.find((v) => v.id === state.variantId)?.title
  const deckLocked = isDeckSetupLocked(state)
  const locked = deckLocked && !switchArmed

  // Vocab packs: every registered pack (the platform filter applies to the DECK
  // list, not to the pack list — a pack is the axis you choose first).
  const vocabOptions = useMemo(() => getAllPacks(), [])
  const vocabLabel = vocabOptions.find((p) => p.packId === state.vocabPackId)?.displayName

  // Step 2 is dictated by step 1: only platforms that can run this vocab.
  const platformOptions = useMemo<PlatformManifest[]>(() => {
    const allowed = allowedPlatformsForVocab(state.platforms, state.vocabPackId)
    // Defensive: a pack no platform declares still lets you see the decks.
    return allowed.length > 0 ? allowed : state.platforms
  }, [state.platforms, state.vocabPackId])

  const summary = [vocabLabel, platformLabel, variantTitle].filter(Boolean).join(' · ')

  // Locking the deck (fresh run content) closes any in-progress re-plan.
  useEffect(() => {
    if (deckLocked && !switchArmed) setOpen(false)
  }, [deckLocked, switchArmed])

  const closePanel = () => {
    setOpen(false)
    setSwitchArmed(false)
    setStage('vocab')
  }

  const openPanel = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    const width = Math.min(340, window.innerWidth - 16)
    const left = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) : 8
    setAnchor({ left, top: rect ? rect.bottom + 6 : 0, width })
    setStage('vocab')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDocPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && wrapRef.current?.contains(target)) return
      // The panel is portalled OUT of wrapRef: a tap inside it is not an
      // outside click.
      if (target && panelRef.current?.contains(target)) return
      closePanel()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }
    const onViewportChange = () => closePanel()
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer, { passive: true })
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open])

  /** Step 1 → 2. A pack the current deck cannot run re-seats the deck. */
  const chooseVocab = (packId: string) => {
    actions.setVocab(packId)
    const allowed = allowedPlatformsForVocab(state.platforms, packId)
    const currentStillOk = allowed.some((p) => p.id === state.platformId)
    if (allowed.length > 0 && !currentStillOk) actions.setPlatform(allowed[0].id)
    setStage('deck')
  }

  /** Step 2 → 3. The reducer reseeds variant + vocab + tool for the platform. */
  const choosePlatform = (platformId: string) => {
    actions.setPlatform(platformId)
    const next = getPlatformManifest(state.platforms, platformId)
    setStage((next?.variants.length ?? 0) > 1 ? 'variant' : 'vocab')
    if ((next?.variants.length ?? 0) <= 1) closePanel()
  }

  /** Step 3 → done. */
  const chooseVariant = (variantId: string) => {
    actions.setVariant(variantId)
    closePanel()
  }

  const stageRow = (
    id: Stage,
    index: number,
    label: string,
    value: string | undefined,
    activeId: string | undefined,
    options: Array<{ id: string; label: string }>,
    onChoose: (id: string) => void,
    testIdPrefix: string,
  ) => {
    const expanded = stage === id
    return (
      <div className="deck-setup__step" data-setup-step={id}>
        <button
          type="button"
          className={expanded ? 'deck-setup__row deck-setup__row--open' : 'deck-setup__row'}
          data-testid={`deck-setup-row-${id}`}
          aria-expanded={expanded}
          disabled={locked}
          onClick={() => setStage(id)}
        >
          <span className="deck-setup__step-label">
            {index} · {label}
          </span>
          <span className="deck-setup__value">{value ?? '—'}</span>
          <span className="deck-setup__caret" aria-hidden>
            {expanded ? '▴' : '▾'}
          </span>
        </button>
        {expanded ? (
          <div className="deck-setup__options">
            {options.map((option) => (
              <button
                type="button"
                key={option.id}
                className={
                  option.id === activeId
                    ? 'deck-setup__option deck-setup__option--active'
                    : 'deck-setup__option'
                }
                data-testid={optionTestId(testIdPrefix, option.id)}
                aria-pressed={option.id === activeId}
                disabled={locked}
                onClick={() => onChoose(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const panel = (
    <div
      ref={panelRef}
      className="deck-setup__panel"
      data-testid="deck-setup-panel"
      role="dialog"
      aria-label="Deck setup"
      style={{
        position: 'fixed',
        left: `${anchor.left}px`,
        top: `${anchor.top}px`,
        width: `${anchor.width}px`,
      }}
    >
      {stageRow(
        'vocab',
        1,
        'Vocab',
        vocabLabel,
        state.vocabPackId,
        vocabOptions.map((p) => ({ id: p.packId, label: p.displayName })),
        chooseVocab,
        'deck-setup-vocab',
      )}

      {stageRow(
        'deck',
        2,
        'Deck',
        platformLabel,
        state.platformId,
        platformOptions.map((p) => ({ id: p.id, label: p.label })),
        choosePlatform,
        'deck-setup-option',
      )}

      {variants.length > 1
        ? stageRow(
            'variant',
            3,
            'Variant',
            variantTitle,
            state.variantId,
            variants.map((v) => ({ id: v.id, label: v.title })),
            chooseVariant,
            'deck-setup-option',
          )
        : null}

      {locked ? (
        <div className="deck-setup__locked-footer">
          <button
            type="button"
            className="deck-setup__switch"
            data-testid="deck-setup-switch"
            onClick={() => {
              setSwitchArmed(true)
              setStage('vocab')
            }}
          >
            Switch deck…
          </button>
          <p className="deck-setup__switch-note" data-testid="deck-setup-switch-note">
            The deck is fixed for this run. Switching clears it —{' '}
            {state.placements?.length ?? 0} placement
            {(state.placements?.length ?? 0) === 1 ? '' : 's'} and{' '}
            {state.events?.length ?? 0} event
            {(state.events?.length ?? 0) === 1 ? '' : 's'} on this deck.
          </p>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="deck-setup" data-testid="deck-setup-chip" ref={wrapRef}>
      <button
        type="button"
        className={
          locked ? 'deck-setup__trigger deck-setup__trigger--locked' : 'deck-setup__trigger'
        }
        ref={triggerRef}
        data-testid="deck-setup-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={
          locked
            ? `Deck setup — ${summary} (fixed for this run; open to switch)`
            : `Deck setup — ${summary}`
        }
        onClick={() => (open ? closePanel() : openPanel())}
      >
        {locked ? (
          <span className="deck-setup__lock" aria-hidden>
            🔒
          </span>
        ) : null}
        <span className="deck-setup__summary">{summary}</span>
        <span className="deck-setup__caret" aria-hidden>
          ▾
        </span>
      </button>

      {open ? createPortal(panel, document.querySelector('.cl-app') ?? document.body) : null}
    </div>
  )
}
