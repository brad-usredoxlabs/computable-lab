import type { Labware } from '../../types/labware'
import type { LabwareOrientation } from '../types'

/**
 * Compact, schematic SVG of a labware's well layout, drawn for the small deck
 * tiles so the user can tell a 96-well plate from a 384-well plate from a
 * 4×50 mL tube rack at a glance — without drilling into the focus view.
 *
 * The shape is derived from the instance's real `addressing` (rows × columns
 * or linear count) and `renderProfile`, so any labware renders a faithful
 * miniature: density, tube count, and trough/channel reservoirs all read
 * differently. Dense plates are capped (see GRID_CAP) so 1536-well tiles stay
 * cheap to draw while still looking denser than everything else.
 */

interface LabwareGlyphProps {
  labware: Labware
  orientation: LabwareOrientation
}

// Layout units (arbitrary; the SVG scales to the tile via viewBox + CSS).
const CELL = 10
const PAD = 2
// Above this many rows/columns we draw a representative capped grid rather than
// every well — keeps the densest tiers (1536) from drawing 1500+ circles.
const GRID_CAP = { cols: 24, rows: 16 }

function inferProfile(labware: Labware): NonNullable<Labware['renderProfile']> {
  if (labware.renderProfile) return labware.renderProfile
  if (labware.layoutFamily === 'reservoir') return 'reservoir'
  if (labware.layoutFamily === 'tube') return 'tube'
  if (labware.addressing.type === 'single') return 'tube'
  if (labware.addressing.type === 'linear') return 'reservoir'
  return 'plate'
}

/** Grid dimensions in landscape (more columns than rows), pre-orientation. */
function landscapeDims(labware: Labware): { cols: number; rows: number } {
  const a = labware.addressing
  if (a.type === 'grid') {
    return { cols: Math.max(1, a.columns ?? 1), rows: Math.max(1, a.rows ?? 1) }
  }
  if (a.type === 'linear') {
    const n = Math.max(1, a.linearLabels?.length ?? 1)
    return { cols: n, rows: 1 }
  }
  return { cols: 1, rows: 1 }
}

export function LabwareGlyph({ labware, orientation }: LabwareGlyphProps) {
  const profile = inferProfile(labware)
  // Fall back to currentColor (the tile text color) — SVG presentation
  // attributes don't resolve CSS var(), so a custom-property fallback wouldn't
  // paint. In practice every standard type carries a color via LABWARE_CONFIGS.
  const color = labware.color ?? 'currentColor'
  const square = labware.geometry.wellShape === 'square'
  const conical =
    labware.geometry.wellShape === 'conical' || labware.geometry.wellShape === 'v-bottom'

  let { cols, rows } = landscapeDims(labware)
  // Portrait tiles are rotated 90°, so the schematic transposes to match.
  if (orientation === 'portrait') [cols, rows] = [rows, cols]

  const drawnCols = Math.min(cols, GRID_CAP.cols)
  const drawnRows = Math.min(rows, GRID_CAP.rows)
  const w = drawnCols * CELL + PAD * 2
  const h = drawnRows * CELL + PAD * 2

  // Reservoirs draw as troughs/channels spanning the cross-axis rather than a
  // dot per well — that's the read that distinguishes a 12-channel reservoir
  // from a 12-column plate.
  const isReservoir = profile === 'reservoir'
  const isTube = profile === 'tube' || (drawnCols === 1 && drawnRows === 1)

  const cells: JSX.Element[] = []
  if (isTube) {
    // A single vessel: a fat circle, with an inner mark when it's conical.
    const cx = w / 2
    const cy = h / 2
    const r = Math.min(w, h) / 2 - PAD
    cells.push(<circle key="t" cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.55} stroke={color} />)
    if (conical) {
      cells.push(<circle key="ti" cx={cx} cy={cy} r={r * 0.4} fill={color} />)
    }
  } else if (isReservoir) {
    const horizontal = drawnRows === 1
    const lanes = horizontal ? drawnCols : drawnRows
    for (let i = 0; i < lanes; i++) {
      // Each lane is a long rounded rect across the short axis.
      const x = horizontal ? PAD + i * CELL + 1.2 : PAD + 1.2
      const y = horizontal ? PAD + 1.2 : PAD + i * CELL + 1.2
      const rw = horizontal ? CELL - 2.4 : w - PAD * 2 - 2.4
      const rh = horizontal ? h - PAD * 2 - 2.4 : CELL - 2.4
      cells.push(
        <rect
          key={i}
          x={x}
          y={y}
          width={rw}
          height={rh}
          rx={2}
          fill={color}
          fillOpacity={0.5}
          stroke={color}
        />,
      )
    }
  } else {
    // Plate / tiprack / tube rack: a well per cell. Tube racks get fatter
    // circles, tipracks draw as rings, plates as small wells (round or square).
    const isTubeset = profile === 'tubeset'
    const isTiprack = profile === 'tiprack'
    const r = isTubeset ? CELL * 0.42 : CELL * 0.34
    for (let row = 0; row < drawnRows; row++) {
      for (let col = 0; col < drawnCols; col++) {
        const cx = PAD + col * CELL + CELL / 2
        const cy = PAD + row * CELL + CELL / 2
        const key = `${row}-${col}`
        if (square) {
          cells.push(
            <rect
              key={key}
              x={cx - r}
              y={cy - r}
              width={r * 2}
              height={r * 2}
              rx={1}
              fill={color}
              fillOpacity={0.55}
            />,
          )
        } else {
          cells.push(
            <circle
              key={key}
              cx={cx}
              cy={cy}
              r={r}
              fill={isTiprack ? 'none' : color}
              fillOpacity={isTiprack ? undefined : 0.55}
              stroke={color}
              strokeWidth={isTiprack ? 1 : 0.5}
            />,
          )
        }
      }
    }
  }

  return (
    <svg
      className="tile__glyph"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {cells}
    </svg>
  )
}
