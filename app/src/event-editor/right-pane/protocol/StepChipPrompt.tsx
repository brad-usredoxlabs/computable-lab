/**
 * StepChipPrompt — the per-step "prompt box" for localizing a universal step.
 *
 * MODEL: a step is a human CONCEPT; localizing it means telling the AI how THIS
 * lab realizes it. The prompt box is that instruction ("use a deepwell plate,
 * not the 96-well"), and Localize sends { prompt, stepText } to the AI which
 * ghosts an event graph for the step.
 *
 * Rendered INSIDE each StepChip. The prompt box is visible only while the step
 * is highlighted (active/expanded), so a 6-step protocol stays uncluttered but
 * the focused step always has its prompt + Localize in reach. The prompt text
 * survives collapse (state lives here), so revisiting a step keeps your note.
 */
import { useState } from 'react'

export interface StepChipPromptPayload {
  prompt: string
  stepText: string
}

export function StepChipPrompt({
  active,
  stepText,
  onLocalize,
}: {
  /** Visible only when the owning step chip is highlighted. */
  active: boolean
  /** The step's human step text — always carried with the prompt to the AI. */
  stepText?: string
  /** Fired with { prompt, stepText } when Localize is clicked. */
  onLocalize?: (payload: StepChipPromptPayload) => void
}) {
  const [prompt, setPrompt] = useState('')
  const canLocalize = prompt.trim().length > 0

  if (!active) return null

  // Stop propagation so interacting with the prompt box never triggers the
  // owning StepChip's onSelect toggle (which would collapse the panel that is
  // about to auto-send the instruction).
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <div className="step-chip-prompt" data-testid="step-chip-prompt" onClick={stop} onKeyDown={stop}>
      <input
        type="text"
        data-testid="step-prompt-input"
        value={prompt}
        placeholder={`Localize "${stepText?.slice(0, 60) ?? 'this step'}…" — e.g. use a deepwell plate`}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canLocalize) {
            e.preventDefault()
            e.stopPropagation()
            onLocalize?.({ prompt: prompt.trim(), stepText: stepText ?? '' })
          }
        }}
      />
      <button
        type="button"
        data-testid="step-localize-btn"
        disabled={!canLocalize}
        onClick={(e) => {
          e.stopPropagation()
          onLocalize?.({ prompt: prompt.trim(), stepText: stepText ?? '' })
        }}
      >
        Localize
      </button>
    </div>
  )
}