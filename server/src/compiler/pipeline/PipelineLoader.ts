/**
 * PipelineLoader: load compile-pipeline YAMLs from disk and validate against schema.
 *
 * This module provides functions to load and validate pipeline YAML files
 * from the filesystem, returning typed PipelineSpec objects.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { PipelineSpec, PipelinePassSpec } from './PipelineRunner.js';
import type { PassFamily } from './types.js';

/**
 * Valid entrypoint types for compile pipelines.
 * Keep in sync with schema/registry/compile-pipelines/compile-pipeline.schema.yaml entrypoint enum. See spec-002-pipeline-schema-alignment.
 */
export const VALID_ENTRYPOINTS = [
  'protocol-compile',
  'local-protocol-compile',
  'run-plan-compile',
  'promotion-compile',
  'extraction-compile',
  'ingestion-compile',
  'chatbot-compile',
] as const;

type Entrypoint = (typeof VALID_ENTRYPOINTS)[number];

/**
 * Pattern for valid pipelineId and pass id values.
 * Pass ids may include underscores (e.g., parse_envelope, extractor_run).
 */
const ID_PATTERN = /^[a-z][a-z0-9_-]+$/;

/**
 * Error thrown when a pipeline fails to load.
 */
export class PipelineLoadError extends Error {
  constructor(
    public path: string,
    public reason: string,
    public details?: unknown,
  ) {
    super(`PipelineLoadError: ${path}: ${reason}`);
    this.name = 'PipelineLoadError';
  }
}

/**
 * Validate that a value is a non-empty string matching the ID pattern.
 */
function validateId(value: unknown, fieldName: string, pattern: RegExp = ID_PATTERN): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.trim() === '') {
    throw new Error(`${fieldName} must not be empty`);
  }
  if (!pattern.test(value)) {
    throw new Error(`${fieldName} "${value}" does not match pattern ${pattern.source}`);
  }
  return value;
}

/**
 * Validate a single pass specification.
 */
function validatePass(pass: unknown, index: number): PipelinePassSpec {
  if (typeof pass !== 'object' || pass === null) {
    throw new Error(`Pass at index ${index} must be an object`);
  }

  const passObj = pass as Record<string, unknown>;

  // Validate id
  const id = validateId(passObj.id, `Pass at index ${index} id`);

  // Validate family
  const family = passObj.family;
  if (typeof family !== 'string') {
    throw new Error(`Pass "${id}" family must be a string`);
  }
  const validFamilies: PassFamily[] = [
    'parse',
    'normalize',
    'disambiguate',
    'validate',
    'derive_context',
    'expand',
    'project',
  ];
  if (!validFamilies.includes(family as PassFamily)) {
    throw new Error(`Pass "${id}" family "${family}" is not valid. Must be one of: ${validFamilies.join(', ')}`);
  }

  // Validate optional depends_on
  let depends_on: string[] | undefined;
  if (passObj.depends_on !== undefined) {
    if (!Array.isArray(passObj.depends_on)) {
      throw new Error(`Pass "${id}" depends_on must be an array`);
    }
    depends_on = passObj.depends_on.map((dep: unknown, i: number) => {
      if (typeof dep !== 'string') {
        throw new Error(`Pass "${id}" depends_on[${i}] must be a string`);
      }
      return dep;
    });
  }

  // Validate optional when
  let when: string | undefined;
  if (passObj.when !== undefined && passObj.when !== null) {
    if (typeof passObj.when !== 'string') {
      throw new Error(`Pass "${id}" when must be a string`);
    }
    when = passObj.when;
  }

  // Validate optional description
  let description: string | undefined;
  if (passObj.description !== undefined && passObj.description !== null) {
    if (typeof passObj.description !== 'string') {
      throw new Error(`Pass "${id}" description must be a string`);
    }
    description = passObj.description;
  }

  const result: PipelinePassSpec = { id, family: family as PassFamily };
  if (depends_on !== undefined) result.depends_on = depends_on;
  if (when !== undefined) result.when = when;
  if (description !== undefined) result.description = description;

  return result;
}

/**
 * Validate a pipeline specification object.
 */
function validatePipelineSpec(raw: unknown): PipelineSpec {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Pipeline spec must be an object');
  }

  const spec = raw as Record<string, unknown>;

  // Validate pipelineId
  const pipelineId = validateId(spec.pipelineId, 'pipelineId');

  // Validate entrypoint
  const entrypoint = spec.entrypoint;
  if (typeof entrypoint !== 'string') {
    throw new Error('entrypoint must be a string');
  }
  if (!VALID_ENTRYPOINTS.includes(entrypoint as Entrypoint)) {
    throw new Error(
      `entrypoint "${entrypoint}" is not valid. Must be one of: ${VALID_ENTRYPOINTS.join(', ')}`,
    );
  }

  // Validate passes
  const passesRaw = spec.passes;
  if (!Array.isArray(passesRaw)) {
    throw new Error('passes must be an array');
  }
  if (passesRaw.length < 1) {
    throw new Error('passes must have at least one pass');
  }

  // Validate each pass and check for duplicate ids
  const passIds = new Set<string>();
  const passes: PipelinePassSpec[] = [];

  for (let i = 0; i < passesRaw.length; i++) {
    const validatedPass = validatePass(passesRaw[i], i);

    if (passIds.has(validatedPass.id)) {
      throw new Error(`Duplicate pass id "${validatedPass.id}"`);
    }
    passIds.add(validatedPass.id);

    passes.push(validatedPass);
  }

  return {
    pipelineId,
    entrypoint: entrypoint as Entrypoint,
    passes,
  };
}

/**
 * Load and validate a pipeline from a YAML file.
 *
 * @param path - Path to the YAML file
 * @returns A validated PipelineSpec
 * @throws PipelineLoadError if the file cannot be read, parsed, or validated
 */
export function loadPipeline(path: string): PipelineSpec {
  let content: string;
  let parsed: unknown;

  // Read file
  try {
    content = readFileSync(path, 'utf-8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PipelineLoadError(path, `failed to read file: ${reason}`);
  }

  // Parse YAML
  try {
    parsed = parseYaml(content);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PipelineLoadError(path, `yaml parse error: ${reason}`);
  }

  // Validate
  try {
    return validatePipelineSpec(parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PipelineLoadError(path, `validation error: ${reason}`);
  }
}

/**
 * Load all pipelines from a directory.
 *
 * @param dir - Path to the directory containing pipeline YAML files
 * @returns A Map keyed by pipelineId
 * @throws PipelineLoadError if a file cannot be loaded or if duplicate pipelineIds are found
 */
export function loadPipelinesFromDir(dir: string): Map<string, PipelineSpec> {
  let files: string[];

  try {
    files = readdirSync(dir);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PipelineLoadError(dir, `failed to read directory: ${reason}`);
  }

  const pipelines = new Map<string, PipelineSpec>();

  for (const file of files) {
    // Skip non-yaml files
    if (!file.endsWith('.yaml') && !file.endsWith('.yml')) {
      continue;
    }

    // Skip schema definition files
    if (file.includes('.schema.')) {
      continue;
    }

    const fullPath = `${dir}/${file}`;

    try {
      const spec = loadPipeline(fullPath);

      if (pipelines.has(spec.pipelineId)) {
        const existingFile = Array.from(pipelines.entries()).find(([_, s]) => s.pipelineId === spec.pipelineId)?.[0];
        throw new PipelineLoadError(
          fullPath,
          `duplicate pipelineId "${spec.pipelineId}" (also defined in ${existingFile})`,
        );
      }

      pipelines.set(spec.pipelineId, spec);
    } catch (error) {
      if (error instanceof PipelineLoadError) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new PipelineLoadError(fullPath, reason);
    }
  }

  return pipelines;
}
