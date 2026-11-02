/**
 * The generic `artifact-table` renderer (the 2026-11-01 OQ-1 id; OQ-3
 * binding convention).
 *
 * These are the W2 legs (a)-(g) of the spec, written RED-first BEFORE
 * the one enum commit mints the id at all five sites (schema enum, TS
 * union, page whitelist, dispatch arm, compat source-pin).
 *
 * What this renderer must be (the capability contract is the OQ-3 ruling):
 *  - DOMAIN-FREE and DATA-DRIVEN: the view-spec's `bindings` NAME payload
 *    fields (columns / captionFrom / warningsFrom / warningTextField); the
 *    artifact PAYLOAD carries the values. The TS renders strings where the
 *    bindings say to — zero state-word comparisons (bait #3b), zero baked
 *    column lists (bait #6), zero normalization (R8).
 *  - Every arm is reachable by a real payload shape (the dead-chrome rule);
 *    an unrequested slot is simply ABSENT (no placeholder, no disabled block).
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewRenderer, resolveViewRenderer, toRenderableArtifact, type RenderableArtifact } from './ViewRenderer'

function artifactTable(
  inlineValue: unknown,
  extra?: Partial<RenderableArtifact>,
): RenderableArtifact {
  return {
    id: 'AOUT-F6',
    name: 'report_payload',
    dataKind: 'table',
    ...(inlineValue !== undefined ? { inlineValue } : {}),
    ...extra,
  }
}

describe('ViewRenderer artifact-table arm (generic artifact-report renderer)', () => {
  // (a) dispatch renders the LITERAL id 'artifact-table' through to the
  // generic artifact-table arm — not table-coerced, not the error arm.
  it('(a) dispatch renders the literal id "artifact-table" to the generic arm', () => {
    render(
      <ViewRenderer
        view={{ id: 'v1', title: 'Report', artifact: 'report_payload', renderer: 'artifact-table' }}
        artifact={artifactTable({
          columns: ['label', 'area'],
          rows: [{ label: 'row-a', area: 1 }],
        })}
      />,
    )
    expect(screen.getByTestId('view-spec-artifact-table')).toBeDefined()
    expect(screen.getByText('row-a')).toBeDefined()
  })

  // (b) resolveViewRenderer passes the new id through (no silent table-
  // coercion, the GC-9 trap) and still coerces unshipped renderers.
  it('(b) resolveViewRenderer passes "artifact-table" through; "quantum" still coerces to table', () => {
    expect(resolveViewRenderer('artifact-table')).toBe('artifact-table')
    expect(resolveViewRenderer('quantum')).toBe('table')
  })

  // (c) the closed-set behavior is preserved: an unknown renderer still hits
  // the VISIBLE compatibility error arm naming the renderer (the frozen
  // ViewRenderer.test.tsx leg stays green; this is the arm-level mirror).
  it('(c) an unknown renderer still shows the visible compatibility error naming it', () => {
    render(
      <ViewRenderer
        view={{ id: 'v1', title: 'x', artifact: 'a', renderer: 'quantum' as never }}
        artifact={toRenderableArtifact('a', 'binary', 'z')}
      />,
    )
    const err = screen.getByTestId('view-spec-error')
    expect(err).toHaveTextContent('quantum')
  })

  // (d) missing/blank/empty-rows payloads each render the NAMED empty arm
  // (TableView 'No rows' parity, :78) — never a silent blank. (One render
  // per `it` — this suite's queries run against the shared document body.)
  it('(d) a missing payload renders the named empty arm', () => {
    render(
      <ViewRenderer
        view={{ id: 'v1', title: 'R', artifact: 'report_payload', renderer: 'artifact-table' }}
        artifact={artifactTable(undefined)}
      />,
    )
    expect(screen.getByTestId('view-spec-artifact-table-empty')).toHaveTextContent('No rows')
  })

  it('(d) a blank (null) payload renders the named empty arm', () => {
    render(
      <ViewRenderer
        view={{ id: 'v1', title: 'R', artifact: 'report_payload', renderer: 'artifact-table' }}
        artifact={artifactTable(null)}
      />,
    )
    expect(screen.getByTestId('view-spec-artifact-table-empty')).toHaveTextContent('No rows')
  })

  it('(d) an empty-rows declared payload renders the named empty arm', () => {
    render(
      <ViewRenderer
        view={{ id: 'v1', title: 'R', artifact: 'report_payload', renderer: 'artifact-table' }}
        artifact={artifactTable({ columns: ['label'], rows: [] })}
      />,
    )
    expect(screen.getByTestId('view-spec-artifact-table-empty')).toHaveTextContent('No rows')
  })
  // (e) an arbitrary state STRING from the payload renders as VISIBLE table
  // text — the provisional-row guarantee. No TS branch decides which states
  // exist; whatever string the payload carries at the column's key renders.
  it('(e) an arbitrary state string from the payload renders as visible cell text', () => {
    render(
      <ViewRenderer
        view={{
          id: 'v1',
          title: 'R',
          artifact: 'report_payload',
          renderer: 'artifact-table',
          bindings: { columns: ['label', 'state'] },
        }}
        artifact={artifactTable({
          columns: ['label', 'state'],
          rows: [{ label: 'row-a', state: 'arbitrary-state-token' }],
        })}
      />,
    )
    const cell = screen.getByText('arbitrary-state-token')
    expect(cell.closest('td')).not.toBeNull()
  })

  // (f) the bindings-named column subset renders in the DECLARED order —
  // the selection is DATA (the binding), never a baked TS list.
  it('(f) the bindings columns subset renders in declared order, excluding unbound columns', () => {
    render(
      <ViewRenderer
        view={{
          id: 'v1',
          title: 'R',
          artifact: 'report_payload',
          renderer: 'artifact-table',
          bindings: { columns: ['mid', 'zeta'] },
        }}
        artifact={artifactTable({
          columns: ['zeta', 'alpha', 'mid'],
          rows: [{ zeta: 'z1', alpha: 'a1', mid: 'm1' }],
        })}
      />,
    )
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['mid', 'zeta'])
    expect(screen.queryByText('a1')).toBeNull()
  })

  // (g) the OQ-3 binding convention slots: captionFrom renders the payload
  // string as a visible caption line ABOVE the table; warningsFrom renders
  // each entry as a visible warning line BELOW the table (plain-string
  // entries as-is; record entries via the warningTextField-named property).
  // With the bindings absent, neither slot renders — the plain table is
  // TableView-identical content.
  describe('(g) caption/warning slots (OQ-3 binding convention)', () => {
    const payload = {
      columns: ['label', 'value'],
      rows: [{ label: 'r1', value: 1 }],
      basis: 'denominator: eligible set (n=4)',
      warnings: [
        { bucket: 'excluded', reason: 'peak unresolved' },
        { bucket: 'unresolved', reason: 'below reporting limit' },
      ],
    }

    it('renders the captionFrom string above the table and each warning line below it', () => {
      render(
        <ViewRenderer
          view={{
            id: 'v1',
            title: 'R',
            artifact: 'report_payload',
            renderer: 'artifact-table',
            bindings: { captionFrom: 'basis', warningsFrom: 'warnings', warningTextField: 'reason' },
          }}
          artifact={artifactTable(payload)}
        />,
      )
      expect(screen.getByTestId('view-spec-artifact-table-caption')).toHaveTextContent(
        'denominator: eligible set (n=4)',
      )
      const warnings = screen.getAllByTestId('view-spec-artifact-table-warning')
      expect(warnings.map((w) => w.textContent)).toEqual(['peak unresolved', 'below reporting limit'])
    })

    it('renders plain-string warning entries as-is when warningTextField is absent', () => {
      render(
        <ViewRenderer
          view={{
            id: 'v1',
            title: 'R',
            artifact: 'report_payload',
            renderer: 'artifact-table',
            bindings: { warningsFrom: 'warnings' },
          }}
          artifact={artifactTable({
            columns: ['label'],
            rows: [{ label: 'r1' }],
            warnings: ['one warning', 'two warning'],
          })}
        />,
      )
      const warnings = screen.getAllByTestId('view-spec-artifact-table-warning')
      expect(warnings.map((w) => w.textContent)).toEqual(['one warning', 'two warning'])
    })

    it('with no bindings, neither slot renders and the table content is TableView-identical', () => {
      const { container } = render(
        <ViewRenderer
          view={{ id: 'v1', title: 'R', artifact: 'report_payload', renderer: 'artifact-table' }}
          artifact={artifactTable(payload)}
        />,
      )
      expect(container.querySelector('[data-testid="view-spec-artifact-table-caption"]')).toBeNull()
      expect(container.querySelector('[data-testid="view-spec-artifact-table-warnings"]')).toBeNull()
      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
      expect(headers).toEqual(['label', 'value'])
      expect(screen.getByText('r1')).toBeDefined()
    })

    it('a binding naming an absent payload field renders NOTHING (no placeholder)', () => {
      const { container } = render(
        <ViewRenderer
          view={{
            id: 'v1',
            title: 'R',
            artifact: 'report_payload',
            renderer: 'artifact-table',
            bindings: { captionFrom: 'basis', warningsFrom: 'warnings' },
          }}
          artifact={artifactTable({ columns: ['label'], rows: [{ label: 'r1' }] })}
        />,
      )
      expect(container.querySelector('[data-testid="view-spec-artifact-table-caption"]')).toBeNull()
      expect(container.querySelector('[data-testid="view-spec-artifact-table-warnings"]')).toBeNull()
    })

    it('a binding naming a blank payload field renders NOTHING (no placeholder)', () => {
      const { container } = render(
        <ViewRenderer
          view={{
            id: 'v1',
            title: 'R',
            artifact: 'report_payload',
            renderer: 'artifact-table',
            bindings: { captionFrom: 'basis' },
          }}
          artifact={artifactTable({ columns: ['label'], rows: [{ label: 'r1' }], basis: '   ' })}
        />,
      )
      expect(container.querySelector('[data-testid="view-spec-artifact-table-caption"]')).toBeNull()
    })
  })
})
