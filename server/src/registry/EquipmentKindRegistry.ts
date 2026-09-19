import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SettingDefinition = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  valueType: z.enum(['number', 'string', 'boolean', 'enum', 'duration_sec', 'profile']).optional(),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  enum: z.array(z.string()).optional(),
});

/**
 * A GENERIC equipment kind — the home for the class-level facts a bare CURIE
 * cannot carry (settings keys, render hint, optional vendor dimensions).
 *
 * Why this exists (ruling, 2026-09-19): generic physical kinds are CURIEs in the
 * local `CL:` namespace (`CL:water_bath`, `CL:heat_block`) and `EQC-` records are
 * reserved for vendor models the lab can EVIDENCE — so a generic kind had nowhere
 * to declare `settingsDefinition` (the keys its instances' `settings` may set).
 * Registry definitions are the established home for exactly this kind of
 * class-level data (see schema/registry/labware-definitions, schema/registry/
 * instruments), so generic equipment kinds live here.
 *
 * Acceptance is NOT here: what a piece of equipment can take is capability data
 * (equipment-capability `constraints`, seat + accepts by physical class).
 */
export const EquipmentKindSchema = z.object({
  kind: z.literal('equipment-kind'),
  id: z.string().regex(/^CL:[a-z0-9_]+$/, 'generic equipment kinds are CL: CURIEs (snake_case)'),
  name: z.string().min(1),
  /** Display-only hint for the deck glyph (D1: render hints are not the vocabulary). */
  instrumentKind: z.string().optional(),
  settingsDefinition: z.array(SettingDefinition).default([]),
  physical_geometry: z.record(z.string(), z.unknown()).optional(),
  compatibility_tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type EquipmentKindDefinition = z.infer<typeof EquipmentKindSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/equipment-kinds');
let singleton: RegistryLoader<EquipmentKindDefinition> | null = null;

export function getEquipmentKindRegistry(): RegistryLoader<EquipmentKindDefinition> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'equipment-kind',
      directory: DIR,
      schema: EquipmentKindSchema,
    });
  }
  return singleton;
}
