/**
 * QuadrantStampExpander - Expands a quadrant_stamp pattern from a 96-well
 * source plate into a 384-well destination plate.
 *
 * Mapping: source well at (r, c) in 96-well → destination 2×2 block at
 * rows [A+(r*2), A+(r*2)+1] × cols [(c-1)*2+1, (c-1)*2+2].
 *
 *   A1 (r=0, c=1) → {A1, A2, B1, B2}
 *   A2 (r=0, c=2) → {A3, A4, B3, B4}
 *   H12 (r=7, c=12) → {O23, O24, P23, P24}
 *
 * perPosition keys name a quadrant position ('A1', 'A2', 'B1', 'B2') —
 * i.e. which cell of the 2×2 block — and map to metadata that attaches
 * to that destination well.
 */

import { registerPatternExpander, type PatternExpander } from '../PatternExpanders.js';
import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';

const SOURCE_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const DEST_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'] as const;
const QUAD_POSITIONS: Array<[number, number, 'A1' | 'A2' | 'B1' | 'B2']> = [
  [0, 0, 'A1'],
  [0, 1, 'A2'],
  [1, 0, 'B1'],
  [1, 1, 'B2'],
];

export const quadrantStampExpander: PatternExpander = {
  expand(event, _spec, _ctx) {
    const fromHint = event.fromLabwareHint ?? '';
    const toHint = event.toLabwareHint ?? '';
    const events: PlateEventPrimitive[] = [];
    const perPosition = event.perPosition ?? {};
    const volumeUl = (event as Record<string, unknown>).volumeUl as number | undefined ?? 0;
    let counter = 0;

    for (let sr = 0; sr < SOURCE_ROWS.length; sr++) {
      for (let sc = 1; sc <= 12; sc++) {
        const srcWell = `${SOURCE_ROWS[sr]}${sc}`;
        for (const [dr, dc, pos] of QUAD_POSITIONS) {
          const destRow = DEST_ROWS[sr * 2 + dr];
          const destCol = (sc - 1) * 2 + 1 + dc;
          const destWell = `${destRow}${destCol}`;
          const perPositionContext = perPosition[pos] as Record<string, unknown> | undefined;
          events.push({
            eventId: `pe_quad_${counter++}`,
            event_type: 'transfer',
            details: {
              from: { labwareHint: fromHint, well: srcWell },
              to: { labwareHint: toHint, well: destWell },
              volumeUl,
              ...(perPositionContext ? { assayContext: perPositionContext } : {}),
            },
          });
        }
      }
    }

    return events;
  },
};

registerPatternExpander('quadrant_stamp', quadrantStampExpander);
