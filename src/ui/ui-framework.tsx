import React from 'react';
import { JSONSchema } from '../types/common';
import { SchemaRegistry } from '../types/common';
import { ValidationResult } from '../types/common';

// UI Schema types for declarative UI specification
export interface UISchema {
  /** Schema identifier */
  $id: string;
  /** Schema title */
  title?: string;
  /** Schema description */
  description?: string;
  /** UI hints for properties */
  properties?: Record<string, UIPropertyHint>;
  /** Required properties (JSON Schema style) */
  required?: string[];
  /** Global UI configuration */
  uiConfig?: {
    /** Form layout */
    formLayout?: 'vertical' | 'horizontal' | 'grid';
    /** Submit button configuration */
    submitButton?: {
      text?: string;
      style?: 'primary' | 'secondary' | 'danger';
    };
    /** Cancel button configuration */
    cancelButton?: {
      text?: string;
      style?: 'secondary' | 'outline';
    };
  };
}

export interface UIPropertyHint {
  /** Widget type */
  widget?: 'input' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'date' | 'datetime' | 'number' | 'array' | 'object';
  /** Widget configuration */
  widgetConfig?: Record<string, any>;
  /** Display hints */
  display?: {
    /** Whether field is read-only */
    readOnly?: boolean;
    /** Whether field is hidden */
    hidden?: boolean;
    /** Help text */
    help?: string;
    /** Placeholder text */
    placeholder?: string;
    /** Default value (from schema or UI spec) */
    defaultValue?: any;
  };
  /** Layout hints */
  layout?: {
    /** CSS classes */
    className?: string;
    /** Grid layout */
    grid?: {
      columns?: number;
      rows?: number;
      gap?: string;
    };
  };
}

// UI Context interface
export interface UIContext {
  /** Operation type */
  operation: 'create' | 'read' | 'update' | 'delete';
  /** Current record data */
  data?: any;
  /** Validation results */
  validation?: ValidationResult;
}

// UI Action types
export interface UIAction {
  id: string;
  label: string;
  type: 'submit' | 'cancel' | 'delete' | 'edit' | 'create' | 'custom';
  config?: {
    confirm?: boolean;
    confirmMessage?: string;
    style?: 'primary' | 'secondary' | 'danger' | 'outline';
    icon?: string;
    disabled?: boolean;
    hidden?: boolean;
  };
  handler?: (data: any) => void | Promise<void>;
}

/**
 * UI Framework - Declarative UI generation based on schema hints
 * Complies with .clinerules: no hard-coded logic, delegates validation to Ajv
 */
export class UIFramework {
  private schemaRegistry: SchemaRegistry;

  constructor(schemaRegistry: SchemaRegistry) {
    this.schemaRegistry = schemaRegistry;
  }

  /**
   * Load UI schema for a given schema ID
   */
  async loadUISchema(schemaId: string): Promise<UISchema | null> {
    // In a real implementation, this would load from *.ui.yaml files
    // For now, create a basic UI schema from the JSON schema
    const schema = this.schemaRegistry.get(schemaId);
    if (!schema) {
      return null;
    }

    return this.createBasicUISchema(schema);
  }

  /**
   * Create basic UI schema from JSON schema
   */
  private createBasicUISchema(schema: JSONSchema): UISchema {
    const uiSchema: UISchema = {
      $id: schema.$id || 'ui-schema',
      title: schema.title,
      description: schema.description,
      required: schema.required,
      properties: {},
    };

    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, property]) => {
        uiSchema.properties![key] = this.createUIPropertyHint(property as JSONSchema);
      });
    }

    return uiSchema;
  }

  /**
   * Create UI property hint from JSON schema property
   */
  private createUIPropertyHint(property: JSONSchema): UIPropertyHint {
    const hint: UIPropertyHint = {};

    // Determine widget type based on JSON schema type
    switch (property.type) {
      case 'string':
        if (property.format === 'textarea') {
          hint.widget = 'textarea';
        } else if (property.format === 'date') {
          hint.widget = 'date';
        } else if (property.format === 'datetime') {
          hint.widget = 'datetime';
        } else {
          hint.widget = 'input';
        }
        break;
      case 'number':
        hint.widget = 'number';
        break;
      case 'boolean':
        hint.widget = 'checkbox';
        break;
      case 'array':
        hint.widget = 'array';
        break;
      case 'object':
        hint.widget = 'object';
        break;
      default:
        hint.widget = 'input';
    }

    // Copy display hints from schema if they exist
    if (property.default !== undefined) {
      hint.display = { defaultValue: property.default };
    }

    return hint;
  }

  /**
   * Generate React form components based on schema and UI hints
   */
  async generateForm(schemaId: string, _context: UIContext): Promise<React.ComponentType<any>> {
    const schema = this.schemaRegistry.get(schemaId);
    const uiSchema = await this.loadUISchema(schemaId);

    if (!schema || !uiSchema) {
      throw new Error(`Schema or UI schema not found: ${schemaId}`);
    }

    return function FormComponent(props: any) {
      const [formData, setFormData] = React.useState(props.data || {});
      const [errors] = React.useState<Record<string, string>>({});

      const handleChange = (name: string, value: any) => {
        const newData = { ...formData, [name]: value };
        setFormData(newData);
        props.onChange?.(newData);
      };

      const renderField = (name: string, property: JSONSchema, hint: UIPropertyHint) => {
        if (hint.display?.hidden) {
          return null;
        }

        const fieldProps = {
          name,
          value: formData[name] ?? hint.display?.defaultValue ?? '',
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
            let newValue: any = e.target.value;
            
            if (property.type === 'number') {
              newValue = parseFloat(newValue) || 0;
            } else if (property.type === 'boolean') {
              newValue = (e.target as HTMLInputElement).checked;
            }
            
            handleChange(name, newValue);
          },
          label: property.title || name,
          required: uiSchema.required?.includes(name) || false,
          readOnly: hint.display?.readOnly || false,
          help: hint.display?.help,
          placeholder: hint.display?.placeholder,
          error: errors[name],
          className: hint.layout?.className,
        };

        switch (hint.widget) {
          case 'input':
            return <input type="text" {...fieldProps} />;
          case 'textarea':
            return <textarea {...fieldProps} />;
          case 'number':
            return <input type="number" {...fieldProps} />;
          case 'date':
            return <input type="date" {...fieldProps} />;
          case 'datetime':
            return <input type="datetime-local" {...fieldProps} />;
          case 'checkbox':
            return (
              <div className="checkbox-field">
                <input
                  type="checkbox"
                  checked={fieldProps.value}
                  onChange={fieldProps.onChange}
                  name={name}
                />
                <label>{fieldProps.label}</label>
              </div>
            );
          case 'array':
            return (
              <div className="array-field">
                <label>{fieldProps.label}</label>
                {Array.isArray(fieldProps.value) && fieldProps.value.map((item: any, index: number) => (
                  <div key={index} className="array-item">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const newArray = [...(fieldProps.value as any[])];
                        newArray[index] = e.target.value;
                        handleChange(name, newArray);
                      }}
                    />
                    <button type="button" onClick={() => {
                      const newArray = [...(fieldProps.value as any[])];
                      newArray.splice(index, 1);
                      handleChange(name, newArray);
                    }}>
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => {
                  const newArray = [...(fieldProps.value as any[])];
                  newArray.push('');
                  handleChange(name, newArray);
                }}>
                  Add Item
                </button>
              </div>
            );
          case 'object':
            return (
              <div className="object-field">
                <label>{fieldProps.label}</label>
                <ObjectFieldEditor
                  schema={property}
                  value={fieldProps.value}
                  onChange={(value) => handleChange(name, value)}
                  error={fieldProps.error}
                />
              </div>
            );
          default:
            return <input type="text" {...fieldProps} />;
        }
      };

      return (
        <div className="form-container">
          {uiSchema.title && <h2>{uiSchema.title}</h2>}
          {uiSchema.description && <p>{uiSchema.description}</p>}
          
          <form onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit?.(formData);
          }}>
            {uiSchema.properties && Object.entries(uiSchema.properties).map(([name, hint]) => {
              const property = schema.properties![name] as JSONSchema;
              return (
                <div key={name} className="form-field">
                  {renderField(name, property, hint)}
                  {errors[name] && <div className="error">{errors[name]}</div>}
                </div>
              );
            })}
            
            <div className="form-actions">
              {uiSchema.uiConfig?.submitButton && (
                <button type="submit" className={`btn ${uiSchema.uiConfig.submitButton.style || 'primary'}`}>
                  {uiSchema.uiConfig.submitButton.text || 'Submit'}
                </button>
              )}
              {uiSchema.uiConfig?.cancelButton && (
                <button 
                  type="button" 
                  className={`btn ${uiSchema.uiConfig.cancelButton.style || 'secondary'}`}
                  onClick={props.onCancel}
                >
                  {uiSchema.uiConfig.cancelButton.text || 'Cancel'}
                </button>
              )}
            </div>
          </form>
        </div>
      );
    };
  }

  /**
   * Generate UI actions based on schema and context
   */
  generateActions(_schemaId: string, context: UIContext): UIAction[] {
    const actions: UIAction[] = [];

    // Add context-specific actions
    switch (context.operation) {
      case 'create':
        actions.push({
          id: 'save',
          label: 'Save',
          type: 'submit',
          config: { style: 'primary' }
        });
        actions.push({
          id: 'cancel',
          label: 'Cancel',
          type: 'cancel',
          config: { style: 'secondary' }
        });
        break;
      
      case 'read':
        actions.push({
          id: 'edit',
          label: 'Edit',
          type: 'edit',
          config: { style: 'primary' }
        });
        actions.push({
          id: 'delete',
          label: 'Delete',
          type: 'delete',
          config: { style: 'danger', confirm: true, confirmMessage: 'Are you sure you want to delete this record?' }
        });
        break;
      
      case 'update':
        actions.push({
          id: 'save',
          label: 'Save',
          type: 'submit',
          config: { style: 'primary' }
        });
        actions.push({
          id: 'cancel',
          label: 'Cancel',
          type: 'cancel',
          config: { style: 'secondary' }
        });
        break;
      
      case 'delete':
        actions.push({
          id: 'confirm',
          label: 'Confirm Delete',
          type: 'delete',
          config: { style: 'danger', confirm: true, confirmMessage: 'This action cannot be undone.' }
        });
        actions.push({
          id: 'cancel',
          label: 'Cancel',
          type: 'cancel',
          config: { style: 'secondary' }
        });
        break;
    }

    return actions;
  }

  /**
   * Validate data using Ajv (no custom validation logic)
   */
  async validateData(data: unknown, schemaId: string): Promise<ValidationResult> {
    const validator = this.schemaRegistry.getValidator(schemaId);
    if (!validator) {
      throw new Error(`No validator available for schema: ${schemaId}`);
    }

    const schema = this.schemaRegistry.get(schemaId);
    if (!schema) {
      throw new Error(`Schema not found: ${schemaId}`);
    }

    return validator.validate(data, schema);
  }
}

/**
 * Object field editor component
 */
function ObjectFieldEditor({ schema, value, onChange, error }: { schema: any; value: any; onChange: (value: any) => void; error: string | undefined }) {
  const [expanded, setExpanded] = React.useState(false);

  if (!schema.properties) {
    return <div>No properties defined</div>;
  }

  return (
    <div className="object-editor">
      <button type="button" onClick={() => setExpanded(!expanded)}>
        {expanded ? '▼' : '►'} {schema.title || 'Object'}
      </button>
      {expanded && (
        <div className="object-properties">
          {Object.entries(schema.properties).map(([key, property]: [string, any]) => (
            <div key={key} className="object-property">
              <label>{property.title || key}</label>
              <input
                type={property.type === 'number' ? 'number' : 'text'}
                value={value?.[key] || ''}
                onChange={(e) => {
                  const newValue = { ...value };
                  if (property.type === 'number') {
                    newValue[key] = parseFloat(e.target.value) || 0;
                  } else {
                    newValue[key] = e.target.value;
                  }
                  onChange(newValue);
                }}
              />
              {property.description && (
                <small className="description">{property.description}</small>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

/**
 * Factory function to create UI framework instance
 */
export function createUIFramework(schemaRegistry: SchemaRegistry): UIFramework {
  return new UIFramework(schemaRegistry);
}
