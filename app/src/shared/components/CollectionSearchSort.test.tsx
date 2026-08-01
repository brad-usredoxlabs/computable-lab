import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CollectionSearchSort } from './CollectionSearchSort'

describe('CollectionSearchSort', () => {
  const defaultProps = {
    query: '',
    onQueryChange: vi.fn(),
    sortField: 'name',
    onSortFieldChange: vi.fn(),
    sortDirection: 'asc' as const,
    onSortDirectionChange: vi.fn(),
    sortFields: [
      { id: 'name', label: 'Name' },
      { id: 'date_created', label: 'Date Created' },
    ],
  }

  it('renders search input and sort buttons', () => {
    render(<CollectionSearchSort {...defaultProps} />)
    expect(screen.getByPlaceholderText('Search...')).toBeDefined()
    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('Date Created')).toBeDefined()
  })

  it('fires onQueryChange when typing', () => {
    const onQueryChange = vi.fn()
    render(<CollectionSearchSort {...defaultProps} onQueryChange={onQueryChange} />)
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'test' } })
    expect(onQueryChange).toHaveBeenCalledWith('test')
  })

  it('fires onSortFieldChange when clicking a different sort field', () => {
    const onSortFieldChange = vi.fn()
    render(<CollectionSearchSort {...defaultProps} onSortFieldChange={onSortFieldChange} />)
    fireEvent.click(screen.getByText('Date Created'))
    expect(onSortFieldChange).toHaveBeenCalledWith('date_created')
  })

  it('toggles sort direction when clicking the active field', () => {
    const onSortDirectionChange = vi.fn()
    render(<CollectionSearchSort {...defaultProps} onSortDirectionChange={onSortDirectionChange} />)
    fireEvent.click(screen.getByText('Name'))
    expect(onSortDirectionChange).toHaveBeenCalledWith('desc')
  })

  it('shows count when provided', () => {
    render(<CollectionSearchSort {...defaultProps} totalCount={42} />)
    expect(screen.getByText('42')).toBeDefined()
  })
})
