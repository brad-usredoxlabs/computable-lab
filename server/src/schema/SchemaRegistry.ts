/**
 * SchemaRegistry — Central registry for all JSON Schemas.
 * 
 * This module handles:
 * - Indexing schemas by $id
 * - Building dependency graphs
 * - Resolving $ref references
 * - Detecting circular dependencies
 * 
 * CRITICAL: SchemaRegistry enforces identity + hashing + dependency graph.
 * It integrates with Ajv via addSchema/getSchema but MUST NOT implement
 * fake validation logic.
 */

import type { JSONSchema } from './json-schema.js';
import type { 
  SchemaEntry, 
  SchemaIndex, 
  SchemaDependencyGraph,
  SchemaDependencyNode,
  RefResolutionResult 
} from './types.js';

/**
 * Normalize a $ref URI by resolving relative paths against a base URI.
 */
function normalizeRef(ref: string, baseUri: string): string {
  // If ref is already absolute (has scheme), return as-is
  if (ref.includes('://')) {
    return ref;
  }
  
  // Handle fragment-only refs (#/...)
  if (ref.startsWith('#')) {
    const hashIndex = baseUri.indexOf('#');
    const base = hashIndex >= 0 ? baseUri.slice(0, hashIndex) : baseUri;
    return base + ref;
  }
  
  // Handle relative paths (./foo.yaml, ../bar.yaml)
  try {
    const base = new URL(baseUri);
    return new URL(ref, base).href;
  } catch {
    // If URL parsing fails, do simple path resolution
    const baseParts = baseUri.split('/');
    baseParts.pop(); // Remove filename
    
    const refParts = ref.split('/');
    for (const part of refParts) {
      if (part === '..') {
        baseParts.pop();
      } else if (part !== '.') {
        baseParts.push(part);
      }
    }
    
    return baseParts.join('/');
  }
}

/**
 * Check if a ref is a local fragment ref (#/...)
 */
function isLocalRef(ref: string): boolean {
  return ref.startsWith('#');
}

/**
 * SchemaRegistry - Manages loading, indexing, and dependency resolution of JSON Schemas.
 */
export class SchemaRegistry {
  private readonly schemas: SchemaIndex = new Map();
  private readonly dependencyGraph: SchemaDependencyGraph = new Map();
  private readonly pathToId: Map<string, string> = new Map();
  
  /**
   * Get a schema by its $id.
   */
  getById(id: string): SchemaEntry | undefined {
    return this.schemas.get(id);
  }
  
  /**
   * Get a schema by its file path.
   */
  getByPath(path: string): SchemaEntry | undefined {
    const id = this.pathToId.get(path);
    return id !== undefined ? this.schemas.get(id) : undefined;
  }
  
  /**
   * Get all registered schemas.
   */
  getAll(): SchemaEntry[] {
    return [...this.schemas.values()];
  }
  
  /**
   * Get all schema $ids.
   */
  getAllIds(): string[] {
    return [...this.schemas.keys()];
  }
  
  /**
   * Check if a schema is registered.
   */
  has(id: string): boolean {
    return this.schemas.has(id);
  }
  
  /**
   * Get the number of registered schemas.
   */
  get size(): number {
    return this.schemas.size;
  }
  
  /**
   * Add a schema entry to the registry.
   * This will also update the dependency graph.
   */
  addSchema(entry: SchemaEntry): void {
    // Store the schema
    this.schemas.set(entry.id, entry);
    this.pathToId.set(entry.path, entry.id);
    
    // Initialize dependency graph node
    const node: SchemaDependencyNode = {
      id: entry.id,
      dependsOn: new Set(),
      dependedBy: new Set(),
    };
    
    // Process dependencies (normalize relative refs)
    for (const ref of entry.dependencies) {
      // Skip local fragment refs
      if (isLocalRef(ref)) {
        continue;
      }
      
      const normalizedRef = normalizeRef(ref, entry.id);
      
      // Extract just the schema URI (remove fragment)
      const hashIndex = normalizedRef.indexOf('#');
      const schemaUri = hashIndex >= 0 
        ? normalizedRef.slice(0, hashIndex) 
        : normalizedRef;
      
      // Don't add self-reference
      if (schemaUri !== entry.id) {
        node.dependsOn.add(schemaUri);
      }
    }
    
    this.dependencyGraph.set(entry.id, node);
    
    // Update reverse dependencies
    for (const depId of node.dependsOn) {
      const depNode = this.dependencyGraph.get(depId);
      if (depNode !== undefined) {
        depNode.dependedBy.add(entry.id);
      }
    }
    
    // Also check if any existing schemas depend on this one
    for (const [otherId, otherNode] of this.dependencyGraph) {
      if (otherId !== entry.id && otherNode.dependsOn.has(entry.id)) {
        node.dependedBy.add(otherId);
      }
    }
  }
  
  /**
   * Add multiple schema entries.
   */
  addSchemas(entries: SchemaEntry[]): void {
    for (const entry of entries) {
      this.addSchema(entry);
    }
  }
  
  /**
   * Remove a schema from the registry.
   */
  removeSchema(id: string): boolean {
    const entry = this.schemas.get(id);
    if (entry === undefined) {
      return false;
    }
    
    // Remove from main index
    this.schemas.delete(id);
    this.pathToId.delete(entry.path);
    
    // Remove from dependency graph
    const node = this.dependencyGraph.get(id);
    if (node !== undefined) {
      // Remove reverse references
      for (const depId of node.dependsOn) {
        const depNode = this.dependencyGraph.get(depId);
        if (depNode !== undefined) {
          depNode.dependedBy.delete(id);
        }
      }
      
      // Note: we don't remove dependedBy references because
      // those schemas still reference this one (now unresolved)
      this.dependencyGraph.delete(id);
    }
    
    return true;
  }
  
  /**
   * Get the dependencies of a schema.
   */
  getDependencies(id: string): string[] {
    const node = this.dependencyGraph.get(id);
    return node !== undefined ? [...node.dependsOn] : [];
  }
  
  /**
   * Get the schemas that depend on a given schema.
   */
  getDependents(id: string): string[] {
    const node = this.dependencyGraph.get(id);
    return node !== undefined ? [...node.dependedBy] : [];
  }
  
  /**
   * Check reference resolution status.
   * Returns information about unresolved refs and cycles.
   */
  checkResolution(): RefResolutionResult {
    const unresolved: string[] = [];
    const cycles: string[][] = [];
    
    // Find unresolved references
    for (const [id, node] of this.dependencyGraph) {
      for (const depId of node.dependsOn) {
        if (!this.schemas.has(depId)) {
          unresolved.push(`${id} -> ${depId}`);
        }
      }
    }
    
    // Detect cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];
    
    const detectCycle = (id: string): boolean => {
      visited.add(id);
      recursionStack.add(id);
      path.push(id);
      
      const node = this.dependencyGraph.get(id);
      if (node !== undefined) {
        for (const depId of node.dependsOn) {
          if (!visited.has(depId)) {
            if (this.schemas.has(depId) && detectCycle(depId)) {
              return true;
            }
          } else if (recursionStack.has(depId)) {
            // Found a cycle
            const cycleStart = path.indexOf(depId);
            const cycle = path.slice(cycleStart);
            cycle.push(depId); // Close the cycle
            cycles.push(cycle);
            return true;
          }
        }
      }
      
      path.pop();
      recursionStack.delete(id);
      return false;
    };
    
    for (const id of this.schemas.keys()) {
      if (!visited.has(id)) {
        detectCycle(id);
      }
    }
    
    return {
      resolved: unresolved.length === 0,
      unresolved,
      cycles,
    };
  }
  
  /**
   * Get schemas in topological order (dependencies first).
   * Throws if there are cycles.
   */
  getTopologicalOrder(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();
    
    const visit = (id: string): void => {
      if (temp.has(id)) {
        throw new Error(`Circular dependency detected involving: ${id}`);
      }
      if (visited.has(id)) {
        return;
      }
      
      temp.add(id);
      
      const node = this.dependencyGraph.get(id);
      if (node !== undefined) {
        for (const depId of node.dependsOn) {
          // Only visit if the dependency is in our registry
          if (this.schemas.has(depId)) {
            visit(depId);
          }
        }
      }
      
      temp.delete(id);
      visited.add(id);
      result.push(id);
    };
    
    for (const id of this.schemas.keys()) {
      if (!visited.has(id)) {
        visit(id);
      }
    }
    
    return result;
  }
  
  /**
   * Get all schemas as a plain object map (for Ajv).
   */
  toSchemaMap(): Record<string, JSONSchema> {
    const map: Record<string, JSONSchema> = {};
    for (const [id, entry] of this.schemas) {
      map[id] = entry.schema;
    }
    return map;
  }
  
  /**
   * Clear all schemas from the registry.
   */
  clear(): void {
    this.schemas.clear();
    this.dependencyGraph.clear();
    this.pathToId.clear();
  }
}

/**
 * Create a new SchemaRegistry instance.
 */
export function createSchemaRegistry(): SchemaRegistry {
  return new SchemaRegistry();
}
