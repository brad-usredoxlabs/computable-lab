/**
 * RecordListController — Controller for record list views.
 * 
 * This controller manages state and logic for listing records.
 * It's framework-agnostic — just pure data/logic.
 */

import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { RecordStore } from '../../store/types.js';
import type { ListColumn } from '../types.js';
import type {
  ListQuery,
  ListRow,
  ListViewState,
  PaginationInfo,
  FilterCriterion,
  SortDirection,
} from './types.js';
import { getValueAtPath } from '../FormBuilder.js';

/**
 * Default page size.
 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Default columns if none specified.
 */
const DEFAULT_COLUMNS: ListColumn[] = [
  { path: 'recordId', label: 'ID', sortable: true },
  { path: 'title', label: 'Title', sortable: true },
  { path: 'kind', label: 'Kind', sortable: true },
];

/**
 * RecordListController — Manages list view state and operations.
 */
export class RecordListController {
  private store: RecordStore;
  private state: ListViewState;
  private stateListeners: Array<(state: ListViewState) => void> = [];
  
  constructor(store: RecordStore, initialQuery?: Partial<ListQuery>) {
    this.store = store;
    this.state = this.createInitialState(initialQuery);
  }
  
  /**
   * Create initial state.
   */
  private createInitialState(initialQuery?: Partial<ListQuery>): ListViewState {
    return {
      query: {
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        sortDirection: 'asc',
        ...initialQuery,
      },
      rows: [],
      columns: DEFAULT_COLUMNS,
      pagination: {
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        totalItems: 0,
        totalPages: 0,
        hasPrevious: false,
        hasNext: false,
      },
      isLoading: false,
      selectedIds: new Set(),
    };
  }
  
  /**
   * Get current state.
   */
  getState(): ListViewState {
    return this.state;
  }
  
  /**
   * Subscribe to state changes.
   */
  subscribe(listener: (state: ListViewState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== listener);
    };
  }
  
  /**
   * Update state and notify listeners.
   */
  private setState(partial: Partial<ListViewState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }
  
  /**
   * Set columns configuration.
   */
  setColumns(columns: ListColumn[]): void {
    this.setState({ columns });
  }
  
  /**
   * Load records based on current query.
   */
  async load(): Promise<void> {
    this.setState({ isLoading: true });
    
    try {
      // Fetch all records (filtering happens client-side for now)
      const kind = this.state.query.kind;
      const filter = kind ? { kind } : undefined;
      const allEnvelopes = await this.store.list(filter);
      
      // Apply filters
      let filtered = this.applyFilters(allEnvelopes);
      
      // Apply search
      if (this.state.query.search) {
        filtered = this.applySearch(filtered, this.state.query.search);
      }
      
      // Apply sort
      const sorted = this.applySort(filtered);
      
      // Calculate pagination
      const totalItems = sorted.length;
      const pageSize = this.state.query.pageSize || DEFAULT_PAGE_SIZE;
      const totalPages = Math.ceil(totalItems / pageSize);
      const page = Math.min(this.state.query.page || 1, Math.max(1, totalPages));
      
      // Get page slice
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const pageItems = sorted.slice(startIndex, endIndex);
      
      // Build rows
      const rows = pageItems.map(env => this.buildRow(env));
      
      // Update pagination info
      const pagination: PaginationInfo = {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      };
      
      this.setState({
        rows,
        pagination,
        isLoading: false,
      });
    } catch (err) {
      this.setState({
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  
  /**
   * Build a row from an envelope.
   */
  private buildRow(envelope: RecordEnvelope): ListRow {
    const payload = envelope.payload as Record<string, unknown>;
    const columns = new Map<string, unknown>();
    
    for (const col of this.state.columns) {
      let value: unknown;
      
      if (col.path === 'recordId') {
        value = envelope.recordId;
      } else if (col.path === 'kind') {
        value = payload.kind || envelope.meta?.kind;
      } else {
        value = getValueAtPath(payload, col.path);
      }
      
      columns.set(col.path, value);
    }
    
    return {
      recordId: envelope.recordId,
      kind: (payload.kind as string) || envelope.meta?.kind || 'unknown',
      columns,
      envelope,
    };
  }
  
  /**
   * Apply filters to envelopes.
   */
  private applyFilters(envelopes: RecordEnvelope[]): RecordEnvelope[] {
    const filters = this.state.query.filters;
    if (!filters || filters.length === 0) {
      return envelopes;
    }
    
    return envelopes.filter(env => {
      const payload = env.payload as Record<string, unknown>;
      
      return filters.every(filter => this.matchesFilter(payload, filter));
    });
  }
  
  /**
   * Check if a record matches a filter.
   */
  private matchesFilter(
    payload: Record<string, unknown>,
    filter: FilterCriterion
  ): boolean {
    const value = getValueAtPath(payload, filter.path);
    
    switch (filter.operator) {
      case 'equals':
        return value === filter.value;
        
      case 'notEquals':
        return value !== filter.value;
        
      case 'contains':
        return typeof value === 'string' && 
               typeof filter.value === 'string' &&
               value.toLowerCase().includes(filter.value.toLowerCase());
        
      case 'startsWith':
        return typeof value === 'string' && 
               typeof filter.value === 'string' &&
               value.toLowerCase().startsWith(filter.value.toLowerCase());
        
      case 'endsWith':
        return typeof value === 'string' && 
               typeof filter.value === 'string' &&
               value.toLowerCase().endsWith(filter.value.toLowerCase());
        
      case 'gt':
        return typeof value === 'number' && 
               typeof filter.value === 'number' &&
               value > filter.value;
        
      case 'gte':
        return typeof value === 'number' && 
               typeof filter.value === 'number' &&
               value >= filter.value;
        
      case 'lt':
        return typeof value === 'number' && 
               typeof filter.value === 'number' &&
               value < filter.value;
        
      case 'lte':
        return typeof value === 'number' && 
               typeof filter.value === 'number' &&
               value <= filter.value;
        
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);
        
      case 'between':
        if (typeof value !== 'number' || !Array.isArray(filter.value)) {
          return false;
        }
        const [min, max] = filter.value as [number, number];
        return value >= min && value <= max;
        
      default:
        return true;
    }
  }
  
  /**
   * Apply search to envelopes.
   */
  private applySearch(
    envelopes: RecordEnvelope[],
    search: string
  ): RecordEnvelope[] {
    const searchLower = search.toLowerCase();
    
    return envelopes.filter(env => {
      const payload = env.payload as Record<string, unknown>;
      
      // Search in recordId
      if (env.recordId.toLowerCase().includes(searchLower)) {
        return true;
      }
      
      // Search in common text fields
      for (const key of ['title', 'name', 'description', 'statement']) {
        const value = payload[key];
        if (typeof value === 'string' && value.toLowerCase().includes(searchLower)) {
          return true;
        }
      }
      
      return false;
    });
  }
  
  /**
   * Apply sort to envelopes.
   */
  private applySort(envelopes: RecordEnvelope[]): RecordEnvelope[] {
    const { sortField, sortDirection } = this.state.query;
    
    if (!sortField) {
      return envelopes;
    }
    
    const direction = sortDirection === 'desc' ? -1 : 1;
    
    return [...envelopes].sort((a, b) => {
      const payloadA = a.payload as Record<string, unknown>;
      const payloadB = b.payload as Record<string, unknown>;
      
      let valueA: unknown;
      let valueB: unknown;
      
      if (sortField === 'recordId') {
        valueA = a.recordId;
        valueB = b.recordId;
      } else {
        valueA = getValueAtPath(payloadA, sortField);
        valueB = getValueAtPath(payloadB, sortField);
      }
      
      // Handle nulls
      if (valueA === null || valueA === undefined) return direction;
      if (valueB === null || valueB === undefined) return -direction;
      
      // Compare strings
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return valueA.localeCompare(valueB) * direction;
      }
      
      // Compare numbers
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return (valueA - valueB) * direction;
      }
      
      // Fallback to string comparison
      return String(valueA).localeCompare(String(valueB)) * direction;
    });
  }
  
  /**
   * Update query and reload.
   */
  async setQuery(query: Partial<ListQuery>): Promise<void> {
    this.setState({
      query: { ...this.state.query, ...query },
    });
    await this.load();
  }
  
  /**
   * Go to a specific page.
   */
  async goToPage(page: number): Promise<void> {
    await this.setQuery({ page });
  }
  
  /**
   * Go to next page.
   */
  async nextPage(): Promise<void> {
    if (this.state.pagination.hasNext) {
      await this.goToPage(this.state.pagination.page + 1);
    }
  }
  
  /**
   * Go to previous page.
   */
  async previousPage(): Promise<void> {
    if (this.state.pagination.hasPrevious) {
      await this.goToPage(this.state.pagination.page - 1);
    }
  }
  
  /**
   * Set sort field and direction.
   */
  async setSort(field: string, direction?: SortDirection): Promise<void> {
    // Toggle direction if same field
    let newDirection = direction;
    if (!newDirection) {
      if (this.state.query.sortField === field) {
        newDirection = this.state.query.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        newDirection = 'asc';
      }
    }
    
    await this.setQuery({
      sortField: field,
      sortDirection: newDirection,
      page: 1, // Reset to first page on sort
    });
  }
  
  /**
   * Set search query.
   */
  async setSearch(search: string): Promise<void> {
    const update: Partial<ListQuery> = { page: 1 };
    if (search) {
      update.search = search;
    }
    await this.setQuery(update);
  }
  
  /**
   * Add a filter.
   */
  async addFilter(filter: FilterCriterion): Promise<void> {
    const filters = [...(this.state.query.filters || []), filter];
    await this.setQuery({ filters, page: 1 });
  }
  
  /**
   * Remove a filter by path.
   */
  async removeFilter(path: string): Promise<void> {
    const filters = (this.state.query.filters || []).filter(f => f.path !== path);
    
    if (filters.length > 0) {
      await this.setQuery({ filters, page: 1 });
    } else {
      // Clear filters completely - need to rebuild query without filters
      const { kind, sortField, sortDirection, pageSize, search } = this.state.query;
      const newQuery: ListQuery = {
        page: 1,
        ...(kind ? { kind } : {}),
        ...(sortField ? { sortField } : {}),
        ...(sortDirection ? { sortDirection } : {}),
        ...(pageSize ? { pageSize } : {}),
        ...(search ? { search } : {}),
      };
      this.setState({ query: newQuery });
      await this.load();
    }
  }
  
  /**
   * Clear all filters.
   */
  async clearFilters(): Promise<void> {
    // Reload without filters/search - create new query without those props
    const { kind, sortField, sortDirection, pageSize } = this.state.query;
    const newQuery: ListQuery = {
      page: 1,
      ...(kind ? { kind } : {}),
      ...(sortField ? { sortField } : {}),
      ...(sortDirection ? { sortDirection } : {}),
      ...(pageSize ? { pageSize } : {}),
    };
    this.setState({ query: newQuery });
    await this.load();
  }
  
  /**
   * Select a row.
   */
  selectRow(recordId: string): void {
    const selectedIds = new Set(this.state.selectedIds);
    selectedIds.add(recordId);
    this.setState({ selectedIds });
  }
  
  /**
   * Deselect a row.
   */
  deselectRow(recordId: string): void {
    const selectedIds = new Set(this.state.selectedIds);
    selectedIds.delete(recordId);
    this.setState({ selectedIds });
  }
  
  /**
   * Toggle row selection.
   */
  toggleRowSelection(recordId: string): void {
    if (this.state.selectedIds.has(recordId)) {
      this.deselectRow(recordId);
    } else {
      this.selectRow(recordId);
    }
  }
  
  /**
   * Select all rows on current page.
   */
  selectAll(): void {
    const selectedIds = new Set(this.state.rows.map(r => r.recordId));
    this.setState({ selectedIds });
  }
  
  /**
   * Clear selection.
   */
  clearSelection(): void {
    this.setState({ selectedIds: new Set() });
  }
  
  /**
   * Get selected records.
   */
  getSelectedRecords(): RecordEnvelope[] {
    return this.state.rows
      .filter(r => this.state.selectedIds.has(r.recordId))
      .map(r => r.envelope);
  }
}

/**
 * Create a new RecordListController.
 */
export function createRecordListController(
  store: RecordStore,
  initialQuery?: Partial<ListQuery>
): RecordListController {
  return new RecordListController(store, initialQuery);
}
