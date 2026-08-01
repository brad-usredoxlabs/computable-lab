/**
 * OperationRegistry — YAML-driven registry of canonical lab operations.
 *
 * Loads `schema/registry/operations.yaml`, validates with Zod, and exposes
 * a singleton with `lookup(verb)`, `listPrimitives()`, and `listAll()`.
 *
 * Each operation has a canonical id, optional primitive (leaf operations),
 * optional expands_to (compound operations decomposed into primitives),
 * and an alias list for verb normalization.
 */

import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const OntologyRefSchema = z.object({
  source: z.string(),
  id: z.string(),
});

export type OntologyRef = z.infer<typeof OntologyRefSchema>;

export const OperationSchema = z.object({
  id: z.string(),
  label: z.string(),
  primitive: z.string().nullable(),
  expands_to: z.array(z.string()).optional(),
  aliases: z.array(z.string()).default([]),
  ontology_refs: z.array(OntologyRefSchema).optional(),
  notes: z.string().optional(),
});

export type Operation = z.infer<typeof OperationSchema>;

export const OperationRegistrySchema = z.object({
  kind: z.literal('operation-registry'),
  version: z.string(),
  operations: z.array(OperationSchema),
});

export type OperationRegistryDoc = z.infer<typeof OperationRegistrySchema>;

// ---------------------------------------------------------------------------
// Singleton loader
// ---------------------------------------------------------------------------

const YAML_PATH = resolve(__dirname, '../../../schema/registry/operations.yaml');

let _instance: OperationRegistry | null = null;

/**
 * Parse and validate the operations YAML file.
 */
function loadOperationRegistryDoc(): OperationRegistryDoc {
  const raw = readFileSync(YAML_PATH, 'utf8');
  const parsed = parseYaml(raw) as unknown;
  return OperationRegistrySchema.parse(parsed);
}

/**
 * Return the singleton operation registry.
 */
export function getOperationRegistry(): OperationRegistry {
  if (!_instance) {
    const doc = loadOperationRegistryDoc();
    _instance = new OperationRegistry(doc.operations);
  }
  return _instance;
}

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

/**
 * In-memory registry of lab operations with alias-based lookup.
 */
export class OperationRegistry {
  private readonly operations: Operation[];
  private readonly aliasIndex: Map<string, Operation>;

  constructor(operations: Operation[]) {
    this.operations = operations;
    this.aliasIndex = new Map();

    for (const op of operations) {
      // Register canonical id as an alias pointing to itself
      this.aliasIndex.set(op.id.toLowerCase(), op);

      // Register all aliases
      for (const alias of op.aliases) {
        this.aliasIndex.set(alias.toLowerCase(), op);
      }
    }
  }

  /**
   * Look up an operation by verb or alias (case-insensitive).
   * Returns the operation if found, undefined otherwise.
   */
  lookup(verb: string): Operation | undefined {
    return this.aliasIndex.get(verb.toLowerCase());
  }

  /**
   * Return operations that have a non-null primitive (leaf operations).
   */
  listPrimitives(): Operation[] {
    return this.operations.filter((op) => op.primitive !== null);
  }

  /**
   * Return all operations.
   */
  listAll(): Operation[] {
    return this.operations;
  }

  /**
   * Return the number of total operations.
   */
  size(): number {
    return this.operations.length;
  }
}
