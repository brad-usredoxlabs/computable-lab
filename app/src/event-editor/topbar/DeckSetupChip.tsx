/**
 * DeckSetupChip — the run's DECK SETUP as one composite control.
 *
 * Before: three separate pulldowns (Deck platform / Deck variant / Vocab pack)
 * each held its own toolbar real estate — worst on a phone.
 *
 * Now: a single summary chip; tapping it opens ONE panel that presents the
 * choice in its natural PROGRESSIVE order —
 *   1. Deck    (manual / Integra Assist / Opentrons …)
 *   2. Variant (Single SBS Plate, Technician Mode, Assist Plus 3-position …)
 *   3. Vocab   (the pack the run's verbs are drawn from)
 * Picking a deck reseeds variant + vocab + tool from that platform's defaults
 * (the reducer's rule), so the sequence narrows rather than fights.
 *
 * Everything here is DATA: platforms come from state.platforms, variants from
 * the platform manifest, packs from the vocab registry narrowed by the
 * manifest's allowedVocabIds. No platform/vocab literals.
 *
 * Deck setup is a start-of-run decision: once the run has a deck (or deck
 * content) the chip STILL OPENS — the choices are shown greyed out, so you can
 * see how the run was set up — with an explicit "Switch deck" action inside the
 * panel. Switching clears the deck (the reducer wipes placements/events, since
 * slot ids aren't comparable across decks), so the panel says so before you
 * commit.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isDeckSetupLocked, useEventEditor } from '../EventEditorContext'
import { getPlatformManifest } from '../../shared/lib/platformRegistry'
import { getAllPacks } from '../../shared/vocab/registry'

function optionTestId(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]+/g, '~')}`
}

export function DeckSetupChip() {
  const { state, actions } = useEventEditor()
  const [open, setOpen] = useState(false)
  // A locked run can still be re-planned, but only through an explicit
  // "Switch deck" step inside the panel. Closing the panel re-arms the lock.
  const [switchArmed, setSwitchArmed] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // The panel is PORTALLED to document.body and positioned `fixed`: it lives
  // inside a toolbar that scrolls horizontally on a phone (overflow-x:auto),
  // and an absolutely-positioned child of a scroll container is clipped — the
  // panel existed in the DOM but was never visible.
  const [anchor, setAnchor] = useState({ left: 8, top: 0, width: 320 })

  const manifest = getPlatformManifest(state.platforms, state.platformId)
  const platformLabel = manifest?.label ?? state.platformId
  const variants = manifest?.variants ?? []
  const variantTitle = variants.find((v) => v.id === state.variantId)?.title
  const deckLocked = isDeckSetupLocked(state)
  const locked = deckLocked && !switchArmed

  // Vocab packs: the manifest whitelist, falling back to every pack (the rule
  // the previous VocabSwitcher used) — data-driven either way.
  const vocabOptions = useMemo(() => {
    const packs = getAllPacks()
    const allowed = new Set(manifest?.allowedVocabIds ?? [])
    const narrowed = allowed.size > 0 ? packs.filter((p) => allowed.has(p.packId)) : packs
    return narrowed.length > 0 ? narrowed : packs
  }, [manifest])
  const vocabLabel = vocabOptions.find((p) => p.packId === state.vocabPackId)?.displayName

  // Locking the deck (fresh run content) closes any in-progress re-plan.
  useEffect(() => {
    if (deckLocked && !switchArmed) setOpen(false)
  }, [deckLocked, switchArmed])

  const closePanel = () => {
    setOpen(false)
    setSwitchArmed(false)
  }

  const openPanel = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    const width = Math.min(340, window.innerWidth - 16)
    const left = rect
      ? Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      : 8
    setAnchor({ left, top: rect ? rect.bottom + 6 : 0, width })
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
      document.removeEventListener('touchstart', onDocPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open])

  const summary = [platformLabel, variantTitle, vocabLabel].filter(Boolean).join(' · ')

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

      {open
        ? createPortal(
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
          <div className="deck-setup__step" data-setup-step="deck">
            <span className="deck-setup__step-label">1 · Deck</span>
            <div className="deck-setup__options">
              {state.platforms.map((platform) => (
                <button
                  type="button"
                  key={platform.id}
                  className={
                    platform.id === state.platformId
                      ? 'deck-setup__option deck-setup__option--active'
                      : 'deck-setup__option'
                  }
                  data-testid={optionTestId('deck-setup-option', platform.id)}
                  aria-pressed={platform.id === state.platformId}
                  disabled={locked}
                  onClick={() => actions.setPlatform(platform.id)}
                >
                  {platform.label}
                </button>
              ))}
            </div>
          </div>

          {variants.length > 1 ? (
            <div className="deck-setup__step" data-setup-step="variant">
              <span className="deck-setup__step-label">2 · Variant</span>
              <div className="deck-setup__options">
                {variants.map((variant) => (
                  <button
                    type="button"
                    key={variant.id}
                    className={
                      variant.id === state.variantId
                        ? 'deck-setup__option deck-setup__option--active'
                        : 'deck-setup__option'
                    }
                    data-testid={optionTestId('deck-setup-option', variant.id)}
                    aria-pressed={variant.id === state.variantId}
                    disabled={locked}
                    onClick={() => actions.setVariant(variant.id)}
                  >
                    {variant.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {vocabOptions.length > 1 ? (
            <div className="deck-setup__step" data-setup-step="vocab">
              <span className="deck-setup__step-label">{variants.length > 1 ? '3' : '2'} · Vocab</span>
              <div className="deck-setup__options">
                {vocabOptions.map((pack) => (
                  <button
                    type="button"
                    key={pack.packId}
                    className={
                      pack.packId === state.vocabPackId
                        ? 'deck-setup__option deck-setup__option--active'
                        : 'deck-setup__option'
                    }
                    data-testid={optionTestId('deck-setup-vocab', pack.packId)}
                    aria-pressed={pack.packId === state.vocabPackId}
                    disabled={locked}
                    onClick={() => actions.setVocab(pack.packId)}
                  >
                    {pack.displayName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {locked ? (
            <div className="deck-setup__locked-footer">
              <button
                type="button"
                className="deck-setup__switch"
                data-testid="deck-setup-switch"
                onClick={() => setSwitchArmed(true)}
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
        </div>,
            document.body,
          )
        : null}
    </div>
  )
}
