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

export const InstrumentDefinitionSchema = z.object({
  kind: z.literal('instrument-definition'),
  id: z.string().regex(/^INSTDEF-[A-Za-z0-9_-]+$/),
  name: z.string().min(1),
  vendor: z.string().optional(),
  model: z.string().optional(),
  instrument_type: z.enum(['plate_reader', 'qpcr', 'gc_ms', 'lc_ms', 'microscopy', 'other']),
  supported_readout_def_refs: z.array(RefShape).default([]),
  tags: z.array(z.string()).default([]),
});
export type InstrumentDefinition = z.infer<typeof InstrumentDefinitionSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/instruments');
let singleton: RegistryLoader<InstrumentDefinition> | null = null;
export function getInstrumentRegistry(): RegistryLoader<InstrumentDefinition> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'instrument',
      directory: DIR,
      schema: InstrumentDefinitionSchema,
    });
  }
  return singleton;
}
