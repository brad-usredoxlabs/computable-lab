import { useMemo } from 'react'
import { DeckSlot } from './DeckSlot'
import type { PlatformVariantManifest } from '../../types/platformRegistry'

interface DeckGridProps {
  variant: PlatformVariantManifest
  title: string
}

export function DeckGrid({ variant, title }: DeckGridProps) {
  const { rows, cols } = useMemo(() => computeGridExtents(variant), [variant])

  if (variant.slots.length === 0) return null

  return (
    <section className="deck" aria-label={`${title} deck`}>
      <div className="deck__title">{title}</div>
      <div
        className="deck__grid"
        style={{
          gridTemplateRows: `repeat(${rows}, auto)`,
          gridTemplateColumns: `repeat(${cols}, auto)`,
        }}
      >
        {variant.slots.map((slot) => (
          <DeckSlot key={slot.id} slot={slot} />
        ))}
      </div>
    </section>
  )
}

function computeGridExtents(variant: PlatformVariantManifest): { rows: number; cols: number } {
  let rows = 1
  let cols = 1
  for (const slot of variant.slots) {
    if (typeof slot.row === 'number' && slot.row > rows) rows = slot.row
    if (typeof slot.col === 'number' && slot.col > cols) cols = slot.col
  }
  return { rows, cols }
}
