/**
 * TubeSizeRegistry — data-driven tube-size presets.
 *
 * Loads schema/registry/tube-sizes/tube-size-presets.v1.yaml (validated with
 * zod, cached in memory, fail-loud on missing/invalid data — never fabricate).
 * Mirrors the ExecutionScaleProfileRegistry path-resolution pattern: the
 * registry directory is resolved from this module's own location, never from
 * process.cwd().
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TubeWellShape = z.enum(['round', 'square', 'v-bottom', 'conical']);

export interface TubeSizePreset {
  sizeLabel: string;
  maxVolume_uL: number;
  wellShape?: 'round' | 'square' | 'v-bottom' | 'conical';
  hints: string[];
}

const TubeSizePresetSchema = z.object({
  sizeLabel: z.string().min(1),
  maxVolume_uL: z.number().positive(),
  wellShape: TubeWellShape.optional(),
  hints: z.array(z.string()).min(1),
});

const TubeSizeRegistryFileSchema = z.object({
  kind: z.literal('tube-size-registry'),
  version: z.literal(1),
  description: z.string().optional(),
  tubes: z.array(TubeSizePresetSchema).min(1),
});

const REGISTRY_FILE = join(
  __dirname,
  '../../../schema/registry/tube-sizes/tube-size-presets.v1.yaml',
);

let cache: TubeSizePreset[] | null = null;

function load(): TubeSizePreset[] {
  let text: string;
  try {
    text = readFileSync(REGISTRY_FILE, 'utf8');
  } catch (err) {
    throw new Error(
      `[registry:tube-size-registry] cannot read ${REGISTRY_FILE}: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `[registry:tube-size-registry] YAML parse failed for ${REGISTRY_FILE}: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }

  const result = TubeSizeRegistryFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `[registry:tube-size-registry] schema validation failed for ${REGISTRY_FILE}: ${result.error.message}`,
    );
  }

  return result.data.tubes.map((tube) => ({
    sizeLabel: tube.sizeLabel,
    maxVolume_uL: tube.maxVolume_uL,
    ...(tube.wellShape ? { wellShape: tube.wellShape } : {}),
    hints: [...tube.hints],
  }));
}

/** All tube-size presets, cached after first load. Throws on bad registry data. */
export function loadTubeSizePresets(): TubeSizePreset[] {
  if (cache === null) {
    cache = load();
  }
  return cache;
}

/** Lowercase + strip all spaces. Nothing else. */
export function normalizeTubeHint(text: string): string {
  return text.toLowerCase().replace(/ /g, '');
}

/** Resolve a free-text/enum hint (e.g. '1.5ml', '1P5ml', '1.5 mL') to a preset. */
export function resolveTubeHint(hint: string): TubeSizePreset | undefined {
  const needle = normalizeTubeHint(hint);
  if (!needle) return undefined;
  return loadTubeSizePresets().find((preset) =>
    preset.hints.some((h) => normalizeTubeHint(h) === needle),
  );
}
