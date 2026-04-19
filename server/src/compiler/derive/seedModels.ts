/**
 * Seed model loader for derivation models.
 * 
 * Provides loadSeedModel() to read and structurally validate derivation-model
 * YAML files from the schema/knowledge/derivation-models directory.
 * 
 * Structural validation (per spec-009 DSL):
 *   - kind === 'derivation-model'
 *   - id matches /^DM-[A-Za-z0-9_-]+$/
 *   - Number.isInteger(version) && version >= 1
 *   - inputs is a non-empty array of {name, type}
 *   - output is a single {name, type} object (not an array)
 *   - steps is a non-empty array whose every entry has a string 'op' field
 */

import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import type { DerivationModel } from './DerivationEngine.js';

/**
 * Load and structurally validate a derivation model from a YAML file.
 * 
 * @param pathFromRepoRoot - Path to the YAML file relative to the repo root
 * @returns A typed DerivationModel
 * @throws Error with a specific reason if validation fails
 */
export function loadSeedModel(pathFromRepoRoot: string): DerivationModel {
  // Resolve the full path from the repo root
  const repoRoot = path.resolve(__dirname, '../../../..');
  const fullPath = path.resolve(repoRoot, pathFromRepoRoot);

  // Read and parse the YAML file
  let parsed: unknown;
  try {
    const fileContent = fs.readFileSync(fullPath, 'utf-8');
    parsed = parseYaml(fileContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid derivation model: failed to read/parse file: ${message}`);
  }

  // Validate the parsed structure
  return validateDerivationModel(parsed, pathFromRepoRoot);
}

/**
 * Validate that the parsed YAML is a valid DerivationModel.
 * 
 * @param parsed - The parsed YAML content
 * @param pathFromRepoRoot - Path for error messages
 * @returns A typed DerivationModel
 * @throws Error with a specific reason if validation fails
 */
function validateDerivationModel(parsed: unknown, pathFromRepoRoot: string): DerivationModel {
  // Check that parsed is an object
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} must be a YAML object`);
  }

  const obj = parsed as Record<string, unknown>;

  // Validate kind
  if (obj.kind !== 'derivation-model') {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} must have kind: 'derivation-model', got: ${String(obj.kind)}`);
  }

  // Validate id
  const id = obj.id;
  if (typeof id !== 'string') {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} must have a string id`);
  }
  const idPattern = /^DM-[A-Za-z0-9_-]+$/;
  if (!idPattern.test(id)) {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} id '${id}' does not match pattern ^DM-[A-Za-z0-9_-]+$`);
  }

  // Validate name
  if (typeof obj.name !== 'string') {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} must have a string name`);
  }

  // Validate version - must be an integer >= 1
  const version = obj.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} version must be an integer >= 1, got: ${String(version)}`);
  }

  // Validate inputs - must be a non-empty array of {name, type} objects
  const inputs = obj.inputs;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} inputs must be a non-empty array`);
  }
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (typeof input !== 'object' || input === null) {
      throw new Error(`invalid derivation model: ${pathFromRepoRoot} inputs[${i}] must be an object`);
    }
    const inputObj = input as Record<string, unknown>;
    if (typeof inputObj.name !== 'string') {
      throw new Error(`invalid derivation model: ${pathFromRepoRoot} inputs[${i}] must have a string name`);
    }
    if (typeof inputObj.type !== 'string') {
      throw new Error(`invalid derivation model: ${pathFromRepoRoot} inputs[${i}] must have a string type`);
    }
  }

  // Validate output - must be a single {name, type} object (not an array)
  const output = obj.output;
  if (output === undefined || typeof output !== 'object' || output === null) {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} must have a single output object`);
  }
  // Explicitly reject if output is an array
  if (Array.isArray(output)) {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} output must be a single object, not an array`);
  }
  const outputObj = output as Record<string, unknown>;
  if (typeof outputObj.name !== 'string') {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} output must have a string name`);
  }
  if (typeof outputObj.type !== 'string') {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} output must have a string type`);
  }

  // Validate steps - must be a non-empty array with each entry having a string 'op' field
  const steps = obj.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`invalid derivation model: ${pathFromRepoRoot} steps must be a non-empty array`);
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (typeof step !== 'object' || step === null) {
      throw new Error(`invalid derivation model: ${pathFromRepoRoot} steps[${i}] must be an object`);
    }
    const stepObj = step as Record<string, unknown>;
    if (typeof stepObj.op !== 'string') {
      throw new Error(`invalid derivation model: ${pathFromRepoRoot} steps[${i}] must have a string op field`);
    }
  }

  // Build the typed DerivationModel
  const derivationModel: DerivationModel = {
    kind: 'derivation-model',
    id,
    name: obj.name,
    version,
    inputs: inputs.map((input) => {
      const inputObj = input as Record<string, unknown>;
      const result: DerivationModel['inputs'][0] = {
        name: inputObj.name as string,
        type: inputObj.type as string,
      };
      if (typeof inputObj.required === 'boolean') {
        result.required = inputObj.required;
      }
      if (typeof inputObj.description === 'string') {
        result.description = inputObj.description;
      }
      return result;
    }),
    output: {
      name: outputObj.name as string,
      type: outputObj.type as string,
    },
    steps: steps.map((step) => step as DerivationModel['steps'][0]),
  };

  // Add optional fields if present
  if (typeof obj.description === 'string') {
    derivationModel.description = obj.description;
  }
  if (Array.isArray(obj.assumptions)) {
    derivationModel.assumptions = obj.assumptions.filter((a): a is string => typeof a === 'string');
  }

  return derivationModel;
}
