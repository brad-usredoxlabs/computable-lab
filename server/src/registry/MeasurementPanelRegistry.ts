import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const MeasurementPanelSchema = z.object({
  kind: z.literal('measurement-panel'),
  id: z.string().regex(/^MP-[A-Za-z0-9_-]+$/),
  name: z.string().min(1),
  readout_refs: z.array(z.string()).min(1),
  notes: z.string().optional(),
});
export type MeasurementPanel = z.infer<typeof MeasurementPanelSchema>;

const DIR = resolve(__dirname, '../../../schema/registry/measurement-panels');
let singleton: RegistryLoader<MeasurementPanel> | null = null;
export function getMeasurementPanelRegistry(): RegistryLoader<MeasurementPanel> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'measurement-panel',
      directory: DIR,
      schema: MeasurementPanelSchema,
    });
  }
  return singleton;
}
