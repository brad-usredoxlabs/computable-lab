import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RefShape = z.object({
  kind: z.enum(['record', 'ontology']),
  id: z.string(),
  type: z.string().optional(),
  label: z.string().optional(),
  namespace: z.string().optional(),
  uri: z.string().optional(),
});

export const ReadoutDefinitionSchema = z.object({
  kind: z.literal('readout-definition'),
  id: z.string().regex(/^RDEF-[A-Za-z0-9_-]+$/),
  name: z.string().minLength(1),
  instrument_type: z.enum(['plate_reader', 'qpcr', 'gc_ms', 'lc_ms', 'microscopy', 'other']),
  mode: z.enum(['fluorescence', 'absorbance', 'luminescence', 'ct', 'peak_area', 'image_feature', 'other']),
  channel_label: z.string().optional(),
  excitation_nm: z.number().positive().optional(),
  emission_nm: z.number().positive().optional(),
  units: z.string().optional(),
  proxy_ref: RefShape.optional(),
  target_ref: RefShape.optional(),
  tags: z.array(z.string()).default([]),
});
export type ReadoutDefinition = z.infer<typeof ReadoutDefinitionSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/readout-definitions');
let singleton: RegistryLoader<ReadoutDefinition> | null = null;
export function getReadoutDefinitionRegistry(): RegistryLoader<ReadoutDefinition> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'readout-definition',
      directory: DIR,
      schema: ReadoutDefinitionSchema,
    });
  }
  return singleton;
}
