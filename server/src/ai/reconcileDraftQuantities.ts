/**
 * Reconcile the QUANTITY KIND on drafted add-material events against the unit
 * the biologist actually spoke.
 *
 * Observed defect (Brad, 2026-09-21): "Add 200 µL of DMEM" ghosted as 200
 * *counts* of DMEM. Root cause: the `materials[]` tool schema had a `count`
 * slot but no `volume` slot, so a volume-dosed material had no canonical
 * structured home for its amount and the model reached for `count`, dropping
 * the unit. `recoverInventedMaterialFields` then copied bare `count` into
 * `details.count` with no unit check.
 *
 * Sometimes additions are counts (10,000 HepG2 cells, 10 beads) and sometimes
 * they are volumes (200 µL of DMEM). The one trustworthy source of which is
 * WHICH is the biologist's own words, preserved in the prompt and the event
 * note. This module reads `N <unit>` out of those words for a material and
 * heals a draft that misfiled it:
 *
 *   words say a volume, event has a bare count (no volume)  → move to `volume`
 *   words say a volume, event has NO amount at all           → set `volume`
 *   words say a count, event has a volume (rare)             → move to `count`
 *
 * It never guesses: a volume unit must be present in the words, the numbers
 * must agree when an amount already exists, and a bare "100" with no unit is
 * left untouched (the review dialogue still sees it). Nothing is fabricated.
 */
type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return asDict(value) as Record<string, unknown> | null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Volume-unit spellings a biologist actually types (µL, ul, ml, L, …). */
const VOLUME_UNIT_RE = /(?:µl|μl|µL|μL|u[lL]|U[lL]|[mM][lL]|[lL])\b/;
/** Count words after a number: cells, beads, particles, units, spheres… */
const COUNT_WORD_RE =
  /\b(cells?|beads?|particles?|units?|spheroids?|organoids?|colonies?|embryos?|blastocysts?|microcarriers?|microliter(s)?|microlitres?)\b/;

export function isVolumeUnit(unit: string): boolean {
  return VOLUME_UNIT_RE.test(unit.trim());
}

/** Collapse the volume-unit spellings to one canonical form ('uL' | 'mL' | 'L'). */
export function normalizeVolumeUnit(unit: string): string {
  const u = unit.trim();
  if (/^[µμuU]l$/i.test(u)) return 'uL';
  if (/^[µμuU][lL]$/.test(u)) return 'uL';
  if (/^ml?$/i.test(u)) return 'mL';
  if (/^L$/.test(u)) return 'L';
  if (/^µ\s*l$/i.test(u)) return 'uL';
  return u;
}

/** Parse a comma/space-grouped number the biologist typed ("10,000", "1.5"). */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface StatedQuantity {
  value: number;
  unit: string;
  kind: 'volume' | 'count';
}

/**
 * Find the `N <unit>` the biologist attached to a material in a sentence.
 * Returns null when no amount-with-unit is associated with that material.
 *
 * Association: the quantity token must sit near the material label (within a
 * ~90-char window), so "Add 200uL of DMEM" associates 200 µL with DMEM and a
 * sibling "…and 500 cells" doesn't bleed across materials in the same prompt.
 */
export function extractQuantity(sentence: string, materialLabel: string): StatedQuantity | null {
  if (!sentence) return null;
  const haystack = sentence;
  const label = materialLabel.trim();
  // Number (digits, comma or dot thousand group) + optional filler words + a
  // unit word. The number class deliberately EXCLUDES whitespace so "10,000"
  // stays one token and cannot swallow the words after it.
  const tokenRe = /(\d[\d,\.]*(?:\.\d+)?)\s*(?:[a-zA-Z0-9]{0,24}\s+){0,2}(µl|μl|µL|μL|u[lL]|U[lL]|[mM][lL]|[lL](?![a-zA-Z])|cells?|beads?|particles?|units?|spheroids?|organoids?|colonies?|embryos?|blastocysts?|microcarriers?|microliters?|microlitres?)\b/gi;

  let best: StatedQuantity | null = null;
  let bestDist = Infinity;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(haystack)) !== null) {
    const amount = parseAmount(match[1]!);
    if (amount === null) continue;
    const unitRaw = match[2]!;
    const volumeUnitMatch = unitRaw.match(/^[µμuU][lL]$|^[mM][lL]$|^[lL]$/);
    const countWord = COUNT_WORD_RE.test(unitRaw) ? unitRaw : null;
    if (!volumeUnitMatch && !countWord) continue;
    const kind: 'volume' | 'count' = volumeUnitMatch ? 'volume' : 'count';
    const unit = kind === 'volume'
      ? normalizeVolumeUnit(unitRaw)
      : countWord!.toLowerCase();

    // Distance from the material label to this token (0 when they overlap).
    const labelIdx = label ? haystack.toLocaleLowerCase().indexOf(label.toLocaleLowerCase()) : -1;
    const tokenIdx = match.index;
    let distance = Infinity;
    if (labelIdx >= 0) {
      distance = Math.abs(tokenIdx - labelIdx);
    } else if (!label) {
      distance = 0; // no label to anchor on: accept the first amount-with-unit
    }
    if (labelIdx >= 0 && distance > 90) continue; // a different material's amount
    if (distance < bestDist) {
      bestDist = distance;
      best = { value: amount, unit, kind };
    }
  }
  return best;
}

export interface QuantityReconciliation {
  events: unknown[];
  notes: string[];
}

function materialLabelOfEvent(details: Dict): string {
  const ref = asDict(details['material_ref']);
  if (ref) {
    const direct = asString(ref['label']);
    if (direct) return direct;
    const mint = asDict(ref['mint']);
    if (mint) {
      const m = asString(mint['label']);
      if (m) return m;
    }
    const id = asString(ref['id']);
    if (id.startsWith('mint:')) return id.slice('mint:'.length).trim();
  }
  return '';
}

function numericValue(details: Dict, key: string): number | null {
  const v = details[key];
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return null;
}

/**
 * Heal drafted add-material events whose quantity kind disagrees with the unit
 * the biologist spoke. `prompts` = the user's utterance(s) plus the event notes
 * (the event note routinely preserves "Adding 200 µL of DMEM" even when the
 * structured field dropped the unit).
 */
export function reconcileDraftQuantities(events: readonly unknown[], prompts: readonly string[]): QuantityReconciliation {
  const notes: string[] = [];
  const allPrompts = prompts.filter((p): p is string => typeof p === 'string' && p.length > 0);

  const out = events.map((rawEvent) => {
    const event = asDict(rawEvent);
    if (!event) return rawEvent;
    if (asString(event['verb']) !== 'add_material' && asString(event['event_type']) !== 'add_material') return rawEvent;
    const details = asRecord(event['details']);
    if (!details) return rawEvent;

    const label = materialLabelOfEvent(details);
    if (!label) return rawEvent;

    for (const note of allPrompts) {
      const stated = extractQuantity(note, label);
      if (!stated) continue;
      let changed = false;
      const next: Record<string, unknown> = { ...details };

      if (stated.kind === 'volume') {
        const existingVolume = asDict(next['volume']);
        if (existingVolume && typeof existingVolume['value'] === 'number' && asString(existingVolume['unit'])) {
          continue; // already correct
        }
        const existingCount = numericValue(next, 'count');
        if (existingCount === null) {
          // NO amount at all — the words carry it. Set it (not fabrication: the
          // biologist said it).
          next['volume'] = { value: stated.value, unit: stated.unit };
          changed = true;
        } else if (existingCount === stated.value) {
          // The model misfiled the volume as a count (or vice-versa) AND the
          // numbers agree — close the loop.
          next['volume'] = { value: stated.value, unit: stated.unit };
          delete next['count'];
          changed = true;
        }
        // numbers disagree → do not guess; leave for the review dialogue.
      } else {
        const existingVolumeValue = numericValue(details, 'volume');
        if (existingVolumeValue !== null && existingVolumeValue !== stated.value) continue;
        const existingCount = numericValue(next, 'count');
        if (existingCount === null || existingCount === stated.value) {
          next['count'] = stated.value;
          if (existingVolumeValue !== null) delete next['volume'];
          changed = true;
        }
      }

      if (changed) {
        const kindWord = stated.kind === 'volume'
          ? `${stated.value} ${stated.unit}`
          : `${stated.value} ${stated.unit} (per addition)`;
        notes.push(
          `The biologist said "${kindWord}" for ${label}; I moved it to the '${stated.kind}' quantity field in the draft.`,
        );
        return { ...event, details: next };
      }
    }
    return rawEvent;
  });

  return { events: out, notes };
}