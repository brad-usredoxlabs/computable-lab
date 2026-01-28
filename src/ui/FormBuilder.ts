/**
 * FormBuilder — Build form structure from schema + UI spec.
 * 
 * This generates a complete form definition that can be rendered
 * by any UI framework (React, Vue, etc.). NO framework-specific
 * code here - just data.
 */

import type {
  UISpec,
  FieldHint,
  FormConfig,
  FormSection,
  FormState,
  VisibilityCondition,
} from './types.js';
import { generateUISpecFromSchema } from './UISpecLoader.js';

/**
 * Complete form definition ready for rendering.
 */
export interface FormDefinition {
  /** Schema ID this form is for */
  schemaId: string;
  /** Form configuration */
  config: FormConfig;
  /** Flattened list of all fields with resolved paths */
  fields: ResolvedField[];
  /** Map of path -> field for quick lookup */
  fieldMap: Map<string, ResolvedField>;
}

/**
 * A field with resolved schema information.
 */
export interface ResolvedField {
  /** The field hint from UI spec */
  hint: FieldHint;
  /** The path (without $. prefix) */
  path: string;
  /** Resolved label */
  label: string;
  /** Whether field is required (from schema + hint) */
  required: boolean;
  /** Schema fragment for this field */
  schema?: SchemaFragment;
  /** Parent path (for nested fields) */
  parentPath?: string;
  /** Section index */
  sectionIndex: number;
}

/**
 * Schema information for a field.
 */
export interface SchemaFragment {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: SchemaFragment;
  properties?: Record<string, SchemaFragment>;
  required?: string[];
  description?: string;
  default?: unknown;
}

/**
 * FormBuilder — Builds form definitions from schema and UI spec.
 */
export class FormBuilder {
  /**
   * Build a form definition from UI spec and schema.
   * 
   * @param uiSpec - The UI specification
   * @param schema - The JSON Schema (optional for validation info)
   * @returns Form definition
   */
  build(uiSpec: UISpec, schema?: Record<string, unknown>): FormDefinition {
    const config = uiSpec.form || {
      sections: [{ fields: [] }],
    };
    
    const fields: ResolvedField[] = [];
    const fieldMap = new Map<string, ResolvedField>();
    
    // Process each section
    config.sections.forEach((section, sectionIndex) => {
      this.processSection(section, sectionIndex, schema, fields, fieldMap);
    });
    
    return {
      schemaId: uiSpec.schemaId,
      config,
      fields,
      fieldMap,
    };
  }
  
  /**
   * Build a form definition from schema alone (auto-generating UI spec).
   * 
   * @param schema - The JSON Schema
   * @param schemaId - The schema ID
   * @returns Form definition
   */
  buildFromSchema(schema: Record<string, unknown>, schemaId: string): FormDefinition {
    const uiSpec = generateUISpecFromSchema(schema, schemaId);
    return this.build(uiSpec, schema);
  }
  
  /**
   * Process a form section.
   */
  private processSection(
    section: FormSection,
    sectionIndex: number,
    schema: Record<string, unknown> | undefined,
    fields: ResolvedField[],
    fieldMap: Map<string, ResolvedField>
  ): void {
    for (const hint of section.fields) {
      const resolved = this.resolveField(hint, sectionIndex, schema);
      fields.push(resolved);
      fieldMap.set(resolved.path, resolved);
      
      // Process nested fields
      if (hint.widget === 'object' && hint.fields) {
        for (const nestedHint of hint.fields) {
          const nestedResolved = this.resolveField(nestedHint, sectionIndex, schema, resolved.path);
          fields.push(nestedResolved);
          fieldMap.set(nestedResolved.path, nestedResolved);
        }
      }
    }
  }
  
  /**
   * Resolve a field hint to a complete field definition.
   */
  private resolveField(
    hint: FieldHint,
    sectionIndex: number,
    schema: Record<string, unknown> | undefined,
    parentPath?: string
  ): ResolvedField {
    // Parse path (remove $. prefix)
    const path = hint.path.startsWith('$.') ? hint.path.slice(2) : hint.path;
    const fullPath = parentPath ? `${parentPath}.${path}` : path;
    
    // Get schema fragment for this path
    const schemaFragment = schema ? this.getSchemaFragment(schema, fullPath) : undefined;
    
    // Resolve label
    const label = hint.label || this.inferLabel(path);
    
    // Resolve required (hint overrides schema)
    let required = hint.required ?? false;
    if (!required && schemaFragment) {
      // Check if field is in parent's required array
      const parentSchema = parentPath 
        ? this.getSchemaFragment(schema!, parentPath)
        : schema;
      if (parentSchema?.required && Array.isArray(parentSchema.required)) {
        required = parentSchema.required.includes(path.split('.').pop()!);
      }
    }
    
    return {
      hint,
      path: fullPath,
      label,
      required,
      ...(schemaFragment ? { schema: schemaFragment as SchemaFragment } : {}),
      ...(parentPath ? { parentPath } : {}),
      sectionIndex,
    };
  }
  
  /**
   * Get schema fragment for a dotted path.
   */
  private getSchemaFragment(
    schema: Record<string, unknown>,
    path: string
  ): Record<string, unknown> | undefined {
    const parts = path.split('.');
    let current: Record<string, unknown> | undefined = schema;
    
    for (const part of parts) {
      if (!current) return undefined;
      
      // Check properties
      const properties = current.properties as Record<string, unknown> | undefined;
      if (properties && properties[part]) {
        current = properties[part] as Record<string, unknown>;
        continue;
      }
      
      // Check items (for arrays)
      if (current.items) {
        const items = current.items as Record<string, unknown>;
        const itemProps = items.properties as Record<string, unknown> | undefined;
        if (itemProps && itemProps[part]) {
          current = itemProps[part] as Record<string, unknown>;
          continue;
        }
      }
      
      return undefined;
    }
    
    return current;
  }
  
  /**
   * Infer a label from a path.
   */
  private inferLabel(path: string): string {
    const lastPart = path.split('.').pop() || path;
    return lastPart
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/^./, c => c.toUpperCase())
      .trim();
  }
}

/**
 * Evaluate a visibility condition.
 * 
 * @param condition - The visibility condition
 * @param values - Current form values
 * @returns true if the field should be visible
 */
export function evaluateVisibility(
  condition: VisibilityCondition | undefined,
  values: Record<string, unknown>
): boolean {
  if (!condition) {
    return true;
  }
  
  const { when, operator, value } = condition;
  
  // Get the controlling value
  const path = when.startsWith('$.') ? when.slice(2) : when;
  const controlValue = getValueAtPath(values, path);
  
  switch (operator) {
    case 'equals':
      return controlValue === value;
      
    case 'notEquals':
      return controlValue !== value;
      
    case 'in':
      if (Array.isArray(value)) {
        return value.includes(controlValue);
      }
      return false;
      
    case 'notIn':
      if (Array.isArray(value)) {
        return !value.includes(controlValue);
      }
      return true;
      
    case 'exists':
      return controlValue !== undefined && controlValue !== null;
      
    case 'notExists':
      return controlValue === undefined || controlValue === null;
      
    default:
      return true;
  }
}

/**
 * Get a value at a dotted path.
 */
export function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    if (typeof current !== 'object') {
      return undefined;
    }
    
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * Set a value at a dotted path.
 */
export function setValueAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const parts = path.split('.');
  if (parts.length === 0) return obj;
  
  const result = { ...obj };
  let current = result;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === undefined) continue;
    
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    } else {
      current[part] = { ...(current[part] as Record<string, unknown>) };
    }
    current = current[part] as Record<string, unknown>;
  }
  
  const lastPart = parts[parts.length - 1];
  if (lastPart !== undefined) {
    current[lastPart] = value;
  }
  
  return result;
}

/**
 * Create initial form state from a form definition.
 * 
 * @param definition - The form definition
 * @param initialValues - Initial values (e.g., from existing record)
 * @returns Initial form state
 */
export function createFormState(
  definition: FormDefinition,
  initialValues?: Record<string, unknown>
): FormState {
  const values: Record<string, unknown> = initialValues ? { ...initialValues } : {};
  
  // Apply defaults from hints/schema
  for (const field of definition.fields) {
    const currentValue = getValueAtPath(values, field.path);
    
    if (currentValue === undefined) {
      // Apply default from hint
      if (field.hint.defaultValue !== undefined) {
        setValueAtPath(values, field.path, field.hint.defaultValue);
      }
      // Or from schema
      else if (field.schema?.default !== undefined) {
        setValueAtPath(values, field.path, field.schema.default);
      }
    }
  }
  
  return {
    values,
    errors: new Map(),
    touched: new Set(),
    isSubmitting: false,
    isDirty: false,
  };
}

/**
 * Validate form values against required fields.
 * 
 * @param definition - The form definition
 * @param values - Current form values
 * @returns Map of path -> error messages
 */
export function validateRequired(
  definition: FormDefinition,
  values: Record<string, unknown>
): Map<string, string[]> {
  const errors = new Map<string, string[]>();
  
  for (const field of definition.fields) {
    if (!field.required) continue;
    
    // Check visibility
    if (field.hint.visible) {
      const visible = evaluateVisibility(field.hint.visible, values);
      if (!visible) continue; // Don't validate hidden fields
    }
    
    const value = getValueAtPath(values, field.path);
    
    if (isEmpty(value)) {
      errors.set(field.path, [`${field.label} is required`]);
    }
  }
  
  return errors;
}

/**
 * Check if a value is empty.
 */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * Create a new FormBuilder instance.
 */
export function createFormBuilder(): FormBuilder {
  return new FormBuilder();
}
