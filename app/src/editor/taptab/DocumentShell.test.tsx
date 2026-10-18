/**
 * Focused UI render tests for the DocumentShell component.
 *
 * Covers:
 *  - top control bar renders
 *  - document column renders
 *  - secondary rail / diagnostics area renders
 *  - narrow-width render does not explode
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DocumentShell, DocumentShellHeader, DocumentShellRail } from './DocumentShell'

// Clean up after each test to prevent DOM pollution between tests
afterEach(() => {
  cleanup()
  // Prevent a persisted rail width from leaking into a later test's restore
  localStorage.removeItem('cl-registry-rail-width')
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

/* ------------------------------------------------------------------ */
/*  DocumentShell — width posture (plan Task 5)                       */
/* ------------------------------------------------------------------ */

describe('DocumentShell width mode', () => {
  it('defaults to the prose (capped) column', () => {
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />}>
        <div>content</div>
      </DocumentShell>,
    )
    const shell = screen.getByRole('banner').parentElement!
    expect(shell.className).toContain('document-shell')
    expect(shell.className).not.toContain('document-shell--width-full')
  })

  it('width="full" lets the editing column fill the pane', () => {
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} width="full">
        <div>content</div>
      </DocumentShell>,
    )
    const shell = screen.getByRole('banner').parentElement!
    expect(shell.className).toContain('document-shell--width-full')
  })
})

/* ------------------------------------------------------------------ */
/*  DocumentShell — opt-in draggable rail (plan Task 15)              */
/* ------------------------------------------------------------------ */

describe('DocumentShell resizable rail', () => {
  it('has no drag handle by default (fixed rail everywhere else)', () => {
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>}>
        <div>content</div>
      </DocumentShell>,
    )
    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('railResizable renders a vertical splitter before the rail', () => {
    render(
      <DocumentShell
        topBar={<DocumentShellHeader title="T" />}
        rail={<div>rail</div>}
        railResizable
      >
        <div>content</div>
      </DocumentShell>,
    )
    const splitter = screen.getByRole('separator')
    expect(splitter.getAttribute('aria-orientation')).toBe('vertical')
    expect(splitter.className).toBe('document-shell__rail-resizer')
  })

  it('railBelow suppresses the splitter', () => {
    render(
      <DocumentShell
        topBar={<DocumentShellHeader title="T" />}
        rail={<div>rail</div>}
        railResizable
        railBelow
      >
        <div>content</div>
      </DocumentShell>,
    )
    expect(screen.queryByRole('separator')).toBeNull()
  })

  /* Clamp behaviour: jsdom reports zero rects for every element, so stub
   * getBoundingClientRect at the prototype level BEFORE mount — the
   * restore-on-mount clamp reads the body rect during the effect, so a
   * post-render per-element stub would be too late. */
  const realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
  const stubRectWidth = (width: number) => {
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        width,
        height: 600,
        top: 0,
        left: 0,
        right: width,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }
    }
  }
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realGetBoundingClientRect
  })

  const dragTo = (clientX: number) => {
    fireEvent.pointerDown(screen.getByRole('separator'))
    fireEvent(document, new PointerEvent('pointermove', { clientX }))
  }

  it('drag clamps the rail to a 220px minimum', () => {
    stubRectWidth(1000)
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    const body = document.querySelector('.document-shell__body') as HTMLElement
    dragTo(950) // rect.right - clientX = 50 → below the 220 floor
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('220px')
  })

  it('drag clamps the rail to 40% of the body maximum', () => {
    stubRectWidth(1000)
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    const body = document.querySelector('.document-shell__body') as HTMLElement
    dragTo(100) // rect.right - clientX = 900 → above the 400 ceiling
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('400px')
  })

  it('restores a persisted width on mount, re-clamped (hostile stored value)', () => {
    localStorage.setItem('cl-registry-rail-width', '99999')
    stubRectWidth(1000)
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    // A hostile 99999 must NEVER land raw: the [220, 40%*1000] clamp resolves
    // it to the 400px ceiling (AS-ORCH-L1-167 clamp-on-restore).
    const body = document.querySelector('.document-shell__body') as HTMLElement
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('400px')
  })

  it('restores a persisted width on mount when it is within bounds', () => {
    localStorage.setItem('cl-registry-rail-width', '260')
    stubRectWidth(1000)
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    const body = document.querySelector('.document-shell__body') as HTMLElement
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('260px')
    // 260 is inside [220, 400]; a keyboard nudge continues from it.
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' })
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('276px')
  })

  it('keyboard ArrowLeft widens the rail by 16px and persists (rail is right-anchored)', () => {
    stubRectWidth(1000)
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    const body = document.querySelector('.document-shell__body') as HTMLElement
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' })
    // No stored width → base is the 320px default → 320 + 16 = 336
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('336px')
    expect(localStorage.getItem('cl-registry-rail-width')).toBe('336')
  })

  it('keyboard ArrowRight narrows the rail by 16px and persists', () => {
    stubRectWidth(1000)
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    const body = document.querySelector('.document-shell__body') as HTMLElement
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('304px')
    expect(localStorage.getItem('cl-registry-rail-width')).toBe('304')
  })

  it('drag persists the rounded width to cl-registry-rail-width on pointerup', () => {
    stubRectWidth(1000)
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    const body = document.querySelector('.document-shell__body') as HTMLElement
    dragTo(650) // 350px — inside the clamp
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('350px')
    expect(localStorage.getItem('cl-registry-rail-width')).toBeNull() // not per-frame
    fireEvent(document, new PointerEvent('pointerup', { clientX: 650 }))
    expect(localStorage.getItem('cl-registry-rail-width')).toBe('350')
  })

  it('toggles cl-rail-dragging on document.body during the drag', () => {
    stubRectWidth(1000)
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    dragTo(650)
    expect(document.body.classList.contains('cl-rail-dragging')).toBe(true)
    fireEvent(document, new PointerEvent('pointerup', { clientX: 650 }))
    expect(document.body.classList.contains('cl-rail-dragging')).toBe(false)
  })

  it('pointerup with NO movement does not persist a pointer-derived width (O1)', () => {
    // A click on the splitter is not a resize. The gate observed rendered 320 /
    // stored 347: a down+up at the same point persisted rect.right - clientX.
    stubRectWidth(1000)
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    const body = document.querySelector('.document-shell__body') as HTMLElement
    fireEvent.pointerDown(screen.getByRole('separator'), { clientX: 653 }) // 1000-653 = 347
    fireEvent(document, new PointerEvent('pointerup', { clientX: 653 }))
    expect(localStorage.getItem('cl-registry-rail-width')).toBeNull()
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('')
  })
})

/* ------------------------------------------------------------------ */
/*  DocumentShell — settle-aware restore clamp (REG-2 FIX1 / D1)      */
/* ------------------------------------------------------------------ */

describe('DocumentShell settle-aware rail restore', () => {
  /* jsdom reports zero rects and ships no ResizeObserver. Stub the rect with a
   * MUTABLE width so the body can report a PRE-SETTLE width at mount and the
   * SETTLED width once the test fires the resize notification, and install a
   * mock ResizeObserver the test can trigger by hand. */
  const realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
  const realResizeObserver = (globalThis as Record<string, unknown>).ResizeObserver

  let rectWidth = 1000
  class MockResizeObserver {
    static instances: MockResizeObserver[] = []
    private readonly observed: Element[] = []
    constructor(
      private readonly callback: (
        entries: Array<{ target: Element }>,
        observer: MockResizeObserver,
      ) => void,
    ) {
      MockResizeObserver.instances.push(this)
    }
    observe(target: Element): void {
      this.observed.push(target)
    }
    disconnect(): void {
      /* nothing to release in the mock */
    }
    trigger(): void {
      this.callback(this.observed.map((target) => ({ target })), this)
    }
  }

  const stubMutableRect = () => {
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        width: rectWidth,
        height: 600,
        top: 0,
        left: 0,
        right: rectWidth,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }
    }
  }
  const settleTo = (settledWidth: number) => {
    rectWidth = settledWidth
    const observer = MockResizeObserver.instances[MockResizeObserver.instances.length - 1]
    observer?.trigger()
  }

  const g_setResizeObserver = (ctor: unknown) => {
    ;(globalThis as Record<string, unknown>).ResizeObserver = ctor
  }

  beforeEach(() => {
    MockResizeObserver.instances = []
    g_setResizeObserver(MockResizeObserver)
  })

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realGetBoundingClientRect
    const g = globalThis as Record<string, unknown>
    if (realResizeObserver === undefined) delete g.ResizeObserver
    else g.ResizeObserver = realResizeObserver
    MockResizeObserver.instances = []
  })

  it('restores the stored width against the SETTLED body, not the pre-settle clamp', () => {
    localStorage.setItem('cl-registry-rail-width', '250')
    rectWidth = 574.47 // pre-settle body: 40% = 229.788 — the D1 defect bound
    stubMutableRect()
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    const body = document.querySelector('.document-shell__body') as HTMLElement
    // Sequence pin: the mount-time apply still clamps against the rect it has.
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('229.788px')
    // The body settles wider; the persisted 250 fits 40% of 640 = 256.
    settleTo(640)
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('250px')
  })

  it('re-clamps the stored width DOWN when the settled body is narrower (bound shrinks, value stays authoritative)', () => {
    localStorage.setItem('cl-registry-rail-width', '250')
    rectWidth = 1000
    stubMutableRect()
    render(
      <DocumentShell topBar={<DocumentShellHeader title="T" />} rail={<div>rail</div>} railResizable>
        <div>content</div>
      </DocumentShell>,
    )
    const body = document.querySelector('.document-shell__body') as HTMLElement
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('250px')
    // Settled narrower: 40% = 200 < 220 — the max bound wins ties (documented
    // clamp order), so the bound shrinks the applied width to 200.
    settleTo(500)
    expect(body.style.getPropertyValue('--shell-rail-width')).toBe('200px')
  })
})
