/**
 * Tests for TabBreadcrumb component.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TabBreadcrumb, type TabBreadcrumbProps } from './TabBreadcrumb'
import type { BreadcrumbItem } from '../../event-editor/workspace/types'

const crumbs: BreadcrumbItem[] = [
  { label: 'Projects', entityType: 'collection', route: '/projects' },
  { label: 'My Project', entityType: 'project', id: 'STU-1', route: '/project/STU-1' },
]

function renderComponent(props: TabBreadcrumbProps) {
  return render(
    <MemoryRouter>
      <TabBreadcrumb {...props} />
    </MemoryRouter>,
  )
}

describe('TabBreadcrumb', () => {
  it('renders crumb buttons and current label', () => {
    renderComponent({ crumbs, current: 'Run View' })

    const breadcrumb = screen.getByTestId('tab-breadcrumb')
    expect(breadcrumb).toBeInTheDocument()

    const current = screen.getByTestId('tab-breadcrumb-current')
    expect(current).toHaveTextContent('Run View')

    // Both crumbs should render as buttons (they have routes)
    expect(screen.getByTestId('tab-crumb-0')).toBeInstanceOf(HTMLButtonElement)
    expect(screen.getByTestId('tab-crumb-1')).toBeInstanceOf(HTMLButtonElement)
    expect(screen.getByTestId('tab-crumb-0')).toHaveTextContent('Projects')
    expect(screen.getByTestId('tab-crumb-1')).toHaveTextContent('My Project')
  })

  it('renders static crumbs when no route is set', () => {
    const staticCrumbs: BreadcrumbItem[] = [
      { label: 'Static Label', entityType: null },
    ]
    renderComponent({ crumbs: staticCrumbs, current: 'Page' })

    // Static crumb should not be a button — it's a span
    const container = screen.getByTestId('tab-breadcrumb')
    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(0)

    expect(screen.getByTestId('tab-breadcrumb-current')).toHaveTextContent('Page')
  })

  it('returns null when crumbs is empty', () => {
    const { container } = renderComponent({ crumbs: [], current: 'Page' })
    const breadcrumb = container.querySelector('[data-testid="tab-breadcrumb"]')
    expect(breadcrumb).toBeNull()
  })
})
