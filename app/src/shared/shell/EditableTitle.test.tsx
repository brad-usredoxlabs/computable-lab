/**
 * Tests for EditableTitle — inline-editable title component.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EditableTitle } from './EditableTitle'

afterEach(() => cleanup())

describe('EditableTitle', () => {
  it('displays the title', () => {
    render(<EditableTitle title="My Run" onCommit={() => {}} />)
    expect(screen.getByText('My Run')).toBeDefined()
  })

  it('enters edit mode on click', () => {
    render(<EditableTitle title="My Run" onCommit={() => {}} testId="title" />)
    fireEvent.click(screen.getByTestId('title'))
    expect(screen.getByTestId('title-input')).toBeDefined()
  })

  it('commits on Enter', () => {
    const onCommit = vi.fn()
    render(<EditableTitle title="My Run" onCommit={onCommit} testId="title" />)
    fireEvent.click(screen.getByTestId('title'))
    const input = screen.getByTestId('title-input')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('New Name')
  })

  it('cancels on Escape', () => {
    const onCommit = vi.fn()
    render(<EditableTitle title="My Run" onCommit={onCommit} testId="title" />)
    fireEvent.click(screen.getByTestId('title'))
    const input = screen.getByTestId('title-input')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByText('My Run')).toBeDefined()
  })

  it('does not commit if title unchanged', () => {
    const onCommit = vi.fn()
    render(<EditableTitle title="My Run" onCommit={onCommit} testId="title" />)
    fireEvent.click(screen.getByTestId('title'))
    fireEvent.keyDown(screen.getByTestId('title-input'), { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
  })
})
