import { LintRuleSpec, Predicate, LintValidationResult, LintViolation } from './types';
import { SchemaRegistry } from '../registry/schema-registry';

/**
 * Lint Engine - Declarative lint rule execution engine
 */
export class LintEngine {
  private rules = new Map<string, LintRuleSpec>();
  private schemaRegistry: SchemaRegistry;

  constructor(schemaRegistry: SchemaRegistry) {
    this.schemaRegistry = schemaRegistry;
  }

  /**
   * Register a lint rule
   */
  registerRule(rule: LintRuleSpec): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Unregister a lint rule
   */
  unregisterRule(id: string): void {
    this.rules.delete(id);
  }

  /**
   * Get a lint rule
   */
  getRule(id: string): LintRuleSpec | undefined {
    return this.rules.get(id);
  }

  /**
   * Get all registered rules
   */
  getAllRules(): LintRuleSpec[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules for a specific schema
   */
  getRulesForSchema(schemaId: string): LintRuleSpec[] {
    return this.getAllRules().filter(rule => {
      if (rule.scope === 'record' && rule.schemaId === schemaId) return true;
      if (rule.scope === 'collection' && rule.schemaId === schemaId) return true;
      return false;
    });
  }

  /**
   * Evaluate a predicate against data
   */
  evaluatePredicate(predicate: Predicate, data: any, context: any): boolean {
    switch (predicate.op) {
      case 'exists':
        return this.evaluateExists(predicate.path, data);
      
      case 'nonEmpty':
        return this.evaluateNonEmpty(predicate.path, data);
      
      case 'regex':
        return this.evaluateRegex(predicate.path, data, predicate.pattern);
      
      case 'equals':
        return this.evaluateEquals(predicate.path, data, predicate.value);
      
      case 'in':
        return this.evaluateIn(predicate.path, data, predicate.values);
      
      case 'all':
        return predicate.predicates.every((subPredicate: Predicate) => 
          this.evaluatePredicate(subPredicate, data, context)
        );
      
      case 'any':
        return predicate.predicates.some((subPredicate: Predicate) => 
          this.evaluatePredicate(subPredicate, data, context)
        );
      
      case 'not':
        return !this.evaluatePredicate(predicate.not, data, context);
      
      default:
        throw new Error(`Unknown predicate operator: ${predicate.op}`);
    }
  }

  /**
   * Evaluate exists predicate
   */
  private evaluateExists(path: string, data: any): boolean {
    const value = this.getNestedValue(path, data);
    return value !== undefined && value !== null;
  }

  /**
   * Evaluate non-empty predicate
   */
  private evaluateNonEmpty(path: string, data: any): boolean {
    const value = this.getNestedValue(path, data);
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  /**
   * Evaluate regex predicate
   */
  private evaluateRegex(path: string, data: any, pattern: string): boolean {
    const value = this.getNestedValue(path, data);
    if (typeof value !== 'string') return false;
    
    try {
      const regex = new RegExp(pattern);
      return regex.test(value);
    } catch {
      return false;
    }
  }

  /**
   * Evaluate equals predicate
   */
  private evaluateEquals(path: string, data: any, value: any): boolean {
    const dataValue = this.getNestedValue(path, data);
    return dataValue === value;
  }

  /**
   * Evaluate in predicate
   */
  private evaluateIn(path: string, data: any, values: any[]): boolean {
    const value = this.getNestedValue(path, data);
    return values.includes(value);
  }

  /**
   * Get nested value from object using JSONPath-like syntax
   */
  private getNestedValue(path: string, data: any): any {
    // Support minimal JSONPath: must start with $, then .properties or [indices]
    if (!path.startsWith('$')) {
      throw new Error(`Path must start with $: ${path}`);
    }

    // Remove the $ and split into parts
    const pathWithoutRoot = path.substring(1);
    if (pathWithoutRoot === '') {
      return data; // Root reference
    }

    const parts = pathWithoutRoot.split(/\.|\[(\d+)\]/).filter(Boolean);
    let current = data;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle array indices (part is already the index)
      const index = parseInt(part, 10);
      if (!isNaN(index) && Array.isArray(current)) {
        current = current[index];
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Validate data against a single rule
   */
  validateRule(rule: LintRuleSpec, data: any, context: any): LintValidationResult {
    const violations: LintViolation[] = [];
    const warnings: LintViolation[] = [];
    const info: LintViolation[] = [];
    
    // Check if rule applies (when condition)
    if (rule.when && !this.evaluatePredicate(rule.when, data, context)) {
      return {
        valid: true,
        violations: [],
        warnings: [],
        info: []
      };
    }
    
    // Evaluate the assertion
    const isValid = this.evaluatePredicate(rule.assert, data, context);
    
    if (!isValid) {
      const violation: LintViolation = {
        rule: rule.id,
        title: rule.title,
        severity: rule.severity,
        message: this.formatMessage(rule.message, data),
        schemaPath: rule.schemaId || '',
        dataPath: ''
      };
      
      // Only add value if it's defined (section 7.2 compliance)
      const value = this.getNestedValue('', data);
      if (value !== undefined) {
        violation.value = value;
      }
      
      // Only add data if paths are defined (section 7.2 compliance)
      if (rule.message.paths && rule.message.paths.length > 0) {
        violation.data = this.extractPaths(data, rule.message.paths);
      }
      
      // Route by severity
      switch (rule.severity) {
        case 'error':
          violations.push(violation);
          break;
        case 'warning':
          warnings.push(violation);
          break;
        case 'info':
          info.push(violation);
          break;
      }
    }
    
    return {
      valid: violations.length === 0 && warnings.length === 0 && info.length === 0,
      violations,
      warnings,
      info
    };
  }

  /**
   * Format message template
   */
  private formatMessage(message: { template: string; paths?: string[] }, data: any): string {
    let formatted = message.template;
    
    // Replace path placeholders directly
    if (message.paths) {
      message.paths.forEach(path => {
        const value = this.getNestedValue(path, data);
        formatted = formatted.replace(new RegExp(`{{${path}}}`, 'g'), String(value));
      });
    }
    
    return formatted;
  }

  /**
   * Extract values for specified paths
   */
  private extractPaths(data: any, paths: string[]): Record<string, any> {
    const result: Record<string, any> = {};
    
    paths.forEach(path => {
      result[path] = this.getNestedValue(path, data);
    });
    
    return result;
  }

  /**
   * Validate data against multiple rules
   */
  validateRules(rules: LintRuleSpec[], data: any, context: any): LintValidationResult {
    const results: LintValidationResult[] = [];
    
    for (const rule of rules) {
      const result = this.validateRule(rule, data, context);
      results.push(result);
    }
    
    return this.combineResults(results);
  }

  /**
   * Validate data against all rules for a schema
   */
  validateSchema(schemaId: string, data: any, context: any): LintValidationResult {
    const rules = this.getRulesForSchema(schemaId);
    return this.validateRules(rules, data, context);
  }

  /**
   * Combine multiple validation results
   */
  private combineResults(results: LintValidationResult[]): LintValidationResult {
    const violations: LintViolation[] = [];
    const warnings: LintViolation[] = [];
    const info: LintViolation[] = [];
    
    for (const result of results) {
      violations.push(...result.violations);
      warnings.push(...result.warnings);
      info.push(...result.info);
    }
    
    return {
      valid: violations.length === 0,
      violations,
      warnings,
      info
    };
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    totalRules: number;
    rulesBySchema: Record<string, number>;
    rulesBySeverity: Record<string, number>;
  } {
    const rulesBySchema: Record<string, number> = {};
    const rulesBySeverity: Record<string, number> = {};
    
    for (const rule of this.getAllRules()) {
      // Count by schema
      if (rule.schemaId) {
        rulesBySchema[rule.schemaId] = (rulesBySchema[rule.schemaId] || 0) + 1;
      }
      
      // Count by severity
      const severity = rule.severity;
      rulesBySeverity[severity] = (rulesBySeverity[severity] || 0) + 1;
    }
    
    return {
      totalRules: this.getAllRules().length,
      rulesBySchema,
      rulesBySeverity
    };
  }

  /**
   * Clear all registered rules
   */
  clear(): void {
    this.rules.clear();
  }
}

/**
 * Factory function to create lint engine
 */
export function createLintEngine(schemaRegistry: SchemaRegistry): LintEngine {
  return new LintEngine(schemaRegistry);
}

/**
 * Load lint specification from YAML file
 */
export async function loadLintSpec(filePath: string): Promise<LintRuleSpec[]> {
  try {
    const fs = await import('fs');
    const yaml = await import('js-yaml');
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const spec = yaml.load(content) as any;
    
    // Validate lint specification
    if (!spec.lintVersion || spec.lintVersion !== 1) {
      throw new Error(`Unsupported lint version: ${spec.lintVersion}`);
    }
    
    if (!spec.rules || !Array.isArray(spec.rules)) {
      throw new Error('Lint specification must contain a rules array');
    }
    
    return spec.rules;
  } catch (error) {
    throw new Error(`Failed to load lint spec from ${filePath}: ${error}`);
  }
}

/**
 * Load all lint specifications for a schema
 */
export async function loadLintSpecsForSchema(
  schemaId: string,
  schemaRegistry: SchemaRegistry
): Promise<LintRuleSpec[]> {
  const specs: LintRuleSpec[] = [];
  
  // This would scan for lint files associated with the schema
  // For now, we'll return an empty array
  // In a real implementation, this would look for files like:
  // - schema/{schemaId}.lint.yaml
  // - schema/{schemaId}/**/*.lint.yaml
  
  return specs;
}

/**
 * Load all lint specifications
 */
export async function loadAllLintSpecs(
  schemaRegistry: SchemaRegistry
): Promise<Record<string, LintRuleSpec[]>> {
  const specs: Record<string, LintRuleSpec[]> = {};
  
  // This would scan the entire schema directory for lint files
  // For now, we'll return an empty object
  // In a real implementation, this would recursively scan:
  // - schema/**/*.lint.yaml
  
  return specs;
}