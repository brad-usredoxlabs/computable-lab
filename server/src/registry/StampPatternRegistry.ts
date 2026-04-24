import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const StampPatternSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  inputTopology: z.object({ rows: z.number().int().positive(), cols: z.number().int().positive() }),
  outputTopology: z.object({ rows: z.number().int().positive(), cols: z.number().int().positive() }),
  perPositionFields: z.array(z.string()).default([]),
});
export type StampPatternSpec = z.infer<typeof StampPatternSchema>;

const REGISTRY_DIR = resolve(__dirname, '../../../schema/registry/stamp-patterns');

let singleton: RegistryLoader<StampPatternSpec> | null = null;
export function getStampPatternRegistry(): RegistryLoader<StampPatternSpec> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'stamp-pattern',
      directory: REGISTRY_DIR,
      schema: StampPatternSchema,
    });
  }
  return singleton;
}
