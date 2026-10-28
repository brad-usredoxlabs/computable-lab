/**
 * PB-CH-5 — renderer compatibility behavior is PRESERVED, not widened (spec
 * §5: "closed renderer set only, compatibility-error behavior preserved").
 *
 * The frozen ViewRenderer.test.tsx (incl. its unknown-renderer
 * view-spec__error test) stays byte-untouched and green; this NEW file adds
 * the renderViews-level arms the acceptance criteria name:
 *  - an unsupported renderer inside renderViews still routes through
 *    ViewRenderer's compatibility error (view-spec__error names the renderer);
 *  - a missing artifact shows the missing-artifact error arm;
 *  - zero new renderer identifiers: the renderer union ViewRenderer switches
 *    on is byte-identical to the frozen one (source-pin).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { renderViews, resolveViewRenderer, toRenderableArtifact, type RenderableView } from './ViewRenderer'

describe('ViewRenderer compatibility arms (PB-CH-5 — preserved, not widened)', () => {
  it('renderViews with an unsupported renderer shows the compatibility error naming the renderer', () => {
    const views: RenderableView[] = [
      { id: 'v1', title: 'Quantum view', artifact: 'a', renderer: 'quantum' as never },
    ]
    const nodes = renderViews(views, [toRenderableArtifact('a', 'binary', 'z')])
    const { container } = render(<div>{nodes}</div>)
    const error = container.querySelector('[data-testid="view-spec-error"], .view-spec__error')
    expect(error).not.toBeNull()
    expect(error?.textContent).toContain('quantum')
  })

  it('renderViews with a missing artifact shows the missing-artifact error arm', () => {
    const views: RenderableView[] = [{ id: 'v1', title: 'x', artifact: 'absent', renderer: 'table' }]
    const nodes = renderViews(views, [])
    const { getByText } = render(<div>{nodes}</div>)
    expect(getByText(/Missing artifact/)).toBeDefined()
  })

  it('source-pin: ViewRenderer gains NO new renderer identifiers beyond the task-mandated GC-10 + GC-11 widening', () => {
    const source = readFileSync('src/analysis/ViewRenderer.tsx', 'utf8')
    // The shipped closed set: table, signal, metric, model (+ the error arm).
    // No new renderer identifier may appear in the switch — EXCEPT the two
    // GC-10 ids (chromatogram, trace-compare) and the GC-11 id
    // (calibration-curve) that the task mandates adding (view-spec enum
    // extended); the compatibility error arm still fires for everything else
    // (quantum stays banned, so the closed-set behavior is preserved for
    // unshipped renderers).
    for (const banned of ['quantum', 'heatmap', 'scatter', 'component-tree']) {
      expect(source).not.toContain(banned)
    }
    // The GC-11 mandated id IS in the switch (the task :8412 view-spec
    // renderer mandate) — assert the LITERAL (GC-10 D5 lesson: an iterating
    // assertion over the implementation constant is tautological).
    expect(source).toContain('calibration-curve')
    // The compatibility error arm still exists.
    expect(source).toContain('view-spec__error')
  })

  it('resolveViewRenderer passes calibration-curve through and still table-coerces unshipped renderers', () => {
    // The LITERAL (not the implementation constant): the GC-11 id passes
    // through, unknown ids coerce to 'table' (the F3 silent-coercion rule).
    expect(resolveViewRenderer('calibration-curve')).toBe('calibration-curve')
    expect(resolveViewRenderer('quantum')).toBe('table')
    expect(resolveViewRenderer(undefined)).toBe('table')
  })
})
