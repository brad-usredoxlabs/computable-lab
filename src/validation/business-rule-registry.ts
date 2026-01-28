import { JSONSchema, BusinessRule, BusinessRuleRegistry, RuleContext, RuleValidationResult, RuleViolation } from './types';

/**
 * Business rule registry implementation
 */
export class BusinessRuleRegistryImpl implements BusinessRuleRegistry {
  private rules = new Map<string, BusinessRule>();

  /**
   * Register rule
   */
  register(rule: BusinessRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Unregister rule
   */
  unregister(id: string): void {
    this.rules.delete(id);
  }

  /**
   * Get rule
   */
  get(id: string): BusinessRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Get all rules
   */
  list(): BusinessRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Validate data against rules
   */
  async validate(data: any, context: RuleContext): Promise<RuleValidationResult> {
    const violations: RuleViolation[] = [];
    const warnings: RuleViolation[] = [];
    const info: RuleViolation[] = [];

    for (const rule of this.rules.values()) {
      try {
        const isValid = await rule.validate(data, context);
        
        if (!isValid) {
          const violation: RuleViolation = {
            ruleId: rule.id,
            description: rule.description,
            severity: rule.severity,
            message: rule.message || `Rule ${rule.id} failed`,
            path: [] // Would need to be populated based on rule logic
          };
          
          // Only add value if it's defined (section 7.2 compliance)
          const value = this.extractValue(data, []);
          if (value !== undefined) {
            violation.value = value;
          }
          
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
      } catch (error) {
        // Handle rule execution errors
        const violation: RuleViolation = {
          ruleId: rule.id,
          description: rule.description,
          severity: 'error',
          message: `Rule execution failed: ${error}`,
          path: []
        };
        
        // Only add value if it's defined (section 7.2 compliance)
        const value = this.extractValue(data, []);
        if (value !== undefined) {
          violation.value = value;
        }
        
        violations.push(violation);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      warnings,
      info
    };
  }

  /**
   * Get rules for specific schema
   */
  getRulesForSchema(schemaUri: string): BusinessRule[] {
    return this.list().filter(rule => {
      // Check if rule applies to this schema
      if (rule.dependsOn) {
        return rule.dependsOn.includes(schemaUri);
      }
      return true; // Rules without dependencies apply to all schemas
    });
  }

  /**
   * Extract value from data using path
   */
  private extractValue(data: any, path: string[]): any {
    let current = data;
    
    for (const part of path) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  }
}

/**
 * Factory function to create business rule registry
 */
export function createBusinessRuleRegistry(): BusinessRuleRegistryImpl {
  return new BusinessRuleRegistryImpl();
}