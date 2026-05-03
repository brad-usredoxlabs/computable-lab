import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ExecutionScaleLevel = z.enum([
  'manual_tubes',
  'bench_plate_multichannel',
  'robot_deck',
]);

const ExecutionScalePlatform = z.enum([
  'manual',
  'integra_assist',
  'opentrons_ot2',
  'opentrons_flex',
]);

const SampleLabwareKind = z.enum([
  'tube_rack',
  '96_well_plate',
  '384_well_plate',
]);

const ReagentSourceLabwareKind = z.enum([
  'tube',
  '2_well_reservoir',
  '8_well_reservoir',
  '12_well_reservoir',
]);

export const ExecutionScaleProfileSchema = z.object({
  kind: z.literal('execution-scale-profile'),
  recordId: z.string(),
  type: z.literal('execution_scale_profile'),
  id: z.string(),
  display_name: z.string(),
  sourceLevel: ExecutionScaleLevel,
  targetLevel: ExecutionScaleLevel,
  priority: z.number().int().nonnegative().default(100),
  matching: z.object({
    prompt_cues: z.array(z.string()),
    platforms: z.array(ExecutionScalePlatform).optional(),
  }),
  sampleLayout: z.object({
    labwareRole: z.string(),
    labwareKind: SampleLabwareKind,
    labwareDefinition: z.string().optional(),
    defaultWellOrder: z.enum(['column_major', 'row_major']).optional(),
  }),
  reagentSource: z.object({
    sourceLabwareRole: z.string(),
    sourceLabwareKind: ReagentSourceLabwareKind,
    labwareDefinition: z.string().optional(),
    defaultSourceWells: z.array(z.string()).optional(),
  }),
  pipetting: z.object({
    pipetteMode: z.enum(['single_channel', 'multi_channel_parallel']),
    channels: z.union([z.literal(1), z.literal(8), z.literal(12)]),
    laneStrategy: z.enum(['sequential_lanes', 'parallel_lanes']),
    channelization: z.enum(['single_channel', 'multi_channel_prefer', 'multi_channel_force']),
    batching: z.enum(['none', 'group_by_source', 'group_by_destination', 'multi_dispense_prefer']),
    maxVolumeUl: z.number().positive().optional(),
    requiredTools: z.array(z.string()).optional(),
  }),
  deckBinding: z.object({
    platform: ExecutionScalePlatform,
    requiredLabwareDefinitions: z.array(z.string()).optional(),
    requiredTools: z.array(z.string()).optional(),
  }).optional(),
  defaultBlockers: z.array(z.object({
    code: z.string(),
    message: z.string(),
    requiredInput: z.string().optional(),
  })).optional(),
  assumptions: z.array(z.string()),
  notes: z.string().optional(),
});

export type ExecutionScaleProfileRecord = z.infer<typeof ExecutionScaleProfileSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/execution-scale-profiles');
let singleton: RegistryLoader<ExecutionScaleProfileRecord> | null = null;

export function getExecutionScaleProfileRegistry(): RegistryLoader<ExecutionScaleProfileRecord> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'execution-scale-profile',
      directory: DIR,
      schema: ExecutionScaleProfileSchema,
    });
  }
  return singleton;
}
