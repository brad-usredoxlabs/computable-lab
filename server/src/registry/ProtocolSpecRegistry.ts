import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PipetteRequirement = z.object({
  pipetteType: z.string(),
  minVolumeUl: z.number(),
  maxVolumeUl: z.number(),
});
const ReagentRequirement = z.object({
  kind: z.string(),
  totalVolumeUl: z.union([z.number(), z.string()]).optional(),
});
const Step = z.object({
  step: z.number().int().positive(),
  verb: z.string(),
  params: z.record(z.string(), z.any()),
});
const LayoutHint = z.object({
  role: z.string(),
  slotHint: z.string().optional(),
});

export const ProtocolSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(Step).min(1),
  requirements: z.object({
    pipettes: z.array(PipetteRequirement).optional(),
    reagents: z.array(ReagentRequirement).optional(),
    labware: z.array(z.string()).optional(),
  }).default({}),
  layoutHints: z.array(LayoutHint).optional(),
});
export type ProtocolSpec = z.infer<typeof ProtocolSpecSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/protocols');
let singleton: RegistryLoader<ProtocolSpec> | null = null;
export function getProtocolSpecRegistry(): RegistryLoader<ProtocolSpec> {
  if (!singleton) {
    singleton = createRegistryLoader({ kind: 'protocol-spec', directory: DIR, schema: ProtocolSpecSchema });
  }
  return singleton;
}
