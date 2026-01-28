/**
 * RecordEditController — Controller for record edit/create views.
 * 
 * This controller manages state and logic for editing or creating records.
 * It's framework-agnostic — just pure data/logic.
 */

import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { RecordStore } from '../../store/types.js';
import type { ValidationResult } from '../../validation/types.js';
import type { LintResult } from '../../lint/types.js';
import type { UISpec } from '../types.js';
import type {
  EditViewState,
  ActionResult,
} from './types.js';
import {
  FormBuilder,
  createFormState,
  validateRequired,
  getValueAtPath,
  setValueAtPath,
} from '../FormBuilder.js';
import { generateUISpecFromSchema } from '../UISpecLoader.js';

/**
 * Configuration for RecordEditController.
 */
export interface EditControllerConfig {
  /** Store for CRUD operations */
  store: RecordStore;
  /** Schema for the record kind */
  schema: Record<string, unknown>;
  /** Schema ID */
  schemaId: string;
  /** Record kind */
  kind: string;
  /** UI spec (optional - will auto-generate if not provided) */
  uiSpec?: UISpec;
  /** Record ID generator function */
  generateRecordId?: () => string;
}

/**
 * RecordEditController — Manages edit view state and operations.
 */
export class RecordEditController {
  private config: EditControllerConfig;
  private state: EditViewState;
  private stateListeners: Array<(state: EditViewState) => void> = [];
  private formBuilder: FormBuilder;
  
  constructor(config: EditControllerConfig) {
    this.config = config;
    this.formBuilder = new FormBuilder();
    this.state = this.createInitialState();
  }
  
  /**
   * Create initial state for a new record.
   */
  private createInitialState(): EditViewState {
    const uiSpec = this.config.uiSpec || 
                   generateUISpecFromSchema(this.config.schema, this.config.schemaId);
    
    const formDefinition = this.formBuilder.build(uiSpec, this.config.schema);
    const formState = createFormState(formDefinition);
    
    // Add default values for kind and $schema
    formState.values = {
      ...formState.values,
      kind: this.config.kind,
      $schema: this.config.schemaId,
    };
    
    return {
      mode: 'create',
      kind: this.config.kind,
      schemaId: this.config.schemaId,
      formDefinition,
      formState,
      isSaving: false,
    };
  }
  
  /**
   * Get current state.
   */
  getState(): EditViewState {
    return this.state;
  }
  
  /**
   * Subscribe to state changes.
   */
  subscribe(listener: (state: EditViewState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== listener);
    };
  }
  
  /**
   * Update state and notify listeners.
   */
  private setState(partial: Partial<EditViewState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }
  
  /**
   * Load an existing record for editing.
   */
  async loadForEdit(recordId: string): Promise<boolean> {
    try {
      const envelope = await this.config.store.get(recordId);
      
      if (!envelope) {
        this.setState({
          error: `Record not found: ${recordId}`,
        });
        return false;
      }
      
      // Build form state from envelope
      const payload = envelope.payload as Record<string, unknown>;
      const formState = createFormState(this.state.formDefinition, payload);
      
      this.setState({
        mode: 'update',
        formState,
        originalEnvelope: envelope,
      });
      
      return true;
    } catch (err) {
      this.setState({
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
  
  /**
   * Reset to create mode with empty form.
   */
  resetForCreate(): void {
    const formState = createFormState(this.state.formDefinition);
    
    // Add default values for kind and $schema
    formState.values = {
      ...formState.values,
      kind: this.config.kind,
      $schema: this.config.schemaId,
    };
    
    // Create clean state object for create mode
    const newState: Partial<EditViewState> = {
      mode: 'create',
      formState,
    };
    this.setState(newState);
  }
  
  /**
   * Set a field value.
   */
  setFieldValue(path: string, value: unknown): void {
    const newValues = setValueAtPath(
      this.state.formState.values,
      path,
      value
    );
    
    const touched = new Set(this.state.formState.touched);
    touched.add(path);
    
    this.setState({
      formState: {
        ...this.state.formState,
        values: newValues,
        touched,
        isDirty: true,
      },
    });
  }
  
  /**
   * Get a field value.
   */
  getFieldValue(path: string): unknown {
    return getValueAtPath(this.state.formState.values, path);
  }
  
  /**
   * Mark a field as touched (blurred).
   */
  touchField(path: string): void {
    const touched = new Set(this.state.formState.touched);
    touched.add(path);
    
    this.setState({
      formState: {
        ...this.state.formState,
        touched,
      },
    });
  }
  
  /**
   * Validate the form.
   */
  async validate(): Promise<ValidationResult> {
    // First, validate required fields
    const requiredErrors = validateRequired(
      this.state.formDefinition,
      this.state.formState.values
    );
    
    // Build envelope for schema validation
    const envelope = this.buildEnvelope();
    
    // Validate against schema
    const validationResult = await this.config.store.validate(envelope);
    
    // Merge errors
    const errors = new Map(requiredErrors);
    if (!validationResult.valid && validationResult.errors) {
      for (const error of validationResult.errors) {
        const path = error.path.replace(/^\//, '').replace(/\//g, '.');
        const existing = errors.get(path) || [];
        errors.set(path, [...existing, error.message]);
      }
    }
    
    this.setState({
      formState: {
        ...this.state.formState,
        errors,
      },
      validationResult,
    });
    
    return validationResult;
  }
  
  /**
   * Lint the form.
   */
  async lint(): Promise<LintResult> {
    const envelope = this.buildEnvelope();
    const lintResult = await this.config.store.lint(envelope);
    
    this.setState({ lintResult });
    
    return lintResult;
  }
  
  /**
   * Build an envelope from current form state.
   */
  private buildEnvelope(): RecordEnvelope {
    const values = this.state.formState.values;
    
    // Get or generate recordId
    let recordId: string;
    if (this.state.mode === 'update' && this.state.originalEnvelope) {
      recordId = this.state.originalEnvelope.recordId;
    } else if (values.recordId && typeof values.recordId === 'string') {
      recordId = values.recordId;
    } else if (this.config.generateRecordId) {
      recordId = this.config.generateRecordId();
    } else {
      recordId = this.generateDefaultRecordId();
    }
    
    const envelope: RecordEnvelope = {
      recordId,
      schemaId: this.config.schemaId,
      payload: {
        ...values,
        recordId,
        kind: this.config.kind,
        $schema: this.config.schemaId,
      },
    };
    
    // Preserve meta from original envelope
    if (this.state.originalEnvelope?.meta) {
      envelope.meta = { ...this.state.originalEnvelope.meta };
    }
    
    return envelope;
  }
  
  /**
   * Generate a default record ID.
   */
  private generateDefaultRecordId(): string {
    // Generate ID based on kind prefix
    const prefixes: Record<string, string> = {
      'study': 'STU',
      'experiment': 'EXP',
      'run': 'RUN',
      'material': 'MAT',
      'claim': 'CLM',
      'assertion': 'AST',
      'evidence': 'EVD',
      'protocol': 'PRT',
      'instrument': 'INS',
      'labware': 'LBW',
      'labware-instance': 'LWI',
    };
    
    const prefix = prefixes[this.config.kind] || 'REC';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    return `${prefix}-${timestamp}${random}`;
  }
  
  /**
   * Save the record.
   */
  async save(): Promise<ActionResult> {
    this.setState({ isSaving: true });
    
    try {
      // Validate first
      const validationResult = await this.validate();
      if (!validationResult.valid) {
        this.setState({ isSaving: false });
        return {
          success: false,
          error: 'Validation failed',
          validationErrors: validationResult.errors?.map(e => e.message),
        };
      }
      
      // Lint
      const lintResult = await this.lint();
      if (!lintResult.valid) {
        const errors = lintResult.violations
          .filter(v => v.severity === 'error')
          .map(v => v.message);
        
        if (errors.length > 0) {
          this.setState({ isSaving: false });
          return {
            success: false,
            error: 'Lint errors',
            validationErrors: errors,
          };
        }
      }
      
      // Build envelope
      const envelope = this.buildEnvelope();
      
      // Create or update
      let result;
      if (this.state.mode === 'create') {
        result = await this.config.store.create({ envelope });
      } else {
        const sha = this.state.originalEnvelope?.meta?.commitSha;
        result = await this.config.store.update({
          envelope,
          ...(sha ? { expectedSha: sha } : {}),
        });
      }
      
      this.setState({ isSaving: false });
      
      if (result.success && result.envelope) {
        // Update state with saved envelope
        this.setState({
          mode: 'update',
          originalEnvelope: result.envelope,
          formState: {
            ...this.state.formState,
            isDirty: false,
          },
        });
        
        return {
          success: true,
          envelope: result.envelope,
        };
      }
      
      return {
        success: false,
        error: result.error || 'Save failed',
      };
    } catch (err) {
      this.setState({ isSaving: false });
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  
  /**
   * Check if form has unsaved changes.
   */
  hasChanges(): boolean {
    return this.state.formState.isDirty;
  }
  
  /**
   * Check if form is valid (no errors).
   */
  isValid(): boolean {
    return this.state.formState.errors.size === 0;
  }
  
  /**
   * Get field errors.
   */
  getFieldErrors(path: string): string[] {
    return this.state.formState.errors.get(path) || [];
  }
  
  /**
   * Check if field has been touched.
   */
  isFieldTouched(path: string): boolean {
    return this.state.formState.touched.has(path);
  }
  
  /**
   * Get all errors as a flat list.
   */
  getAllErrors(): string[] {
    const errors: string[] = [];
    for (const [, fieldErrors] of this.state.formState.errors) {
      errors.push(...fieldErrors);
    }
    return errors;
  }
  
  /**
   * Get lint warnings.
   */
  getLintWarnings(): string[] {
    if (!this.state.lintResult) return [];
    return this.state.lintResult.violations
      .filter(v => v.severity === 'warning')
      .map(v => v.message);
  }
}

/**
 * Create a new RecordEditController.
 */
export function createRecordEditController(
  config: EditControllerConfig
): RecordEditController {
  return new RecordEditController(config);
}
