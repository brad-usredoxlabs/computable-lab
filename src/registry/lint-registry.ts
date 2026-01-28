import { LintRuleSpec } from '../validation/types';
import { SchemaRegistry } from './schema-registry';

/**
 * Lint Rule Registry - Manages lint rule specifications
 */
export class LintRuleRegistry {
  private rules = new Map<string, LintRuleSpec>();
  private schemaRegistry: SchemaRegistry;

  constructor(schemaRegistry: SchemaRegistry) {
    this.schemaRegistry = schemaRegistry;
  }

  /**
   * Register a lint rule
   */
  register(rule: LintRuleSpec): void {
    // Validate rule against schema if available
    if (rule.schemaId) {
      const schema = this.schemaRegistry.get(rule.schemaId);
      if (!schema) {
        throw new Error(`Schema ${rule.schemaId} not found for rule ${rule.id}`);
      }
    }

    // Check for duplicate rule ID
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule ${rule.id} already registered`);
    }

    this.rules.set(rule.id, rule);
  }

  /**
   * Unregister a lint rule
   */
  unregister(id: string): void {
    this.rules.delete(id);
  }

  /**
   * Get a lint rule
   */
  get(id: string): LintRuleSpec | undefined {
    return this.rules.get(id);
  }

  /**
   * Get all registered rules
   */
  list(): LintRuleSpec[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules for a specific schema
   */
  getRulesForSchema(schemaId: string): LintRuleSpec[] {
    return this.list().filter(rule => {
      if (!rule.schemaId) return true;
      return rule.schemaId === schemaId;
    });
  }

  /**
   * Get rules by severity
   */
  getRulesBySeverity(severity: 'error' | 'warning' | 'info'): LintRuleSpec[] {
    return this.list().filter(rule => rule.severity === severity);
  }

  /**
   * Get rules by scope
   */
  getRulesByScope(scope: 'record' | 'collection' | 'repo'): LintRuleSpec[] {
    return this.list().filter(rule => rule.scope === scope);
  }

  /**
   * Check if a rule exists
   */
  has(id: string): boolean {
    return this.rules.has(id);
  }

  /**
   * Get rule statistics
   */
  getStats(): {
    totalRules: number;
    rulesBySchema: Record<string, number>;
    rulesBySeverity: Record<string, number>;
    rulesByScope: Record<string, number>;
  } {
    const rulesBySchema: Record<string, number> = {};
    const rulesBySeverity: Record<string, number> = {};
    const rulesByScope: Record<string, number> = {};

    for (const rule of this.list()) {
      // Count by schema
      if (rule.schemaId) {
        rulesBySchema[rule.schemaId] = (rulesBySchema[rule.schemaId] || 0) + 1;
      }

      // Count by severity
      const severity = rule.severity || 'error';
      rulesBySeverity[severity] = (rulesBySeverity[severity] || 0) + 1;

      // Count by scope
      const scope = rule.scope || 'record';
      rulesByScope[scope] = (rulesByScope[scope] || 0) + 1;
    }

    return {
      totalRules: this.list().length,
      rulesBySchema,
      rulesBySeverity,
      rulesByScope
    };
  }

  /**
   * Clear all registered rules
   */
  clear(): void {
    this.rules.clear();
  }

  /**
   * Validate rule against schema
   */
  validateRule(rule: LintRuleSpec): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required fields
    if (!rule.id) {
      errors.push('Rule ID is required');
    }

    if (!rule.title) {
      errors.push('Rule title is required');
    }

    if (!rule.assert) {
      errors.push('Rule assertion is required');
    }

    if (!rule.message) {
      errors.push('Rule message is required');
    }

    // Validate rule ID format
    if (rule.id && !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(rule.id)) {
      errors.push('Rule ID must contain only alphanumeric characters and hyphens');
    }

    // Validate message template
    if (rule.message && rule.message.paths) {
      for (const path of rule.message.paths) {
        try {
          // Validate path format
          const pathRegex = /^(\$\.|[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)$/;
          if (!pathRegex.test(path)) {
            errors.push(`Invalid path format: ${path}`);
          }
        } catch {
          errors.push(`Invalid path format: ${path}`);
        }
      }
    }

    // Validate dependencies
    if (rule.dependsOn) {
      for (const dep of rule.dependsOn) {
        if (!this.has(dep)) {
          errors.push(`Dependency rule ${dep} not found`);
        }
      }
    }

    // Validate schema reference
    if (rule.schemaId && !this.schemaRegistry.has(rule.schemaId)) {
      errors.push(`Schema ${rule.schemaId} not found`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate all registered rules
   */
  validateAll(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const rule of this.list()) {
      const validation = this.validateRule(rule);
      if (!validation.valid) {
        errors.push(`Rule ${rule.id}: ${validation.errors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get rule dependencies
   */
  getRuleDependencies(ruleId: string): string[] {
    const rule = this.get(ruleId);
    if (!rule || !rule.dependsOn) {
      return [];
    }

    const dependencies: string[] = [];
    const visited = new Set<string>();

    const collectDependencies = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);

      const depRule = this.get(id);
      if (depRule && depRule.dependsOn) {
        for (const dep of depRule.dependsOn) {
          collectDependencies(dep);
        }
      }

      dependencies.push(id);
    };

    for (const dep of rule.dependsOn) {
      collectDependencies(dep);
    }

    return dependencies;
  }

  /**
   * Check for circular dependencies
   */
  hasCircularDependencies(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (ruleId: string): boolean => {
      if (recursionStack.has(ruleId)) {
        return true; // Cycle detected
      }

      if (visited.has(ruleId)) {
        return false; // Already visited
      }

      visited.add(ruleId);
      recursionStack.add(ruleId);

      const rule = this.get(ruleId);
      if (rule && rule.dependsOn) {
        for (const dep of rule.dependsOn) {
          if (hasCycle(dep)) {
            return true;
          }
        }
      }

      recursionStack.delete(ruleId);
      return false;
    };

    for (const rule of this.list()) {
      if (hasCycle(rule.id)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get dependency graph
   */
  getDependencyGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};

    for (const rule of this.list()) {
      graph[rule.id] = rule.dependsOn || [];
    }

    return graph;
  }

  /**
   * Get execution order for rules (topological sort)
   */
  getExecutionOrder(): string[] {
    const graph = this.getDependencyGraph();
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (ruleId: string): void => {
      if (visited.has(ruleId)) {
        return;
      }

      visited.add(ruleId);

      // Visit dependencies first
      for (const dep of graph[ruleId] || []) {
        visit(dep);
      }

      result.push(ruleId);
    };

    for (const rule of this.list()) {
      visit(rule.id);
    }

    return result;
  }
}

/**
 * Factory function to create lint rule registry
 */
export function createLintRuleRegistry(schemaRegistry: SchemaRegistry): LintRuleRegistry {
  return new LintRuleRegistry(schemaRegistry);
}