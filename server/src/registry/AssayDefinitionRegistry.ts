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

export const AssayDefinitionSchema = z.object({
  kind: z.literal('assay-definition'),
  id: z.string().regex(/^ASSAY-[A-Za-z0-9_-]+$/),
  name: z.string().minLength(1),
  assay_type: z.string().minLength(1),
  instrument_type: z.enum(['plate_reader', 'qpcr', 'gc_ms', 'lc_ms', 'microscopy', 'other']),
  readout_def_refs: z.array(RefShape).min(1),
  target_refs: z.array(RefShape).optional(),
  panel_targets: z.array(
    z.object({
      name: z.string(),
      target_ref: RefShape.optional(),
      readout_def_ref: RefShape,
      panel_role: z.enum(['target', 'housekeeping', 'positive_control', 'no_template_control', 'reference', 'other']),
    }),
  ).optional(),
  expected_role_types: z.array(z.string()).default([]),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type AssayDefinition = z.infer<typeof AssayDefinitionSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/assay-definitions');
let singleton: RegistryLoader<AssayDefinition> | null = null;
export function getAssayDefinitionRegistry(): RegistryLoader<AssayDefinition> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'assay-definition',
      directory: DIR,
      schema: AssayDefinitionSchema,
    });
  }
  return singleton;
}
