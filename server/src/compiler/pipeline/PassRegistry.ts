/**
 * In-memory registry for compile-pipeline passes.
 *
 * Passes register themselves with the registry, which provides
 * lookup and listing capabilities for the pipeline runner.
 */

import type { Pass } from './types.js';

/**
 * Registry for pass implementations.
 *
 * Passes are registered by id and can be retrieved, listed,
 * or checked for existence. Registration throws on duplicate ids.
 */
export class PassRegistry {
  private passes = new Map<string, Pass>();

  /**
   * Register a pass with the registry.
   *
   * @param pass - The pass to register
   * @throws Error if a pass with the same id is already registered
   */
  register(pass: Pass): void {
    if (this.passes.has(pass.id)) {
      throw new Error(`Pass '${pass.id}' already registered`);
    }
    this.passes.set(pass.id, pass);
  }

  /**
   * Retrieve a pass by id.
   *
   * @param id - The pass id
   * @returns The pass if found, undefined otherwise
   */
  get(id: string): Pass | undefined {
    return this.passes.get(id);
  }

  /**
   * Check if a pass with the given id is registered.
   *
   * @param id - The pass id
   * @returns true if registered, false otherwise
   */
  has(id: string): boolean {
    return this.passes.has(id);
  }

  /**
   * List all registered passes.
   *
   * @returns Array of all registered passes
   */
  list(): Pass[] {
    return Array.from(this.passes.values());
  }
}
