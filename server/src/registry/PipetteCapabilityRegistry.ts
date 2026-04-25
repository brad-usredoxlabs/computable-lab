import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PipetteCapabilitySchema = z.object({
  kind: z.literal('pipette-capability'),
  recordId: z.string(),
  type: z.literal('pipette_capability'),
  id: z.string(),
  display_name: z.string(),
  tool_type: z.literal('pipette'),
  channels_supported: z.array(z.number()),
  spacing_mode: z.enum(['fixed', 'adjustable', 'mixed']).optional(),
  fixed_spacing_mm: z.number().optional(),
  volume_families: z.array(
    z.object({
      name: z.string(),
      volume_min_uL: z.number(),
      volume_max_uL: z.number(),
      feasibility_floor_uL: z.number().optional(),
      spacing_min_mm: z.number().optional(),
      spacing_max_mm: z.number().optional(),
    }),
  ),
  platform: z
    .enum(['opentrons_ot2', 'opentrons_flex', 'integra_assist_plus', 'generic'])
    .optional(),
  notes: z.string().optional(),
});

export type PipetteCapabilityRecord = z.infer<typeof PipetteCapabilitySchema>;

const DIR = resolve(__dirname, '../../../schema/registry/pipette-capabilities');
let singleton: RegistryLoader<PipetteCapabilityRecord> | undefined;

export function getPipetteCapabilityRegistry(): RegistryLoader<PipetteCapabilityRecord> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'pipette-capability',
      directory: DIR,
      schema: PipetteCapabilitySchema,
    });
  }
  return singleton;
}
