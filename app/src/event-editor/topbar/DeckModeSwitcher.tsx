import { useEventEditor } from '../EventEditorContext'
import { getPlatformManifest } from '../../shared/lib/platformRegistry'

export function DeckModeSwitcher() {
  const { state, actions } = useEventEditor()
  const manifest = getPlatformManifest(state.platforms, state.platformId)
  const showVariant = (manifest?.variants.length ?? 0) > 1
  // Once a run's deck is locked (first edit pins it), the deck/variant can no
  // longer change — reflect that in the UI rather than letting the dropdown
  // silently no-op against the reducer guard.
  const locked = state.runDeckLock?.locked === true
  const lockedTitle = 'This run is locked to this deck — it can no longer be changed.'

  return (
    <>
      <label
        className="chip-select"
        data-locked={locked ? 'true' : 'false'}
        title={locked ? lockedTitle : 'Deck platform'}
      >
        <span className="chip-select__label">Deck</span>
        <select
          value={state.platformId}
          disabled={locked}
          onChange={(event) => actions.setPlatform(event.target.value)}
        >
          {state.platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.label}
            </option>
          ))}
        </select>
        {locked ? <span className="chip-select__lock" aria-label="locked">🔒</span> : null}
      </label>
      {showVariant && manifest ? (
        <label
          className="chip-select"
          data-locked={locked ? 'true' : 'false'}
          title={locked ? lockedTitle : 'Deck variant'}
        >
          <span className="chip-select__label">Variant</span>
          <select
            value={state.variantId}
            disabled={locked}
            onChange={(event) => actions.setVariant(event.target.value)}
          >
            {manifest.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.title}
              </option>
            ))}
          </select>
          {locked ? <span className="chip-select__lock" aria-label="locked">🔒</span> : null}
        </label>
      ) : null}
    </>
  )
}
