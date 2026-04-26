/**
 * OntologyTermRegistry — aggregate-file loader for ontology-term YAML files.
 *
 * Reads `{ source, terms[] }` documents from schema/registry/ontology-terms/
 * and provides a singleton accessor with `get`, `list`, `listBySource`, and
 * `reload` methods.
 */

import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAggregateRegistryLoader,
  type AggregateRegistryLoader,
} from './RegistryLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const OntologyTermSchema = z.object({
  kind: z.literal('ontology-term'),
  id: z.string(),
  source: z.enum([
    'chebi',
    'cell-ontology',
    'ncbi-taxon',
    'gene-ontology',
    'exact',
    'manual',
  ]),
  label: z.string(),
  definition: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
  parents: z.array(z.string()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export type OntologyTerm = z.infer<typeof OntologyTermSchema>;

// ---------------------------------------------------------------------------
// Singleton loader
// ---------------------------------------------------------------------------

const DIR = resolve(__dirname, '../../../schema/registry/ontology-terms');
let singleton: AggregateRegistryLoader<OntologyTerm> | null = null;

/**
 * Return the singleton ontology-term registry.
 */
export function getOntologyTermRegistry(): AggregateRegistryLoader<OntologyTerm> {
  if (!singleton) {
    singleton = createAggregateRegistryLoader({
      kind: 'ontology-term',
      directory: DIR,
      schema: OntologyTermSchema,
    });
  }
  return singleton;
}

/**
 * List terms filtered by source.
 */
export function listBySource(
  source: OntologyTerm['source'],
): OntologyTerm[] {
  return getOntologyTermRegistry().getBySource(source);
}
