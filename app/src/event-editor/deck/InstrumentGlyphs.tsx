import type { InstrumentKind } from '../../types/labware'

/**
 * Per-instrument SVG silhouettes for bench instruments.
 *
 * Each draws a recognizable side/front schematic tuned to the biologist's at-a-
 * glance read: a qPCR machine has the hinged lid + sample block, a plate reader
 * has the raised deck + tilting screen + tray slit, a heater-shaker has the
 * heated puck + controls, a vortex has the tall motor column + top cup. All live
 * in a 50×50 viewBox (`preserveAspectRatio="xMidYMid meet"`) so the SAME glyph
 * scales up for instrument focus and down for deck tiles. `color` is the
 * instrument tile accent (orange by default), used for strokes + fills.
 */

interface InstrumentGlyphProps {
  kind: InstrumentKind
  color: string
}

export function InstrumentGlyph({ kind, color }: InstrumentGlyphProps) {
  switch (kind) {
    case 'qpcr':
      return <QpcrSvg color={color} />
    case 'plate_reader':
      return <PlateReaderSvg color={color} />
    case 'heater_shaker':
      return <HeaterShakerSvg color={color} />
    case 'vortex':
      return <VortexSvg color={color} />
    default:
      return <GenericInstrumentSvg color={color} />
  }
}

function SvgRoot({ children }: { children: JSX.Element[] }): JSX.Element {
  return (
    <svg
      className="tile__glyph instrument-glyph"
      viewBox="0 0 50 50"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** qPCR / real-time thermal cycler: hinged lid + sample block + display. */
function QpcrSvg({ color }: { color: string }) {
  return (
    <SvgRoot children={[
      // body
      <rect key="body" x={8} y={22} width={34} height={20} rx={3} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.4} />,
      // lid (hinged, open)
      <path key="lid" d="M 8 22 L 8 14 L 42 16 L 42 22 Z" fill={color} fillOpacity={0.14} stroke={color} strokeWidth={1.2} />,
      // lid latch line
      <line key="latch" x1={10} y1={16} x2={40} y2={16} stroke={color} strokeWidth={1} />,
      // sample block row (the tube strip / slide)
      <rect key="block" x={13} y={30} width={24} height={5} rx={1} fill="none" stroke={color} strokeWidth={1} />,
      <line key="b1" x1={16} y1={30} x2={16} y2={35} stroke={color} strokeWidth={1} />,
      <line key="b2" x1={22} y1={30} x2={22} y2={35} stroke={color} strokeWidth={1} />,
      <line key="b3" x1={28} y1={30} x2={28} y2={35} stroke={color} strokeWidth={1} />,
      <line key="b4" x1={34} y1={30} x2={34} y2={35} stroke={color} strokeWidth={1} />,
      // display screen
      <rect key="screen" x={10} y={37} width={16} height={3} rx={1} fill={color} opacity={0.7} />,
      // base feet
      <line key="f1" x1={12} y1={42} x2={12} y2={45} stroke={color} strokeWidth={1.6} />,
      <line key="f2" x1={40} y1={42} x2={40} y2={45} stroke={color} strokeWidth={1.6} />,
    ]} />
  )
}

/** Plate reader: bench unit with a raised deck, tilting screen, tray slit. */
function PlateReaderSvg({ color }: { color: string }) {
  return (
    <SvgRoot children={[
      // main chassis
      <rect key="body" x={6} y={24} width={38} height={18} rx={3} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.4} />,
      // raised deck
      <rect key="deck" x={14} y={20} width={16} height={4} rx={1} fill="none" stroke={color} strokeWidth={1.2} />,
      // tilting screen on top-back
      <path key="screen" d="M 36 16 L 46 26 L 46 24 L 36 22 Z" fill={color} fillOpacity={0.14} stroke={color} strokeWidth={1} />,
      // front tray slit (where the plate goes in)
      <rect key="slit" x={12} y={29} width={8} height={3} rx={1} fill={color} opacity={0.6} />,
      // read indicator light
      <circle key="led" cx={30} cy={39} r={1.6} fill={color} />,
      // base
      <rect key="base" x={6} y={42} width={38} height={2} rx={1} fill={color} fillOpacity={0.3} />,
    ]} />
  )
}

/** Heater-shaker / thermomixer: heated puck + body + controls. */
function HeaterShakerSvg({ color }: { color: string }) {
  return (
    <SvgRoot children={[
      // body
      <rect key="body" x={8} y={24} width={34} height={18} rx={3} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.4} />,
      // heated puck (block tube-rack bay on top)
      <rect key="puck" x={20} y={16} width={16} height={8} rx={2} fill="none" stroke={color} strokeWidth={1.3} />,
      // tube wells in the puck
      <circle key="w1" cx={24} cy={20} r={1.6} fill={color} />,
      <circle key="w2" cx={29} cy={20} r={1.6} fill={color} />,
      <circle key="w3" cx={34} cy={20} r={1.6} fill={color} />,
      // heat shimmer line
      <path key="heat" d="M 14 18 C 18 14 26 14 30 18 Z" fill="none" stroke={color} strokeWidth={0.9} opacity={0.6} />,
      // control knobs
      <circle key="k1" cx={13} cy={34} r={2.2} fill={color} opacity={0.5} />,
      <circle key="k2" cx={22} cy={34} r={2.2} fill={color} opacity={0.5} />,
      // display
      <rect key="disp" x={14} y={37} width={12} height={3} rx={1} fill={color} opacity={0.7} />,
    ]} />
  )
}

/** Vortex: tall motor column, top collar cup, broad base, side knob. */
function VortexSvg({ color }: { color: string }) {
  return (
    <SvgRoot children={[
      // motor column (tall)
      <rect key="col" x={20} y={10} width={10} height={30} rx={2} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1.4} />,
      // top rubber cup (collar) holding the tube
      <path key="cup" d="M 14 10 L 14 16 L 36 16 L 36 10 Z" fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1.2} />,
      <circle key="tube" cx={25} cy={13} r={2.2} fill={color} opacity={0.6} />,
      // sloped collar top
      <path key="collar" d="M 14 14 L 36 14" stroke={color} strokeWidth={1.2} />,
      // broad base
      <path key="base" d="M 8 40 L 8 44 L 42 44 L 42 40 Z" fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1.3} />,
      // side speed knob
      <circle key="knob" cx={33} cy={29} r={2.4} fill={color} opacity={0.5} />,
      // rotation hint
      <path key="spin" d="M 25 20 A 3 3 0 1 1 0" fill="none" stroke={color} strokeWidth={0.9} opacity={0.5} />,
    ]} />
  )
}

/** Generic instrument: a plain bench block with an indicator light. */
function GenericInstrumentSvg({ color }: { color: string }) {
  return (
    <SvgRoot children={[
      <rect key="body" x={8} y={20} width={34} height={22} rx={3} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.4} />,
      <rect key="disp" x={12} y={26} width={14} height={5} rx={1} fill={color} opacity={0.5} />,
      <circle key="led" cx={40} cy={38} r={1.8} fill={color} />,
      <line key="f1" x1={12} y1={42} x2={12} y2={45} stroke={color} strokeWidth={1.6} />,
      <line key="f2" x1={40} y1={42} x2={40} y2={45} stroke={color} strokeWidth={1.6} />,
    ]} />
  )
}