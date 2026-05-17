import { useMemo } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { getPlatformManifest } from '../../shared/lib/platformRegistry'
import { getAllPacks } from '../../shared/vocab/registry'

export function VocabSwitcher() {
  const { state, actions } = useEventEditor()
  const manifest = getPlatformManifest(state.platforms, state.platformId)
  const allowedIds = manifest?.allowedVocabIds ?? []

  const options = useMemo(() => {
    const packs = getAllPacks()
    const allowedSet = new Set(allowedIds)
    const allowed = packs.filter((pack) => allowedSet.has(pack.packId))
    // Fall back to showing all packs when manifest doesn't whitelist any.
    return allowed.length > 0 ? allowed : packs
  }, [allowedIds])

  if (options.length === 0) return null

  return (
    <label className="chip-select" title="Vocabulary pack">
      <span className="chip-select__label">Vocab</span>
      <select
        value={state.vocabPackId}
        onChange={(event) => actions.setVocab(event.target.value)}
      >
        {options.map((pack) => (
          <option key={pack.packId} value={pack.packId}>
            {pack.displayName}
          </option>
        ))}
      </select>
    </label>
  )
}
