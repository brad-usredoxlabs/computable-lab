import { LintRuleSpec, LintConfig } from './types';
import { SchemaRegistry } from '../registry/schema-registry';
import { loadLintSpec } from './lint-engine';
import { createLintRuleRegistry } from '../registry/lint-registry';
import { createAjvValidator } from './ajv-validator';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';

/**
 * Lint Loader - Handles loading and validation of lint specifications
 */
export class LintLoader {
  private schemaRegistry: SchemaRegistry;
  private lintRuleRegistry: any; // Would be LintRuleRegistry type
  private validator: any; // Would be AjvValidator type

  constructor(schemaRegistry: SchemaRegistry) {
    this.schemaRegistry = schemaRegistry;
    this.lintRuleRegistry = createLintRuleRegistry(schemaRegistry);
    this.validator = createAjvValidator();
  }

  /**
   * Load lint specification from YAML file
   */
  async loadLintFile(filePath: string): Promise<LintRuleSpec[]> {
    try {
      const rules = await loadLintSpec(filePath);
      
      // Validate each rule against the schema
      for (const rule of rules) {
        const validation = this.lintRuleRegistry.validateRule(rule);
        if (!validation.valid) {
          throw new Error(`Invalid rule ${rule.id}: ${validation.errors.join(', ')}`);
        }
      }
      
      // Register rules
      rules.forEach(rule => {
        this.lintRuleRegistry.register(rule);
      });
      
      return rules;
    } catch (error) {
      throw new Error(`Failed to load lint file ${filePath}: ${error}`);
    }
  }

  /**
   * Load lint configuration from YAML file
   */
  async loadLintConfigFile(filePath: string): Promise<LintConfig> {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const config = load(content) as any;
      
      // Validate configuration against schema
      const schema = this.schemaRegistry.get('https://computable-lab.com/schemas/lint-config');
      if (!schema) {
        throw new Error('Lint configuration schema not found');
      }
      
      const validation = this.validator.validate(config, schema);
      if (!validation.valid) {
        throw new Error(`Invalid lint configuration: ${validation.errors.map(e => e.message).join(', ')}`);
      }
      
      return config;
    } catch (error) {
      throw new Error(`Failed to load lint config file ${filePath}: ${error}`);
    }
  }

  /**
   * Load all lint files from directory
   */
  async loadLintDirectory(dirPath: string): Promise<LintRuleSpec[]> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const files = fs.readdirSync(dirPath);
      const lintFiles = files.filter(file => 
        file.endsWith('.lint.yaml') || file.endsWith('.lint.yml')
      );
      
      const allRules: LintRuleSpec[] = [];
      
      for (const file of lintFiles) {
        const filePath = path.join(dirPath, file);
        const rules = await this.loadLintFile(filePath);
        allRules.push(...rules);
      }
      
      return allRules;
    } catch (error) {
      throw new Error(`Failed to load lint directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Load lint files for specific schema
   */
  async loadLintFilesForSchema(schemaId: string, basePath: string): Promise<LintRuleSpec[]> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Look for schema-specific lint files
      const schemaDir = path.join(basePath, schemaId);
      if (!fs.existsSync(schemaDir)) {
        return [];
      }
      
      const files = fs.readdirSync(schemaDir);
      const lintFiles = files.filter(file => 
        file.endsWith('.lint.yaml') || file.endsWith('.lint.yml')
      );
      
      const rules: LintRuleSpec[] = [];
      
      for (const file of lintFiles) {
        const filePath = path.join(schemaDir, file);
        const fileRules = await this.loadLintFile(filePath);
        rules.push(...fileRules);
      }
      
      return rules;
    } catch (error) {
      throw new Error(`Failed to load lint files for schema ${schemaId}: ${error}`);
    }
  }

  /**
   * Load all lint files for all schemas
   */
  async loadAllLintFiles(basePath: string): Promise<Record<string, LintRuleSpec[]>> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const allLintFiles = fs.readdirSync(basePath, { recursive: true });
      const lintFiles = allLintFiles.filter((file: string) => 
        typeof file === 'string' && 
        (file.endsWith('.lint.yaml') || file.endsWith('.lint.yml'))
      );
      
      const rulesBySchema: Record<string, LintRuleSpec[]> = {};
      
      for (const file of lintFiles) {
        if (typeof file !== 'string') continue;
        
        const filePath = path.join(basePath, file);
        const rules = await this.loadLintFile(filePath);
        
        // Group rules by schema (extract schema ID from file path if possible)
        const schemaMatch = file.match(/([^/]+)\.lint\.ya?ml$/);
        if (schemaMatch) {
          const schemaId = schemaMatch[1];
          if (!rulesBySchema[schemaId]) {
            rulesBySchema[schemaId] = [];
          }
          rulesBySchema[schemaId].push(...rules);
        } else {
          // Fallback to global rules
          if (!rulesBySchema['global']) {
            rulesBySchema['global'] = [];
          }
          rulesBySchema['global'].push(...rules);
        }
      }
      
      return rulesBySchema;
    } catch (error) {
      throw new Error(`Failed to load all lint files: ${error}`);
    }
  }

  /**
   * Validate lint specification against schema
   */
  validateLintSpec(spec: any): { valid: boolean; errors: string[] } {
    try {
      const schema = this.schemaRegistry.get('https://computable-lab.com/schemas/lint-v1');
      if (!schema) {
        return { valid: false, errors: ['Lint schema not found'] };
      }
      
      const validation = this.validator.validate(spec, schema);
      if (!validation.valid) {
        return { 
          valid: false, 
          errors: validation.errors.map(e => e.message) 
        };
      }
      
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [String(error)] };
    }
  }

  /**
   * Get loaded lint rules
   */
  getLoadedRules(): LintRuleSpec[] {
    return this.lintRuleRegistry.list();
  }

  /**
   * Get lint rule registry
   */
  getLintRuleRegistry(): any { // Would be LintRuleRegistry type
    return this.lintRuleRegistry;
  }

  /**
   * Clear all loaded rules
   */
  clear(): void {
    this.lintRuleRegistry.clear();
  }

  /**
   * Get loader statistics
   */
  getStats(): {
    totalFiles: number;
    totalRules: number;
    rulesBySchema: Record<string, number>;
    rulesBySeverity: Record<string, number>;
  } {
    const rules = this.getLoadedRules();
    const stats = this.lintRuleRegistry.getStats();
    
    return {
      totalFiles: 0, // Would track loaded files
      totalRules: stats.totalRules,
      rulesBySchema: stats.rulesBySchema,
      rulesBySeverity: stats.rulesBySeverity
    };
  }
}

/**
 * Factory function to create lint loader
 */
export function createLintLoader(schemaRegistry: SchemaRegistry): LintLoader {
  return new LintLoader(schemaRegistry);
}

/**
 * Load lint specification from file with validation
 */
export async function loadAndValidateLintFile(
  filePath: string, 
  schemaRegistry: SchemaRegistry
): Promise<{ rules: LintRuleSpec[]; validation: { valid: boolean; errors: string[] } }> {
  const loader = createLintLoader(schemaRegistry);
  const rules = await loader.loadLintFile(filePath);
  const validation = loader.validateLintSpec(rules);
  
  return { rules, validation };
}

/**
 * Load lint configuration from file with validation
 */
export async function loadAndValidateLintConfig(
  filePath: string, 
  schemaRegistry: SchemaRegistry
): Promise<{ config: LintConfig; validation: { valid: boolean; errors: string[] } }> {
  const loader = createLintLoader(schemaRegistry);
  const config = await loader.loadLintConfigFile(filePath);
  const validation = loader.validateLintSpec(config);
  
  return { config, validation };
}