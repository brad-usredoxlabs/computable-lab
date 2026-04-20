import type { FC } from 'react';
import type { PlateEvent } from '../../types/events';

export interface WellCenter {
  x: number;
  y: number;
}

export interface PreviewTransferLayerProps {
  previewEvents: PlateEvent[];
  /** Map key: `${labwareRecordId}:${wellId}` or plain wellId if a single labware. */
  wellCenters: Map<string, WellCenter>;
  /** Optional size of the svg overlay — defaults to covering parent (100% / 100%). */
  width?: number | string;
  height?: number | string;
}

interface TransferArrow {
  key: string;
  from: WellCenter;
  to: WellCenter;
  label?: string;
}

const ARROW_COLOR = '#be4bdb';

function isTransferEvent(e: PlateEvent): boolean {
  return e.event_type === 'transfer' || e.event_type === 'multi_dispense';
}

function centerFor(
  centers: Map<string, WellCenter>,
  labwareRecordId: string | undefined,
  wellId: string | undefined,
): WellCenter | undefined {
  if (!wellId) return undefined;
  if (labwareRecordId) {
    const composite = centers.get(`${labwareRecordId}:${wellId}`);
    if (composite) return composite;
  }
  return centers.get(wellId);
}

function formatVolume(v: unknown): string | undefined {
  if (v && typeof v === 'object' && 'value' in v && 'unit' in v) {
    const vv = v as { value: number; unit: string };
    return `${vv.value} ${vv.unit}`;
  }
  return undefined;
}

function buildArrows(
  events: PlateEvent[],
  centers: Map<string, WellCenter>,
): TransferArrow[] {
  const arrows: TransferArrow[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e || !isTransferEvent(e)) continue;
    const details = e.details as unknown as {
      source_labwareId?: string;
      source_wells?: string[];
      dest_labwareId?: string;
      dest_wells?: string[];
      volume?: { value: number; unit: string };
    };
    const sourceWell = details.source_wells?.[0];
    const targetWell = details.dest_wells?.[0];
    const from = centerFor(centers, details.source_labwareId, sourceWell);
    const to = centerFor(centers, details.dest_labwareId, targetWell);
    if (!from || !to) continue;
    arrows.push({
      key: e.eventId ?? `xfer-${i}`,
      from,
      to,
      ...(formatVolume(details.volume) ? { label: formatVolume(details.volume)! } : {}),
    });
  }
  return arrows;
}

export const PreviewTransferLayer: FC<PreviewTransferLayerProps> = ({
  previewEvents,
  wellCenters,
  width = '100%',
  height = '100%',
}) => {
  if (!previewEvents || previewEvents.length === 0) return null;
  if (!wellCenters || wellCenters.size === 0) return null;
  const arrows = buildArrows(previewEvents, wellCenters);
  if (arrows.length === 0) return null;

  return (
    <svg
      className="preview-transfer-layer"
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      data-testid="preview-transfer-layer"
    >
      <defs>
        <marker
          id="preview-transfer-arrowhead"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ARROW_COLOR} />
        </marker>
      </defs>
      {arrows.map((a) => {
        const midX = (a.from.x + a.to.x) / 2;
        const midY = (a.from.y + a.to.y) / 2;
        return (
          <g key={a.key} data-testid="preview-transfer-arrow">
            <line
              x1={a.from.x}
              y1={a.from.y}
              x2={a.to.x}
              y2={a.to.y}
              stroke={ARROW_COLOR}
              strokeWidth={2}
              markerEnd="url(#preview-transfer-arrowhead)"
            />
            {a.label ? (
              <text
                x={midX}
                y={midY - 4}
                fill={ARROW_COLOR}
                fontSize={10}
                textAnchor="middle"
              >
                {a.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
};
