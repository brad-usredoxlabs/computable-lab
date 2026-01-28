/**
 * LintEngine — Generic interpreter for lint rules.
 * 
 * CRITICAL (.clinerules):
 * - Business rules MUST live in *.lint.yaml, NOT in code
 * - This engine is a generic interpreter with NO schema-specific logic
 * - No "built-in rules" are allowed in TypeScript
 */

import type {
  LintSpec,
  LintRule,
  LintContext,
  LintEngineOptions,
  RuleEvaluationResult,
  LintResult,
  LintViolation,
} from './types.js';

import { evaluatePredicate } from './PredicateEvaluator.js';
import { interpolateTemplate } from './PathResolver.js';

/**
 * Default engine options.
 */
const DEFAULT_OPTIONS: Required<LintEngineOptions> = {
  stopOnFirstError: false,
  includeSkipped: false,
};

/**
 * LintEngine — Evaluates lint rules against records.
 */
export class LintEngine {
  private readonly specs: Map<string, LintSpec> = new Map();
  private readonly rulesById: Map<string, LintRule> = new Map();
  private readonly options: Required<LintEngineOptions>;
  
  /**
   * Create a new LintEngine.
   * 
   * @param options - Engine configuration options
   */
  constructor(options: LintEngineOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }
  
  /**
   * Add a lint specification to the engine.
   * 
   * @param name - Unique name for this spec (typically filename)
   * @param spec - The lint specification
   */
  addSpec(name: string, spec: LintSpec): void {
    this.specs.set(name, spec);
    
    // Index rules by ID
    for (const rule of spec.rules) {
      if (this.rulesById.has(rule.id)) {
        throw new Error(`Duplicate rule ID: ${rule.id}`);
      }
      this.rulesById.set(rule.id, rule);
    }
  }
  
  /**
   * Remove a lint specification.
   * 
   * @param name - Name of the spec to remove
   */
  removeSpec(name: string): boolean {
    const spec = this.specs.get(name);
    if (!spec) return false;
    
    // Remove rules from index
    for (const rule of spec.rules) {
      this.rulesById.delete(rule.id);
    }
    
    return this.specs.delete(name);
  }
  
  /**
   * Get all rules, optionally filtered by schema.
   * 
   * @param schemaId - Optional schema ID to filter by
   * @returns Array of matching rules
   */
  getRules(schemaId?: string): LintRule[] {
    const allRules = Array.from(this.rulesById.values());
    
    if (schemaId === undefined) {
      return allRules;
    }
    
    // Filter to rules that apply to this schema (or have no schemaId restriction)
    return allRules.filter(rule => 
      rule.schemaId === undefined || rule.schemaId === schemaId
    );
  }
  
  /**
   * Get a rule by ID.
   * 
   * @param ruleId - Rule ID
   * @returns The rule or undefined
   */
  getRule(ruleId: string): LintRule | undefined {
    return this.rulesById.get(ruleId);
  }
  
  /**
   * Evaluate a single rule against data.
   * 
   * @param rule - The rule to evaluate
   * @param ctx - Lint context with data
   * @returns Rule evaluation result
   */
  evaluateRule(rule: LintRule, ctx: LintContext): RuleEvaluationResult {
    // Check scope
    if (rule.scope !== 'record') {
      // For now, only record scope is supported
      return {
        ruleId: rule.id,
        passed: true,
        skipped: true,
      };
    }
    
    // Check 'when' condition if present
    if (rule.when !== undefined) {
      const whenResult = evaluatePredicate(rule.when, ctx.data);
      if (!whenResult.result) {
        // Condition not met, skip this rule
        return {
          ruleId: rule.id,
          passed: true,
          skipped: true,
        };
      }
    }
    
    // Evaluate the assertion
    const assertResult = evaluatePredicate(rule.assert, ctx.data);
    
    if (assertResult.result) {
      return {
        ruleId: rule.id,
        passed: true,
        skipped: false,
      };
    }
    
    // Assertion failed - create violation
    const message = interpolateTemplate(
      rule.message.template,
      ctx.data,
      rule.message.paths
    );
    
    const violation: LintViolation = {
      ruleId: rule.id,
      severity: rule.severity,
      message,
      ...(assertResult.path !== undefined ? { path: assertResult.path } : {}),
    };
    
    return {
      ruleId: rule.id,
      passed: false,
      skipped: false,
      violation,
    };
  }
  
  /**
   * Sort rules by dependencies (topological order).
   * Rules with no dependsOn come first, then rules that depend on them.
   * 
   * @param rules - Rules to sort
   * @returns Sorted rules
   */
  private sortByDependencies(rules: LintRule[]): LintRule[] {
    const sorted: LintRule[] = [];
    const pending = new Set(rules.map(r => r.id));
    const ruleMap = new Map(rules.map(r => [r.id, r]));
    
    // Keep iterating until all rules are sorted
    let lastSize = pending.size;
    while (pending.size > 0) {
      for (const ruleId of pending) {
        const rule = ruleMap.get(ruleId);
        if (!rule) continue;
        
        // Check if all dependencies are satisfied
        const deps = rule.dependsOn ?? [];
        const depsResolved = deps.every(dep => 
          !pending.has(dep) || !ruleMap.has(dep)
        );
        
        if (depsResolved) {
          sorted.push(rule);
          pending.delete(ruleId);
        }
      }
      
      // Detect cycles
      if (pending.size === lastSize) {
        throw new Error(`Circular dependency detected in rules: ${Array.from(pending).join(', ')}`);
      }
      lastSize = pending.size;
    }
    
    return sorted;
  }
  
  /**
   * Lint a record.
   * 
   * @param data - The record data to lint
   * @param schemaId - Optional schema ID to filter rules
   * @returns LintResult with violations and summary
   */
  lint(data: unknown, schemaId?: string): LintResult {
    const ctx: LintContext = {
      data,
      ...(schemaId !== undefined ? { schemaId } : {}),
    };
    const rules = this.getRules(schemaId);
    const sortedRules = this.sortByDependencies(rules);
    
    const violations: LintViolation[] = [];
    const passedRules: string[] = [];
    const skippedRules: string[] = [];
    const failedDeps = new Set<string>();
    
    for (const rule of sortedRules) {
      // Check if any dependencies failed
      const deps = rule.dependsOn ?? [];
      const depFailed = deps.some(dep => failedDeps.has(dep));
      
      if (depFailed) {
        skippedRules.push(rule.id);
        continue;
      }
      
      const result = this.evaluateRule(rule, ctx);
      
      if (result.skipped) {
        skippedRules.push(rule.id);
      } else if (result.passed) {
        passedRules.push(rule.id);
      } else {
        if (result.violation) {
          violations.push(result.violation);
        }
        failedDeps.add(rule.id);
        
        // Check stopOnFirstError
        if (this.options.stopOnFirstError) {
          break;
        }
      }
    }
    
    // Count by severity
    const errorCount = violations.filter(v => v.severity === 'error').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;
    const infoCount = violations.filter(v => v.severity === 'info').length;
    
    return {
      valid: errorCount === 0,
      violations,
      summary: {
        total: rules.length,
        passed: passedRules.length,
        failed: violations.length,
        skipped: skippedRules.length,
        errors: errorCount,
        warnings: warningCount,
        info: infoCount,
      },
    };
  }
  
  /**
   * Clear all specs and rules.
   */
  clear(): void {
    this.specs.clear();
    this.rulesById.clear();
  }
  
  /**
   * Get number of loaded specs.
   */
  get specCount(): number {
    return this.specs.size;
  }
  
  /**
   * Get number of loaded rules.
   */
  get ruleCount(): number {
    return this.rulesById.size;
  }
}

/**
 * Create a new LintEngine instance.
 */
export function createLintEngine(options?: LintEngineOptions): LintEngine {
  return new LintEngine(options);
}
