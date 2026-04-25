/**
 * DeckGeometryChecks - Validation checks for deck layout geometry.
 *
 * - deck-slot-conflict: errors if deckLayoutPlan.conflicts is non-empty.
 */

import { registerValidationCheck } from '../ValidationCheck.js';
import type { ValidationFinding } from '../ValidationReport.js';

// ---------------------------------------------------------------------------
// deck-slot-conflict
// ---------------------------------------------------------------------------

registerValidationCheck({
  id: 'deck-slot-conflict',
  category: 'deck-geometry',
  run({ artifacts }) {
    const conflicts = artifacts.deckLayoutPlan?.conflicts ?? [];
    return conflicts.map((c) => ({
      severity: 'error' as const,
      category: 'deck-geometry',
      message: `Deck slot ${c.slot} claimed by multiple labware: ${c.candidates.join(', ')}`,
      suggestion:
        'Remove conflicting deckSlot from one candidate or choose a different slot.',
      details: { slot: c.slot, candidates: c.candidates },
    })) as ValidationFinding[];
  },
});
