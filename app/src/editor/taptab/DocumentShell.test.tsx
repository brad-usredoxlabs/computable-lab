/**
 * Focused UI render tests for the DocumentShell component.
 *
 * Covers:
 *  - top control bar renders
 *  - document column renders
 *  - secondary rail / diagnostics area renders
 *  - narrow-width render does not explode
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DocumentShell, DocumentShellHeader, DocumentShellRail } from './DocumentShell'

// Clean up after each test to prevent DOM pollution between tests
afterEach(() => {
  cleanup()
})

/* ------------------------------------------------------------------ */
/*  DocumentShell — top control bar                                   */
/* ------------------------------------------------------------------ */

describe('DocumentShell top control bar', () => {
  it('renders the top bar with title', () => {
    render(
      <DocumentShell
        topBar={<DocumentShellHeader title="Test Record" />}
      >
        <div data-testid="doc-col-1">Document content</div>
      </DocumentShell>
    )

    const topbar = screen.getByRole('banner')
    expect(topbar).toBeInTheDocument()
    expect(screen.getByText('Test Record')).toBeInTheDocument()
  })

  it('renders breadcrumb links', () => {
    render(
      <DocumentShell
        topBar={
          <DocumentShellHeader
            breadcrumbs={[
              { label: 'Schemas', href: '/schemas' },
              { label: 'person', href: '/schemas/person/records' },
              { label: 'person-001' },
            ]}
            title="Edit Record"
          />
        }
      >
        <div data-testid="doc-col-2">Content</div>
      </DocumentShell>
    )

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/schemas')
    expect(links[1]).toHaveAttribute('href', '/schemas/person/records')
    expect(screen.getByText('person-001')).toBeInTheDocument()
  })

  it('renders action buttons in the top bar', () => {
    render(
      <DocumentShell
        topBar={
          <DocumentShellHeader
            title="Test"
            actions={
              <>
                <button data-testid="save-btn">Save</button>
                <button data-testid="cancel-btn">Cancel</button>
              </>
            }
          />
        }
      >
        <div data-testid="doc-col-3">Content</div>
      </DocumentShell>
    )

    expect(screen.getByTestId('save-btn')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-btn')).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/*  DocumentShell — document column                                  */
/* ------------------------------------------------------------------ */

describe('DocumentShell document column', () => {
  it('renders the primary document column with children', () => {
    render(
      <DocumentShell
        topBar={<DocumentShellHeader title="Test" />}
      >
        <div data-testid="doc-col-4">
          <p>Section 1</p>
          <p>Section 2</p>
        </div>
      </DocumentShell>
    )

    const column = screen.getByTestId('doc-col-4')
    expect(column).toBeInTheDocument()
    expect(screen.getByText('Section 1')).toBeInTheDocument()
    expect(screen.getByText('Section 2')).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/*  DocumentShell — secondary rail / diagnostics                     */
/* ------------------------------------------------------------------ */

describe('DocumentShell secondary rail', () => {
  it('renders the diagnostics rail when provided', () => {
    render(
      <DocumentShell
        topBar={<DocumentShellHeader title="Test" />}
        rail={
          <DocumentShellRail title="Diagnostics">
            <div data-testid="diag-content">
              <p>No errors</p>
            </div>
          </DocumentShellRail>
        }
      >
        <div data-testid="doc-col-5">Content</div>
      </DocumentShell>
    )

    const rail = screen.getByRole('complementary')
    expect(rail).toBeInTheDocument()
    expect(screen.getByText('Diagnostics')).toBeInTheDocument()
    expect(screen.getByTestId('diag-content')).toBeInTheDocument()
  })

  it('renders without a rail when not provided', () => {
    render(
      <DocumentShell
        topBar={<DocumentShellHeader title="Test" />}
      >
        <div data-testid="doc-col-6">Content</div>
      </DocumentShell>
    )

    const rail = screen.queryByRole('complementary')
    expect(rail).not.toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/*  DocumentShell — narrow-width / responsive                        */
/* ------------------------------------------------------------------ */

describe('DocumentShell narrow-width render', () => {
  it('does not explode on narrow viewport', () => {
    // Simulate narrow viewport by setting a small container width
    const { container } = render(
      <div style={{ width: '320px' }}>
        <DocumentShell
          topBar={
            <DocumentShellHeader
              title="Narrow viewport test"
              actions={
                <>
                  <button>Save</button>
                  <button>Cancel</button>
                </>
              }
            />
          }
          rail={
            <DocumentShellRail title="Narrow Diagnostics">
              <p>Some diagnostics</p>
            </DocumentShellRail>
          }
        >
          <div data-testid="doc-col-7">
            <p>Document content that should still render</p>
          </div>
        </DocumentShell>
      </div>
    )

    // The shell should render without throwing
    expect(container.querySelector('.document-shell')).toBeInTheDocument()
    expect(screen.getByText('Narrow viewport test')).toBeInTheDocument()
    expect(screen.getByText('Document content that should still render')).toBeInTheDocument()
    expect(screen.getByText('Narrow Diagnostics')).toBeInTheDocument()
  })

  it('renders railBelow variant for mobile stacking', () => {
    const { container } = render(
      <DocumentShell
        topBar={<DocumentShellHeader title="Mobile test" />}
        railBelow
        rail={
          <DocumentShellRail title="Rail">
            <p>Content</p>
          </DocumentShellRail>
        }
      >
        <div data-testid="doc-col-8">Content</div>
      </DocumentShell>
    )

    const rail = container.querySelector('.document-shell__rail')
    expect(rail).toHaveClass('document-shell__rail--below')
  })
})

/* ------------------------------------------------------------------ */
/*  DocumentShellHeader                                              */
/* ------------------------------------------------------------------ */

describe('DocumentShellHeader', () => {
  it('renders title and actions', () => {
    render(
      <DocumentShellHeader
        title="My Record"
        actions={<button data-testid="action">Do thing</button>}
      />
    )

    expect(screen.getByText('My Record')).toBeInTheDocument()
    expect(screen.getByTestId('action')).toBeInTheDocument()
  })

  it('renders plain string breadcrumbs', () => {
    render(
      <DocumentShellHeader
        title="Test"
        breadcrumbs={['Home', 'Schemas', 'person']}
      />
    )

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Schemas')).toBeInTheDocument()
    expect(screen.getByText('person')).toBeInTheDocument()
  })
})

/* ------------------------------------------------------------------ */
/*  DocumentShellRail                                                */
/* ------------------------------------------------------------------ */

describe('DocumentShellRail', () => {
  it('renders with title', () => {
    render(
      <DocumentShellRail title="Related Records">
        <p>Record A</p>
        <p>Record B</p>
      </DocumentShellRail>
    )

    expect(screen.getByText('Related Records')).toBeInTheDocument()
    expect(screen.getByText('Record A')).toBeInTheDocument()
    expect(screen.getByText('Record B')).toBeInTheDocument()
  })

  it('renders without title', () => {
    render(
      <DocumentShellRail>
        <p>Just content</p>
      </DocumentShellRail>
    )

    expect(screen.getByText('Just content')).toBeInTheDocument()
    // No rail title should be present
    expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument()
  })
})
