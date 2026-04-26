import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const Candidate = z.object({
  compoundId: z.string(),
  name: z.string(),
  notes: z.string().optional(),
});

export const CompoundClassSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  candidates: z.array(Candidate).min(1),
  chebi_ids: z.array(z.string().regex(/^CHEBI:\d+$/)).optional(),
});
export type CompoundClass = z.infer<typeof CompoundClassSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/compound-classes');
let singleton: RegistryLoader<CompoundClass> | null = null;
export function getCompoundClassRegistry(): RegistryLoader<CompoundClass> {
  if (!singleton) {
    singleton = createRegistryLoader({ kind: 'compound-class', directory: DIR, schema: CompoundClassSchema });
  }
  return singleton;
}
