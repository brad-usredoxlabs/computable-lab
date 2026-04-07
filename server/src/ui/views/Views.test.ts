/**
 * Tests for CRUD View Controllers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RecordListController,
  createRecordListController,
} from './RecordListController.js';
import {
  RecordDetailController,
  createRecordDetailController,
} from './RecordDetailController.js';
import {
  RecordEditController,
  createRecordEditController,
} from './RecordEditController.js';
import type { RecordStore, RecordEnvelope } from '../../store/types.js';
import type { ValidationResult, LintResult } from '../../types/common.js';

// Mock record store
function createMockStore(records: RecordEnvelope[] = []): RecordStore {
  return {
    get: vi.fn((recordId: string) => {
      const record = records.find(r => r.recordId === recordId);
      return Promise.resolve(record || null);
    }),
    getWithValidation: vi.fn(() => Promise.resolve({ success: true })),
    list: vi.fn((filter) => {
      let result = [...records];
      if (filter?.kind) {
        result = result.filter(r => {
          const payload = r.payload as Record<string, unknown>;
          return payload.kind === filter.kind;
        });
      }
      return Promise.resolve(result);
    }),
    create: vi.fn((options) => Promise.resolve({ 
      success: true, 
      envelope: options.envelope,
    })),
    update: vi.fn((options) => Promise.resolve({ 
      success: true, 
      envelope: options.envelope,
    })),
    delete: vi.fn(() => Promise.resolve({ success: true })),
    validate: vi.fn(() => Promise.resolve({ 
      valid: true, 
      errors: [],
    } as ValidationResult)),
    lint: vi.fn(() => Promise.resolve({ 
      valid: true, 
      violations: [],
    } as LintResult)),
    exists: vi.fn((recordId: string) => {
      return Promise.resolve(records.some(r => r.recordId === recordId));
    }),
  };
}

// Sample records
const sampleRecords: RecordEnvelope[] = [
  {
    recordId: 'STU-001',
    schemaId: 'https://example.com/study',
    payload: {
      kind: 'study',
      recordId: 'STU-001',
      title: 'Study One',
      description: 'First study',
    },
  },
  {
    recordId: 'STU-002',
    schemaId: 'https://example.com/study',
    payload: {
      kind: 'study',
      recordId: 'STU-002',
      title: 'Study Two',
      description: 'Second study',
    },
  },
  {
    recordId: 'EXP-001',
    schemaId: 'https://example.com/experiment',
    payload: {
      kind: 'experiment',
      recordId: 'EXP-001',
      title: 'Experiment One',
      studyId: 'STU-001',
    },
  },
];

describe('RecordListController', () => {
  let store: RecordStore;
  let controller: RecordListController;
  
  beforeEach(() => {
    store = createMockStore(sampleRecords);
    controller = createRecordListController(store);
  });
  
  describe('initialization', () => {
    it('creates with default state', () => {
      const state = controller.getState();
      
      expect(state.isLoading).toBe(false);
      expect(state.rows).toEqual([]);
      expect(state.query.page).toBe(1);
      expect(state.query.pageSize).toBe(20);
    });
    
    it('accepts initial query', () => {
      const ctrl = createRecordListController(store, { kind: 'study', page: 2 });
      const state = ctrl.getState();
      
      expect(state.query.kind).toBe('study');
      expect(state.query.page).toBe(2);
    });
  });
  
  describe('load', () => {
    it('loads all records', async () => {
      await controller.load();
      const state = controller.getState();
      
      expect(state.rows.length).toBe(3);
      expect(state.isLoading).toBe(false);
    });
    
    it('filters by kind via query', async () => {
      await controller.setQuery({ kind: 'study' });
      const state = controller.getState();
      
      expect(state.rows.length).toBe(2);
      expect(state.rows.every(r => r.kind === 'study')).toBe(true);
    });
    
    it('calculates pagination correctly', async () => {
      await controller.setQuery({ pageSize: 2 });
      const state = controller.getState();
      
      expect(state.pagination.totalItems).toBe(3);
      expect(state.pagination.totalPages).toBe(2);
      expect(state.pagination.hasNext).toBe(true);
      expect(state.pagination.hasPrevious).toBe(false);
    });
  });
  
  describe('sorting', () => {
    it('sorts by field', async () => {
      await controller.load();
      await controller.setSort('title');
      const state = controller.getState();
      
      // Should be sorted alphabetically
      const titles = state.rows.map(r => r.columns.get('title'));
      expect(titles[0]).toBe('Experiment One');
    });
    
    it('toggles sort direction', async () => {
      await controller.load();
      await controller.setSort('title');
      await controller.setSort('title');
      
      const state = controller.getState();
      expect(state.query.sortDirection).toBe('desc');
    });
  });
  
  describe('filtering', () => {
    it('adds filter', async () => {
      await controller.load();
      await controller.addFilter({ path: 'title', operator: 'contains', value: 'One' });
      
      const state = controller.getState();
      expect(state.rows.length).toBe(2); // Study One and Experiment One
    });
    
    it('removes filter', async () => {
      // Start fresh to avoid cumulative filters
      const freshStore = createMockStore(sampleRecords);
      const freshController = createRecordListController(freshStore);
      
      await freshController.load();
      await freshController.addFilter({ path: 'title', operator: 'contains', value: 'One' });
      
      // Verify filter applied
      expect(freshController.getState().rows.length).toBe(2);
      
      await freshController.removeFilter('title');
      
      const state = freshController.getState();
      expect(state.rows.length).toBe(3);
    });
    
    it('clears all filters', async () => {
      await controller.load();
      await controller.addFilter({ path: 'title', operator: 'contains', value: 'One' });
      await controller.clearFilters();
      
      const state = controller.getState();
      expect(state.rows.length).toBe(3);
    });
  });
  
  describe('search', () => {
    it('searches in text fields', async () => {
      await controller.load();
      await controller.setSearch('First');
      
      const state = controller.getState();
      expect(state.rows.length).toBe(1);
      expect(state.rows[0].recordId).toBe('STU-001');
    });
    
    it('searches in recordId', async () => {
      await controller.load();
      await controller.setSearch('EXP');
      
      const state = controller.getState();
      expect(state.rows.length).toBe(1);
      expect(state.rows[0].recordId).toBe('EXP-001');
    });
  });
  
  describe('pagination', () => {
    it('goes to next page', async () => {
      await controller.setQuery({ pageSize: 2 });
      await controller.nextPage();
      
      const state = controller.getState();
      expect(state.pagination.page).toBe(2);
      expect(state.rows.length).toBe(1);
    });
    
    it('goes to previous page', async () => {
      await controller.setQuery({ pageSize: 2, page: 2 });
      await controller.previousPage();
      
      const state = controller.getState();
      expect(state.pagination.page).toBe(1);
    });
  });
  
  describe('selection', () => {
    it('selects row', async () => {
      await controller.load();
      controller.selectRow('STU-001');
      
      expect(controller.getState().selectedIds.has('STU-001')).toBe(true);
    });
    
    it('deselects row', async () => {
      await controller.load();
      controller.selectRow('STU-001');
      controller.deselectRow('STU-001');
      
      expect(controller.getState().selectedIds.has('STU-001')).toBe(false);
    });
    
    it('toggles selection', async () => {
      await controller.load();
      controller.toggleRowSelection('STU-001');
      expect(controller.getState().selectedIds.has('STU-001')).toBe(true);
      
      controller.toggleRowSelection('STU-001');
      expect(controller.getState().selectedIds.has('STU-001')).toBe(false);
    });
    
    it('selects all on page', async () => {
      await controller.setQuery({ pageSize: 2 });
      controller.selectAll();
      
      expect(controller.getState().selectedIds.size).toBe(2);
    });
    
    it('clears selection', async () => {
      await controller.load();
      controller.selectRow('STU-001');
      controller.selectRow('STU-002');
      controller.clearSelection();
      
      expect(controller.getState().selectedIds.size).toBe(0);
    });
  });
  
  describe('subscription', () => {
    it('notifies listeners on state change', async () => {
      const listener = vi.fn();
      controller.subscribe(listener);
      
      await controller.load();
      
      expect(listener).toHaveBeenCalled();
    });
    
    it('unsubscribes correctly', async () => {
      const listener = vi.fn();
      const unsubscribe = controller.subscribe(listener);
      
      unsubscribe();
      await controller.load();
      
      // Listener should not be called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

describe('RecordDetailController', () => {
  let store: RecordStore;
  let controller: RecordDetailController;
  
  beforeEach(() => {
    store = createMockStore(sampleRecords);
    controller = createRecordDetailController({ store });
  });
  
  describe('load', () => {
    it('loads existing record', async () => {
      await controller.load('STU-001');
      const state = controller.getState();
      
      expect(state.envelope).not.toBeNull();
      expect(state.envelope?.recordId).toBe('STU-001');
      expect(state.isLoading).toBe(false);
    });
    
    it('handles missing record', async () => {
      await controller.load('NONEXISTENT');
      const state = controller.getState();
      
      expect(state.envelope).toBeNull();
      expect(state.error).toContain('not found');
    });
  });
  
  describe('helpers', () => {
    it('gets display title', async () => {
      await controller.load('STU-001');
      
      expect(controller.getDisplayTitle()).toBe('Study One');
    });
    
    it('gets kind', async () => {
      await controller.load('STU-001');
      
      expect(controller.getKind()).toBe('study');
    });
    
    it('gets field value', async () => {
      await controller.load('STU-001');
      
      expect(controller.getFieldValue('description')).toBe('First study');
    });
  });
  
  describe('reload', () => {
    it('reloads current record', async () => {
      await controller.load('STU-001');
      
      // Modify the mock to return updated data
      const newRecord = {
        ...sampleRecords[0],
        payload: { ...sampleRecords[0].payload as Record<string, unknown>, title: 'Updated Title' },
      };
      vi.mocked(store.get).mockResolvedValueOnce(newRecord);
      
      await controller.reload();
      
      expect(controller.getDisplayTitle()).toBe('Updated Title');
    });
  });
});

describe('RecordEditController', () => {
  let store: RecordStore;
  let controller: RecordEditController;
  
  const testSchema = {
    $id: 'https://example.com/study',
    type: 'object',
    properties: {
      kind: { type: 'string' },
      recordId: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['kind', 'recordId', 'title'],
  };
  
  beforeEach(() => {
    store = createMockStore(sampleRecords);
    controller = createRecordEditController({
      store,
      schema: testSchema,
      schemaId: 'https://example.com/study',
      kind: 'study',
    });
  });
  
  describe('initialization', () => {
    it('creates in create mode', () => {
      const state = controller.getState();
      
      expect(state.mode).toBe('create');
      expect(state.kind).toBe('study');
      expect(state.isSaving).toBe(false);
    });
    
    it('sets default kind and schema in form', () => {
      const values = controller.getState().formState.values;
      
      expect(values.kind).toBe('study');
      expect(values.$schema).toBe('https://example.com/study');
    });
  });
  
  describe('loadForEdit', () => {
    it('loads existing record', async () => {
      const result = await controller.loadForEdit('STU-001');
      
      expect(result).toBe(true);
      expect(controller.getState().mode).toBe('update');
      expect(controller.getFieldValue('title')).toBe('Study One');
    });
    
    it('handles missing record', async () => {
      const result = await controller.loadForEdit('NONEXISTENT');
      
      expect(result).toBe(false);
      expect(controller.getState().error).toContain('not found');
    });
  });
  
  describe('field operations', () => {
    it('sets field value', () => {
      controller.setFieldValue('title', 'New Title');
      
      expect(controller.getFieldValue('title')).toBe('New Title');
      expect(controller.getState().formState.isDirty).toBe(true);
    });
    
    it('marks field as touched', () => {
      controller.touchField('title');
      
      expect(controller.isFieldTouched('title')).toBe(true);
    });
    
    it('tracks dirty state', () => {
      expect(controller.hasChanges()).toBe(false);
      
      controller.setFieldValue('title', 'Changed');
      
      expect(controller.hasChanges()).toBe(true);
    });
  });
  
  describe('validation', () => {
    it('validates form', async () => {
      controller.setFieldValue('title', 'Test Study');
      const result = await controller.validate();
      
      expect(result.valid).toBe(true);
    });
    
    it('returns field errors', async () => {
      // Set up mock to return validation error
      vi.mocked(store.validate).mockResolvedValueOnce({
        valid: false,
        errors: [{ path: '/title', message: 'Required', keyword: 'required' }],
      });
      
      await controller.validate();
      
      expect(controller.getFieldErrors('title').length).toBeGreaterThan(0);
    });
  });
  
  describe('lint', () => {
    it('lints form', async () => {
      const result = await controller.lint();
      
      expect(result.valid).toBe(true);
    });
    
    it('collects lint warnings', async () => {
      vi.mocked(store.lint).mockResolvedValueOnce({
        valid: true,
        violations: [
          { ruleId: 'test', message: 'Warning message', severity: 'warning' },
        ],
      });
      
      await controller.lint();
      
      expect(controller.getLintWarnings()).toContain('Warning message');
    });
  });
  
  describe('save', () => {
    it('saves new record', async () => {
      controller.setFieldValue('title', 'New Study');
      
      const result = await controller.save();
      
      expect(result.success).toBe(true);
      expect(result.envelope).toBeDefined();
      expect(store.create).toHaveBeenCalled();
    });
    
    it('updates existing record', async () => {
      await controller.loadForEdit('STU-001');
      controller.setFieldValue('title', 'Updated Study');
      
      const result = await controller.save();
      
      expect(result.success).toBe(true);
      expect(store.update).toHaveBeenCalled();
    });
    
    it('fails on validation error', async () => {
      vi.mocked(store.validate).mockResolvedValueOnce({
        valid: false,
        errors: [{ path: '/title', message: 'Required', keyword: 'required' }],
      });
      
      const result = await controller.save();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation');
    });
    
    it('fails on lint error', async () => {
      vi.mocked(store.lint).mockResolvedValueOnce({
        valid: false,
        violations: [
          { ruleId: 'test', message: 'Error message', severity: 'error' },
        ],
      });
      
      const result = await controller.save();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Lint');
    });
  });
  
  describe('resetForCreate', () => {
    it('resets to create mode', async () => {
      await controller.loadForEdit('STU-001');
      controller.resetForCreate();
      
      expect(controller.getState().mode).toBe('create');
      expect(controller.getFieldValue('title')).toBeUndefined();
    });
  });
  
  describe('record ID generation', () => {
    it('generates ID with kind prefix', async () => {
      controller.setFieldValue('title', 'Test');
      const result = await controller.save();
      
      if (result.success && result.envelope) {
        expect(result.envelope.recordId).toMatch(/^STU-/);
      }
    });
  });
});
