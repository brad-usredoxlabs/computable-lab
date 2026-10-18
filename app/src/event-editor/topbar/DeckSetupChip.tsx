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
 * Deck setup is a start-of-run decision: once `runDeckLock.locked` is true the
 * chip is a read-only summary — no panel, no knobs.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { isDeckSetupLocked, useEventEditor } from '../EventEditorContext'
import { getPlatformManifest } from '../../shared/lib/platformRegistry'
import { getAllPacks } from '../../shared/vocab/registry'

function optionTestId(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]+/g, '~')}`
}

export function DeckSetupChip() {
  const { state, actions } = useEventEditor()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const manifest = getPlatformManifest(state.platforms, state.platformId)
  const platformLabel = manifest?.label ?? state.platformId
  const variants = manifest?.variants ?? []
  const variantTitle = variants.find((v) => v.id === state.variantId)?.title
  const locked = isDeckSetupLocked(state)

  // Vocab packs: the manifest whitelist, falling back to every pack (the rule
  // the previous VocabSwitcher used) — data-driven either way.
  const vocabOptions = useMemo(() => {
    const packs = getAllPacks()
    const allowed = new Set(manifest?.allowedVocabIds ?? [])
    const narrowed = allowed.size > 0 ? packs.filter((p) => allowed.has(p.packId)) : packs
    return narrowed.length > 0 ? narrowed : packs
  }, [manifest])
  const vocabLabel = vocabOptions.find((p) => p.packId === state.vocabPackId)?.displayName

  // A locked run can never reopen the setup.
  useEffect(() => {
    if (locked) setOpen(false)
  }, [locked])

  useEffect(() => {
    if (!open) return
    const onDocPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (target && wrapRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const summary = [platformLabel, variantTitle, vocabLabel].filter(Boolean).join(' · ')

  if (locked) {
    return (
      <span
        className="deck-setup deck-setup--locked"
        data-testid="deck-setup-chip"
        title="Deck setup was chosen at the start of this run and can no longer change."
      >
        <span className="deck-setup__lock" aria-hidden>
          🔒
        </span>
        <span className="deck-setup__summary">{summary}</span>
      </span>
    )
  }

  return (
    <div className="deck-setup" data-testid="deck-setup-chip" ref={wrapRef}>
      <button
        type="button"
        className="deck-setup__trigger"
        data-testid="deck-setup-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Deck setup — ${summary}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="deck-setup__summary">{summary}</span>
        <span className="deck-setup__caret" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="deck-setup__panel" data-testid="deck-setup-panel" role="dialog" aria-label="Deck setup">
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
                    onClick={() => actions.setVocab(pack.packId)}
                  >
                    {pack.displayName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
