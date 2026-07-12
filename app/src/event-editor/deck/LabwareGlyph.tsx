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

interface GlasswareSvgProps {
  color: string
}

// Layout units (arbitrary; the SVG scales to the tile via viewBox + CSS).
const CELL = 10
const PAD = 2

/**
 * Well radius for tube-rack glyphs, scaled by per-well volume so racks with the
 * same grid but different tube sizes read differently at a glance — e.g. the
 * four-way bench rack's 4×8 of 0.5 mL tubes draws finer than its 4×8 of 1.5/2 mL
 * tubes. Log scale between a 0.2 mL floor and a 50 mL ceiling → 0.30–0.46 CELL.
 */
function tubesetWellRadius(maxVolumeUl: number): number {
  const MIN_UL = 200
  const MAX_UL = 50000
  const clamped = Math.min(Math.max(maxVolumeUl, MIN_UL), MAX_UL)
  const t = (Math.log10(clamped) - Math.log10(MIN_UL)) / (Math.log10(MAX_UL) - Math.log10(MIN_UL))
  return CELL * (0.3 + 0.16 * t)
}
// Above this many rows/columns we draw a representative capped grid rather than
// every well — keeps the densest tiers (1536) from drawing 1500+ circles.
const GRID_CAP = { cols: 24, rows: 16 }

function inferProfile(labware: Labware): NonNullable<Labware['renderProfile']> {
  if (labware.renderProfile) return labware.renderProfile
  if (labware.layoutFamily === 'reservoir') return 'reservoir'
  if (labware.layoutFamily === 'tube') {
    // A multi-position rack is a tubeset (grid of tubes); only a lone vessel is
    // a 'tube'. Without this, every tube rack collapses to a single circle in
    // the small tile and you can't tell what's on the bench at a glance.
    return labware.addressing.type === 'single' ? 'tube' : 'tubeset'
  }
  if (labware.addressing.type === 'single') return 'tube'
  if (labware.addressing.type === 'linear') return 'reservoir'
  return 'plate'
}

/** Detect beaker / flask glassware by labwareType prefix. */
function inferGlasswareType(labware: Labware): 'beaker' | 'flask' | null {
  const lt = labware.labwareType ?? ''
  if (lt.startsWith('beaker_')) return 'beaker'
  if (lt.startsWith('flask_')) return 'flask'
  return null
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

/**
 * Side-view SVG of a cylindrical beaker with spout and graduation ticks.
 */
function BeakerSvg({ color }: GlasswareSvgProps) {
  return (
    <svg
      className="tile__glyph"
      viewBox="0 0 50 50"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {/* Cylindrical body with spout on the left */}
      <path
        d="M 9 10 L 9 38 L 7 42 L 7 44 L 11 44 L 11 40 L 39 40 L 39 10 Z"
        fill={color}
        fillOpacity={0.25}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Top rim */}
      <path
        d="M 8 10 L 40 10"
        stroke={color}
        strokeWidth={2}
        fill="none"
      />
      {/* Graduation ticks (right wall) */}
      <line x1={36} y1={17} x2={39} y2={17} stroke={color} strokeWidth={1.2} />
      <line x1={36} y1={25} x2={39} y2={25} stroke={color} strokeWidth={1.2} />
      <line x1={36} y1={33} x2={39} y2={33} stroke={color} strokeWidth={1.2} />
    </svg>
  )
}

/**
 * Side-view SVG of an Erlenmeyer flask with narrow neck and conical body.
 */
function FlaskSvg({ color }: GlasswareSvgProps) {
  return (
    <svg
      className="tile__glyph"
      viewBox="0 0 50 50"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {/* Flask body: neck + conical body + flat base */}
      <path
        d="M 18 2 L 18 12 L 6 42 L 44 42 L 32 12 L 32 2 Z"
        fill={color}
        fillOpacity={0.25}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Neck rim */}
      <path
        d="M 17 2 L 33 2"
        stroke={color}
        strokeWidth={2}
        fill="none"
      />
      {/* Graduation ticks (right side of conical body) */}
      <line x1={35} y1={20} x2={38} y2={20} stroke={color} strokeWidth={1.2} />
      <line x1={32} y1={30} x2={35} y2={30} stroke={color} strokeWidth={1.2} />
      <line x1={29} y1={38} x2={32} y2={38} stroke={color} strokeWidth={1.2} />
    </svg>
  )
}

export function LabwareGlyph({ labware, orientation }: LabwareGlyphProps) {
  const profile = inferProfile(labware)
  const glasswareType = inferGlasswareType(labware)
  // Fall back to currentColor (the tile text color) — SVG presentation
  // attributes don't resolve CSS var(), so a custom-property fallback wouldn't
  // paint. In practice every standard type carries a color via LABWARE_CONFIGS.
  const color = labware.color ?? 'currentColor'
  const square = labware.geometry.wellShape === 'square'
  const conical =
    labware.geometry.wellShape === 'conical' || labware.geometry.wellShape === 'v-bottom'

  // Glassware (beaker/flask) renders as a side-view SVG, bypassing the grid
  // schematic entirely — a single circle doesn't communicate what the object is.
  if (glasswareType === 'beaker') {
    return <BeakerSvg color={color} />
  }
  if (glasswareType === 'flask') {
    return <FlaskSvg color={color} />
  }

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
    const r = isTubeset ? tubesetWellRadius(labware.geometry.maxVolume_uL) : CELL * 0.34
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
