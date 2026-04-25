/**
 * CuratedVendorRegistry — YAML discovery + zod validation + in-memory cache.
 *
 * Discovers *.yaml / *.yml files in schema/registry/curated-vendors/,
 * validates each entry, and provides list/get accessors.
 */

import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistryLoader, type RegistryLoader } from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const CuratedVendorSchema = z.object({
  kind: z.literal('curated-vendor'),
  id: z.string(),
  display_name: z.string(),
  landing_url: z.string(),
  document_search_paths: z.array(z.string()).optional(),
  enabled: z.boolean(),
});

export type CuratedVendor = z.infer<typeof CuratedVendorSchema>;

// ---------------------------------------------------------------------------
// Singleton loader
// ---------------------------------------------------------------------------

const DIR = resolve(__dirname, '../../../schema/registry/curated-vendors');
let singleton: RegistryLoader<CuratedVendor> | null = null;

/**
 * Return the singleton curated-vendor registry.
 */
export function getCuratedVendorRegistry(): RegistryLoader<CuratedVendor> {
  if (!singleton) {
    singleton = createRegistryLoader({
      kind: 'curated-vendor',
      directory: DIR,
      schema: CuratedVendorSchema,
    });
  }
  return singleton;
}
