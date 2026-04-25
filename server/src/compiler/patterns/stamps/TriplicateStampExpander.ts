/**
 * TriplicateStampExpander - Expands a triplicate_stamp pattern into 24 transfer
 * events (3 columns × 8 rows) from source column to destination columns
 * N, N+1, N+2.
 */

import { registerPatternExpander, type PatternExpander } from '../PatternExpanders.js';
import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export const triplicateStampExpander: PatternExpander = {
  expand(event, _spec, _ctx) {
    const startCol = (event.startCol as number | undefined) ?? 1;
    const fromHint = event.fromLabwareHint;
    const toHint = event.toLabwareHint;
    const events: PlateEventPrimitive[] = [];
    for (let rep = 0; rep < 3; rep++) {
      const dstCol = startCol + rep;
      for (let r = 0; r < ROWS.length; r++) {
        const srcWell = `${ROWS[r]}${startCol}`;
        const dstWell = `${ROWS[r]}${dstCol}`;
        events.push({
          eventId: `pe_triplicate_${rep}_${r}`,
          event_type: 'transfer',
          details: {
            from: { labwareHint: fromHint, well: srcWell },
            to: { labwareHint: toHint, well: dstWell },
            volumeUl: event.perPosition?.volumeUl ?? 0,
          },
        });
      }
    }
    return events;
  },
};

registerPatternExpander('triplicate_stamp', triplicateStampExpander);
