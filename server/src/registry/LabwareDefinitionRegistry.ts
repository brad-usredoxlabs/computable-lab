import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PlatformAlias = z.object({
  platform: z.enum(['opentrons_ot2', 'opentrons_flex', 'integra_assist_plus', 'generic']),
  alias: z.string(),
});

const Topology = z.object({
  addressing: z.enum(['grid', 'linear', 'single']),
  rows: z.number().int().positive().optional(),
  columns: z.number().int().positive().optional(),
  linear_count: z.number().int().positive().optional(),
  linear_axis: z.string().optional(),
  row_pitch_mm: z.number().optional(),
  col_pitch_mm: z.number().optional(),
  well_pitch_mm: z.number().optional(),
  orientation_default: z.enum(['landscape', 'portrait']).optional(),
  orientation_allowed: z.array(z.enum(['landscape', 'portrait'])).optional(),
});

export const LabwareDefinitionSchema = z.object({
  kind: z.literal('labware-definition'),
  recordId: z.string(),
  type: z.literal('labware_definition'),
  id: z.string(),
  display_name: z.string(),
  vendor: z.string().optional(),
  platform_aliases: z.array(PlatformAlias).optional(),
  read_only: z.boolean().optional(),
  source: z
    .object({
      kind: z.enum(['imported', 'curated', 'user']).optional(),
      url: z.string().optional(),
      hash: z.string().optional(),
      version: z.string().optional(),
    })
    .or(z.string())
    .optional(),
  topology: Topology,
  capacity: z.object({
    max_well_volume_uL: z.number(),
    min_working_volume_uL: z.number().optional(),
  }),
  aspiration_hints: z
    .object({
      single_well_multichannel_source: z.boolean().optional(),
      per_channel_source_expected: z.boolean().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  compatibility_tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type LabwareDefinitionRecord = z.infer<typeof LabwareDefinitionSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/labware-definitions');
let singleton: RegistryLoader<LabwareDefinitionRecord> | null = null;
export function getLabwareDefinitionRegistry(): RegistryLoader<LabwareDefinitionRecord> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'labware-definition',
      directory: DIR,
      schema: LabwareDefinitionSchema,
    });
  }
  return singleton;
}
