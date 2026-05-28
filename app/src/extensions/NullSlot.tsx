import type { SlotName } from '@cla-lab/ai-extension-api'

export function NullSlot({ name }: { name: SlotName }) {
  return (
    <div
      data-testid={`null-slot-${name}`}
      className="cla-null-slot rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
    >
      AI feature unavailable. Install an AI overlay to enable this surface.
    </div>
  )
}
