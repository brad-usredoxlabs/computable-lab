/**
 * CollectionSearchSort — shared search input + sort controls for collection views.
 *
 * Extracts the ad-hoc search/sort UI duplicated across ProjectCollectionView,
 * RunCollectionView, and LabCollectionView into a single reusable component.
 */

export interface SortField {
  id: string
  label: string
}

export interface CollectionSearchSortProps {
  query: string
  onQueryChange: (q: string) => void
  sortField: string
  onSortFieldChange: (field: string) => void
  sortDirection: 'asc' | 'desc'
  onSortDirectionChange: (dir: 'asc' | 'desc') => void
  sortFields: SortField[]
  placeholder?: string
  totalCount?: number
}

export function CollectionSearchSort({
  query,
  onQueryChange,
  sortField,
  onSortFieldChange,
  sortDirection,
  onSortDirectionChange,
  sortFields,
  placeholder,
  totalCount,
}: CollectionSearchSortProps) {
  return (
    <div className="collection-search-sort" data-testid="collection-search-sort">
      <input
        type="text"
        className="collection-search-sort__input"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={placeholder ?? 'Search...'}
        aria-label="Filter records"
      />
      {totalCount !== undefined ? (
        <span className="collection-search-sort__count">{totalCount}</span>
      ) : null}
      <span className="collection-search-sort__label">Sort:</span>
      <div className="collection-search-sort__buttons">
        {sortFields.map((field) => (
          <button
            key={field.id}
            type="button"
            className={`collection-search-sort__btn ${sortField === field.id ? 'collection-search-sort__btn--active' : ''}`}
            onClick={() => {
              if (sortField === field.id) {
                onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')
              } else {
                onSortFieldChange(field.id)
              }
            }}
            title={`Sort by ${field.label}`}
          >
            {field.label}
            {sortField === field.id && (
              <span className="collection-search-sort__arrow">
                {sortDirection === 'asc' ? ' \u2191' : ' \u2193'}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
