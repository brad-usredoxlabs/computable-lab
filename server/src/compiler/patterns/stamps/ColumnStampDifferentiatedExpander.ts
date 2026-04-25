/**
 * ColumnStampDifferentiatedExpander - Expands a column_stamp_differentiated
 * pattern from a reservoir source into N destination columns, each with a
 * different perturbant.
 *
 * Input PatternEvent has perPosition keyed by column labels:
 *   { col_1: { perturbant: 'clofibrate', volumeUl: 2 }, col_6: { ... }, ... }
 *
 * Emits 8 transfer events per destination column (one per row A-H).
 * Each event carries details.perturbant and details.volumeUl from the
 * perPosition entry for that column.
 */

import { registerPatternExpander, type PatternExpander } from '../PatternExpanders.js';
import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export const columnStampDifferentiatedExpander: PatternExpander = {
  expand(event, _spec, _ctx) {
    const fromHint = event.fromLabwareHint ?? '';
    const toHint = event.toLabwareHint ?? '';
    const events: PlateEventPrimitive[] = [];
    const perPosition = event.perPosition ?? {};
    const colKeys = Object.keys(perPosition).filter((k) => k.startsWith('col_'));
    let counter = 0;

    for (const key of colKeys) {
      const col = Number(key.slice(4));
      const ctx = perPosition[key] as Record<string, unknown>;
      for (let r = 0; r < ROWS.length; r++) {
        events.push({
          eventId: `pe_coldiff_${counter++}`,
          event_type: 'transfer',
          details: {
            from: { labwareHint: fromHint, well: `A${col}` },
            to: { labwareHint: toHint, well: `${ROWS[r]}${col}` },
            volumeUl: (ctx.volumeUl as number | undefined) ?? 0,
            ...(ctx.perturbant ? { perturbant: ctx.perturbant as string } : {}),
          },
        });
      }
    }

    return events;
  },
};

registerPatternExpander('column_stamp_differentiated', columnStampDifferentiatedExpander);
