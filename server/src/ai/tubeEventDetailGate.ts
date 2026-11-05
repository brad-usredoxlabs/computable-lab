/**
 * tubeEventDetailGate — repairs and gates AI-drafted tube event details.
 *
 * The AI agent has been drafting place_tube details shaped like the
 * LABWARE-REQUIREMENT vocabulary ({ tubeVolumeClass: '1.5ml' }) while the
 * event contract (schema/workflow/events/plate-event.*.schema.yaml) wants
 * details.tube = { sizeLabel, maxVolume_uL, wellShape? }. This module detects
 * that drift and repairs it against the tube-size registry (data, not code);
 * what cannot be repaired is dropped, never silently passed through.
 *
 * Contracts are data: each verb's declared detail property names are read from
 * the schema YAML files at lazy module init (fs + yaml), so unknown top-level
 * keys are pruned by the schema's own declarations, never a hardcoded list.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { resolveTubeHint } from '../registry/TubeSizeRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** verb → details-schema $id for the three tube-event verbs. */
export const TUBE_EVENT_SCHEMA_IDS: Record<string, string> = {
  place_tube:
    'https://computable-lab.com/schema/computable-lab/workflow/events/plate-event.place-tube.schema.yaml',
  move_tube:
    'https://computable-lab.com/schema/computable-lab/workflow/events/plate-event.move-tube.schema.yaml',
  remove_tube:
    'https://computable-lab.com/schema/computable-lab/workflow/events/plate-event.remove-tube.schema.yaml',
};

const SCHEMA_DIR = join(__dirname, '../../../schema/workflow/events');
const SCHEMA_FILES_BY_VERB: Record<string, string> = {
  place_tube: 'plate-event.place-tube.schema.yaml',
  move_tube: 'plate-event.move-tube.schema.yaml',
  remove_tube: 'plate-event.remove-tube.schema.yaml',
};

export type TubeGateValidator = (
  data: unknown,
  schemaId: string,
) =>
  | { valid: boolean; errors?: Array<{ path?: string; message?: string }> }
  | Promise<{ valid: boolean; errors?: Array<{ path?: string; message?: string }> }>;

export interface TubeGateResult<T> {
  events: T[];
  dropped: Array<{ eventId: string; verb: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Lazy, function-scoped caches (module import stays side-effect-free; the
// first gate call pays the disk read, a missing file fails loud).
// ---------------------------------------------------------------------------

let declaredPropsCache: Map<string, Set<string>> | null = null;

function declaredDetailProps(verb: string): Set<string> {
  if (!declaredPropsCache) {
    declaredPropsCache = new Map();
    for (const [v, file] of Object.entries(SCHEMA_FILES_BY_VERB)) {
      const filePath = join(SCHEMA_DIR, file);
      const doc = parseYaml(readFileSync(filePath, 'utf8')) as {
        properties?: Record<string, unknown>;
      };
      declaredPropsCache.set(v, new Set(Object.keys(doc.properties ?? {})));
    }
  }
  const props = declaredPropsCache.get(verb);
  if (!props) {
    throw new Error(`[tubeEventDetailGate] no details schema declared for verb '${verb}'`);
  }
  return props;
}

// ---------------------------------------------------------------------------
// place_tube repair ladder
// ---------------------------------------------------------------------------

const PLACE_TUBE_TUBE_KEYS = ['sizeLabel', 'maxVolume_uL', 'wellShape'] as const;

interface Repair {
  changed: boolean;
  /** Human-readable name of the repair attempt, used in drop reasons. */
  attempt: string | null;
}

function tubeAsDetails(preset: {
  sizeLabel: string;
  maxVolume_uL: number;
  wellShape?: 'round' | 'square' | 'v-bottom' | 'conical';
}): Record<string, unknown> {
  return {
    sizeLabel: preset.sizeLabel,
    maxVolume_uL: preset.maxVolume_uL,
    ...(preset.wellShape ? { wellShape: preset.wellShape } : {}),
  };
}

/**
 * Ladder (first match wins), operating on a mutable clone:
 *  1. details.tube object already present → keep only declared tube keys.
 *  2. details.tubeVolumeClass string → resolve via registry hints.
 *  3. flat details.sizeLabel (+ maxVolume_uL) → nest into details.tube.
 *  4. otherwise no tube repair (validation decides).
 */
function repairPlaceTube(details: Record<string, unknown>): Repair {
  const tube = details.tube;
  if (tube && typeof tube === 'object' && !Array.isArray(tube)) {
    const src = tube as Record<string, unknown>;
    const pruned: Record<string, unknown> = {};
    let changed = false;
    for (const key of Object.keys(src)) {
      if ((PLACE_TUBE_TUBE_KEYS as readonly string[]).includes(key)) {
        pruned[key] = src[key];
      } else {
        changed = true;
      }
    }
    details.tube = pruned;
    return { changed: true, attempt: changed ? 'pruned tube keys' : null };
  }

  const volumeClass = details.tubeVolumeClass;
  if (typeof volumeClass === 'string') {
    const preset = resolveTubeHint(volumeClass);
    if (preset) {
      details.tube = tubeAsDetails(preset);
      delete details.tubeVolumeClass;
      return { changed: true, attempt: `repaired tubeVolumeClass '${volumeClass}' from the tube-size registry` };
    }
    // No registry match: leave it — validation will reject it.
    return { changed: false, attempt: `unrecognized tubeVolumeClass '${volumeClass}'` };
  }

  const sizeLabel = details.sizeLabel;
  if (typeof sizeLabel === 'string') {
    const maxVolume = details.maxVolume_uL;
    if (typeof maxVolume === 'number' && maxVolume > 0) {
      const preset = resolveTubeHint(sizeLabel);
      details.tube = {
        sizeLabel,
        maxVolume_uL: maxVolume,
        ...(preset?.wellShape ? { wellShape: preset.wellShape } : {}),
      };
      delete details.sizeLabel;
      delete details.maxVolume_uL;
      return { changed: true, attempt: 'nested flat sizeLabel/maxVolume_uL into tube' };
    }
    if (maxVolume === undefined) {
      const preset = resolveTubeHint(sizeLabel);
      if (preset) {
        details.tube = tubeAsDetails(preset);
        delete details.sizeLabel;
        return { changed: true, attempt: `expanded flat sizeLabel '${sizeLabel}' from the tube-size registry` };
      }
    }
  }

  return { changed: false, attempt: null };
}

/** Remove top-level keys the verb's details schema does not declare. */
function pruneUndeclaredTopLevel(
  details: Record<string, unknown>,
  declared: Set<string>,
): boolean {
  let changed = false;
  for (const key of Object.keys(details)) {
    if (!declared.has(key)) {
      delete details[key];
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export async function gateTubeEventDetails<
  T extends {
    eventId: string;
    event_type: string;
    verb: string;
    details: Record<string, unknown>;
    notes?: string;
  },
>(events: T[], validate: TubeGateValidator): Promise<TubeGateResult<T>> {
  const out: T[] = [];
  const dropped: Array<{ eventId: string; verb: string; reason: string }> = [];

  for (const event of events) {
    const verb = event.verb || event.event_type;
    const schemaId = TUBE_EVENT_SCHEMA_IDS[verb];
    if (!schemaId) {
      // Not a tube event — pass through untouched, never validated here.
      out.push(event);
      continue;
    }

    const details: Record<string, unknown> = { ...event.details };
    let attempts: string[] = [];

    if (verb === 'place_tube') {
      const repair = repairPlaceTube(details);
      if (repair.attempt) attempts.push(repair.attempt);
    }
    if (pruneUndeclaredTopLevel(details, declaredDetailProps(verb))) {
      attempts.push('pruned undeclared top-level detail keys');
    }

    const verdict = await validate(details, schemaId);
    if (verdict.valid) {
      const detailsChanged = !shallowEqual(details, event.details);
      out.push(detailsChanged ? { ...event, details } : event);
    } else {
      const first = verdict.errors?.find((e) => typeof e.message === 'string');
      let reason = first?.message || `does not satisfy the ${verb} details contract`;
      if (attempts.length > 0 && verb === 'place_tube') {
        reason = `after repair (${attempts.join('; ')}): ${reason}`;
      }
      dropped.push({ eventId: event.eventId, verb, reason });
    }
  }

  return { events: out, dropped };
}

function shallowEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}
