import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PanelConstraints = z.object({
  edgeExclusion: z.boolean().optional(),
  cellRegion: z
    .object({
      rows: z.string(),
      cols: z.string(),
    })
    .optional(),
});
const AnalysisRule = z.object({
  kind: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const AssaySpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  panelConstraints: PanelConstraints.default({}),
  channelMaps: z
    .record(z.string(), z.record(z.string(), z.string()))
    .optional(),
  analysisRules: z.array(AnalysisRule).optional(),
});
export type AssaySpec = z.infer<typeof AssaySpecSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/assay-panels');
let singleton: RegistryLoader<AssaySpec> | null = null;
export function getAssaySpecRegistry(): RegistryLoader<AssaySpec> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'assay-spec',
      directory: DIR,
      schema: AssaySpecSchema,
    });
  }
  return singleton;
}
