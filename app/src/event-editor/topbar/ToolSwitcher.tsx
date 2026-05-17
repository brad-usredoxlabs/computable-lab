import { useMemo } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { getPlatformManifest } from '../../shared/lib/platformRegistry'
import { BUILTIN_TOOL_TYPES } from '../../graph/tools/types'
import { ASSIST_PIPETTE_MODELS } from '../../graph/lib/assistPipetteRegistry'

interface FlatToolOption {
  key: string
  label: string
  toolTypeId: string
  assistPipetteId: string | null
  group: string
}

export function ToolSwitcher() {
  const { state, actions } = useEventEditor()
  const manifest = getPlatformManifest(state.platforms, state.platformId)

  const options = useMemo<FlatToolOption[]>(() => {
    if (!manifest) return []
    const allowed = new Set(manifest.toolTypeIds)
    const out: FlatToolOption[] = []

    // Legacy base tool types — render any that the platform whitelists and
    // that aren't already covered by an assist-pipette aggregate.
    for (const tool of BUILTIN_TOOL_TYPES) {
      if (!allowed.has(tool.toolTypeId)) continue
      const hasAssistVariants = ASSIST_PIPETTE_MODELS.some((m) => m.baseToolTypeId === tool.toolTypeId)
      if (hasAssistVariants && manifest.compilerFamily === 'assist_plus') continue
      out.push({
        key: `tool:${tool.toolTypeId}`,
        label: tool.displayName,
        toolTypeId: tool.toolTypeId,
        assistPipetteId: null,
        group: 'Generic',
      })
    }

    // Assist Plus pipettes — only expose on platforms that whitelist their base tool type.
    if (manifest.compilerFamily === 'assist_plus') {
      for (const model of ASSIST_PIPETTE_MODELS) {
        if (!allowed.has(model.baseToolTypeId)) continue
        out.push({
          key: `assist:${model.id}`,
          label: model.displayName,
          toolTypeId: model.baseToolTypeId,
          assistPipetteId: model.id,
          group: model.family === 'voyager' ? 'Voyager' : 'Viaflow',
        })
      }
    }

    return out
  }, [manifest])

  const selectedKey = useMemo(() => {
    if (state.assistPipetteId) return `assist:${state.assistPipetteId}`
    if (state.toolTypeId) return `tool:${state.toolTypeId}`
    return ''
  }, [state.assistPipetteId, state.toolTypeId])

  if (options.length === 0) return null

  const grouped = new Map<string, FlatToolOption[]>()
  for (const option of options) {
    const bucket = grouped.get(option.group) ?? []
    bucket.push(option)
    grouped.set(option.group, bucket)
  }

  return (
    <label className="chip-select" title="Active tool">
      <span className="chip-select__label">Tool</span>
      <select
        value={selectedKey}
        onChange={(event) => {
          const choice = options.find((option) => option.key === event.target.value)
          if (!choice) return
          actions.setTool({
            toolTypeId: choice.toolTypeId,
            assistPipetteId: choice.assistPipetteId,
          })
        }}
      >
        {Array.from(grouped.entries()).map(([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
