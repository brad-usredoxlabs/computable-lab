/**
 * UISpecLoader — Load and validate UI specifications.
 * 
 * UI specs (*.ui.yaml) define how records should be displayed
 * and edited. This loader validates specs and provides them
 * for form generation.
 */

import yaml from 'yaml';
import type {
  UISpec,
  FieldHint,
  WidgetType,
  UISpecLoadResult,
} from './types.js';

/**
 * Valid widget types for validation.
 */
const VALID_WIDGET_TYPES: Set<WidgetType> = new Set([
  'text', 'textarea', 'number', 'select', 'multiselect',
  'checkbox', 'radio', 'date', 'datetime', 'ref', 'reflist',
  'array', 'object', 'hidden', 'readonly', 'custom',
]);

/**
 * Required fields in a UI spec.
 */
const REQUIRED_SPEC_FIELDS = ['uiVersion', 'schemaId'];

/**
 * UISpecLoader — Loads and validates UI specifications.
 */
export class UISpecLoader {
  private readonly cache: Map<string, UISpec> = new Map();
  
  /**
   * Load a UI spec from YAML content.
   * 
   * @param content - YAML string content
   * @param sourcePath - Optional source path for error messages
   * @returns Load result with spec or errors
   */
  load(content: string, sourcePath?: string): UISpecLoadResult {
    try {
      const data = yaml.parse(content);
      
      if (data === null || data === undefined) {
        return {
          success: false,
          error: 'Empty or null YAML content',
        };
      }
      
      if (typeof data !== 'object') {
        return {
          success: false,
          error: `Expected object, got ${typeof data}`,
        };
      }
      
      // Validate the spec
      const validationErrors = this.validateSpec(data, sourcePath);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: 'Validation failed',
          validationErrors,
        };
      }
      
      const spec = data as UISpec;
      
      // Cache by schemaId
      this.cache.set(spec.schemaId, spec);
      
      return {
        success: true,
        spec,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  
  /**
   * Get a cached UI spec by schema ID.
   * 
   * @param schemaId - The schema ID
   * @returns The cached spec or undefined
   */
  get(schemaId: string): UISpec | undefined {
    return this.cache.get(schemaId);
  }
  
  /**
   * Check if a spec is cached.
   * 
   * @param schemaId - The schema ID
   * @returns true if cached
   */
  has(schemaId: string): boolean {
    return this.cache.has(schemaId);
  }
  
  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Validate a UI spec structure.
   */
  private validateSpec(data: Record<string, unknown>, _sourcePath?: string): string[] {
    const errors: string[] = [];
    
    // Check required fields
    for (const field of REQUIRED_SPEC_FIELDS) {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate uiVersion
    if (data.uiVersion !== undefined && typeof data.uiVersion !== 'number') {
      errors.push('uiVersion must be a number');
    }
    
    // Validate schemaId
    if (data.schemaId !== undefined && typeof data.schemaId !== 'string') {
      errors.push('schemaId must be a string');
    }
    
    // Validate form config if present
    if (data.form !== undefined) {
      errors.push(...this.validateFormConfig(data.form, 'form'));
    }
    
    // Validate list config if present
    if (data.list !== undefined) {
      errors.push(...this.validateListConfig(data.list, 'list'));
    }
    
    // Validate detail config if present
    if (data.detail !== undefined) {
      errors.push(...this.validateDetailConfig(data.detail, 'detail'));
    }
    
    return errors;
  }
  
  /**
   * Validate form configuration.
   */
  private validateFormConfig(data: unknown, path: string): string[] {
    const errors: string[] = [];
    
    if (typeof data !== 'object' || data === null) {
      errors.push(`${path}: must be an object`);
      return errors;
    }
    
    const form = data as Record<string, unknown>;
    
    // Validate sections
    if (form.sections !== undefined) {
      if (!Array.isArray(form.sections)) {
        errors.push(`${path}.sections: must be an array`);
      } else {
        form.sections.forEach((section, i) => {
          errors.push(...this.validateFormSection(section, `${path}.sections[${i}]`));
        });
      }
    }
    
    // Validate layout
    if (form.layout !== undefined) {
      if (!['vertical', 'horizontal', 'grid'].includes(form.layout as string)) {
        errors.push(`${path}.layout: must be 'vertical', 'horizontal', or 'grid'`);
      }
    }
    
    return errors;
  }
  
  /**
   * Validate a form section.
   */
  private validateFormSection(data: unknown, path: string): string[] {
    const errors: string[] = [];
    
    if (typeof data !== 'object' || data === null) {
      errors.push(`${path}: must be an object`);
      return errors;
    }
    
    const section = data as Record<string, unknown>;
    
    // Fields are required
    if (!section.fields) {
      errors.push(`${path}: missing required 'fields' array`);
    } else if (!Array.isArray(section.fields)) {
      errors.push(`${path}.fields: must be an array`);
    } else {
      section.fields.forEach((field, i) => {
        errors.push(...this.validateFieldHint(field, `${path}.fields[${i}]`));
      });
    }
    
    return errors;
  }
  
  /**
   * Validate a field hint.
   */
  private validateFieldHint(data: unknown, path: string): string[] {
    const errors: string[] = [];
    
    if (typeof data !== 'object' || data === null) {
      errors.push(`${path}: must be an object`);
      return errors;
    }
    
    const field = data as Record<string, unknown>;
    
    // Path is required
    if (!field.path) {
      errors.push(`${path}: missing required 'path'`);
    } else if (typeof field.path !== 'string') {
      errors.push(`${path}.path: must be a string`);
    }
    
    // Widget is required
    if (!field.widget) {
      errors.push(`${path}: missing required 'widget'`);
    } else if (typeof field.widget !== 'string') {
      errors.push(`${path}.widget: must be a string`);
    } else if (!VALID_WIDGET_TYPES.has(field.widget as WidgetType)) {
      errors.push(`${path}.widget: invalid widget type '${field.widget}'`);
    }
    
    // Validate nested fields for object widget
    if (field.widget === 'object' && field.fields) {
      if (!Array.isArray(field.fields)) {
        errors.push(`${path}.fields: must be an array`);
      } else {
        (field.fields as unknown[]).forEach((nested, i) => {
          errors.push(...this.validateFieldHint(nested, `${path}.fields[${i}]`));
        });
      }
    }
    
    // Validate items for array widget
    if (field.widget === 'array' && field.items) {
      errors.push(...this.validateFieldHint(field.items, `${path}.items`));
    }
    
    // Validate options for select/radio/multiselect
    if (['select', 'radio', 'multiselect'].includes(field.widget as string)) {
      if (field.options && !Array.isArray(field.options)) {
        errors.push(`${path}.options: must be an array`);
      }
    }
    
    // Validate refKind for ref widgets
    if (['ref', 'reflist'].includes(field.widget as string)) {
      if (!field.refKind || typeof field.refKind !== 'string') {
        errors.push(`${path}.refKind: required for ref/reflist widgets`);
      }
    }
    
    return errors;
  }
  
  /**
   * Validate list configuration.
   */
  private validateListConfig(data: unknown, path: string): string[] {
    const errors: string[] = [];
    
    if (typeof data !== 'object' || data === null) {
      errors.push(`${path}: must be an object`);
      return errors;
    }
    
    const list = data as Record<string, unknown>;
    
    // Columns are required
    if (!list.columns) {
      errors.push(`${path}: missing required 'columns' array`);
    } else if (!Array.isArray(list.columns)) {
      errors.push(`${path}.columns: must be an array`);
    } else {
      list.columns.forEach((col, i) => {
        if (typeof col !== 'object' || col === null) {
          errors.push(`${path}.columns[${i}]: must be an object`);
        } else {
          const column = col as Record<string, unknown>;
          if (!column.path) {
            errors.push(`${path}.columns[${i}]: missing required 'path'`);
          }
          if (!column.label) {
            errors.push(`${path}.columns[${i}]: missing required 'label'`);
          }
        }
      });
    }
    
    return errors;
  }
  
  /**
   * Validate detail configuration.
   */
  private validateDetailConfig(data: unknown, path: string): string[] {
    const errors: string[] = [];
    
    if (typeof data !== 'object' || data === null) {
      errors.push(`${path}: must be an object`);
      return errors;
    }
    
    const detail = data as Record<string, unknown>;
    
    // Sections are required
    if (!detail.sections) {
      errors.push(`${path}: missing required 'sections' array`);
    } else if (!Array.isArray(detail.sections)) {
      errors.push(`${path}.sections: must be an array`);
    }
    
    return errors;
  }
}

/**
 * Generate a minimal UI spec from a JSON Schema.
 * 
 * This auto-generates a UI spec when no *.ui.yaml exists.
 * It infers widget types from schema properties.
 */
export function generateUISpecFromSchema(
  schema: Record<string, unknown>,
  schemaId: string
): UISpec {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = (schema.required as string[]) || [];
  
  const fields: FieldHint[] = [];
  
  if (properties) {
    for (const [name, propDef] of Object.entries(properties)) {
      // Skip internal fields
      if (name.startsWith('$') || name.startsWith('@')) {
        continue;
      }
      
      // Skip common envelope fields
      if (['recordId', 'id', 'kind', 'createdAt', 'updatedAt'].includes(name)) {
        continue;
      }
      
      const field = inferFieldHint(name, propDef, required.includes(name));
      if (field) {
        fields.push(field);
      }
    }
  }
  
  // Sort fields: required first, then alphabetically
  fields.sort((a, b) => {
    if (a.required && !b.required) return -1;
    if (!a.required && b.required) return 1;
    return (a.path || '').localeCompare(b.path || '');
  });
  
  return {
    uiVersion: 1,
    schemaId,
    form: {
      sections: [
        {
          title: 'Details',
          fields,
        },
      ],
    },
  };
}

/**
 * Infer a FieldHint from a schema property definition.
 */
function inferFieldHint(
  name: string,
  propDef: unknown,
  isRequired: boolean
): FieldHint | null {
  if (typeof propDef !== 'object' || propDef === null) {
    return null;
  }
  
  const def = propDef as Record<string, unknown>;
  
  // Start with basic hint
  const hint: FieldHint = {
    path: `$.${name}`,
    widget: 'text',
    label: toLabel(name),
    ...(isRequired ? { required: true } : {}),
  };
  
  // Add description as help text
  if (def.description && typeof def.description === 'string') {
    hint.help = def.description;
  }
  
  // Infer widget from type and format
  const type = def.type as string | string[] | undefined;
  const format = def.format as string | undefined;
  const enumValues = def.enum as unknown[] | undefined;
  
  // Handle enum
  if (enumValues && Array.isArray(enumValues)) {
    hint.widget = 'select';
    hint.options = enumValues.map(v => ({
      value: v as string | number | boolean,
      label: toLabel(String(v)),
    }));
    return hint;
  }
  
  // Handle by type
  const primaryType = Array.isArray(type) ? type[0] : type;
  
  switch (primaryType) {
    case 'string':
      if (format === 'date-time') {
        hint.widget = 'datetime';
      } else if (format === 'date') {
        hint.widget = 'date';
      } else if (def.maxLength && (def.maxLength as number) > 200) {
        hint.widget = 'textarea';
      } else if (name.endsWith('Id') && name !== 'recordId') {
        // Reference field
        hint.widget = 'ref';
        hint.refKind = inferRefKind(name);
      } else {
        hint.widget = 'text';
      }
      break;
      
    case 'number':
    case 'integer':
      hint.widget = 'number';
      break;
      
    case 'boolean':
      hint.widget = 'checkbox';
      break;
      
    case 'array':
      const items = def.items as Record<string, unknown> | undefined;
      if (items) {
        // Check if it's an array of refs
        if (name.endsWith('Ids')) {
          hint.widget = 'reflist';
          hint.refKind = inferRefKind(name);
        } else {
          hint.widget = 'array';
          const itemHint = inferFieldHint('item', items, false);
          if (itemHint) {
            hint.items = itemHint;
          }
        }
      }
      break;
      
    case 'object':
      hint.widget = 'object';
      // Could infer nested fields here
      break;
  }
  
  return hint;
}

/**
 * Convert a property name to a display label.
 */
function toLabel(name: string): string {
  return name
    // Insert space before capitals
    .replace(/([A-Z])/g, ' $1')
    // Replace underscores/hyphens with spaces
    .replace(/[_-]/g, ' ')
    // Capitalize first letter
    .replace(/^./, c => c.toUpperCase())
    // Trim extra whitespace
    .trim();
}

/**
 * Infer the reference kind from a field name.
 */
function inferRefKind(name: string): string {
  // studyId -> study, claimIds -> claim
  return name
    .replace(/Ids?$/, '')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Create a new UISpecLoader instance.
 */
export function createUISpecLoader(): UISpecLoader {
  return new UISpecLoader();
}
