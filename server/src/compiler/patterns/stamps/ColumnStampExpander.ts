/**
 * ColumnStampExpander - Expands a column_stamp pattern into 8 transfer events
 * (one per row A-H) from source column to destination column.
 */

import { registerPatternExpander, type PatternExpander } from '../PatternExpanders.js';
import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export const columnStampExpander: PatternExpander = {
  expand(event, _spec, _ctx) {
    const startCol = (event.startCol as number | undefined) ?? 1;
    const fromHint = event.fromLabwareHint;
    const toHint = event.toLabwareHint;
    const events: PlateEventPrimitive[] = [];
    for (let i = 0; i < ROWS.length; i++) {
      const well = `${ROWS[i]}${startCol}`;
      events.push({
        eventId: `pe_colstamp_${i}`,
        event_type: 'transfer',
        details: {
          from: { labwareHint: fromHint, well },
          to: { labwareHint: toHint, well },
          volumeUl: event.perPosition?.volumeUl ?? 0,
        },
      });
    }
    return events;
  },
};

registerPatternExpander('column_stamp', columnStampExpander);
