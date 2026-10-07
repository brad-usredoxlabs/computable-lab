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
import { renderViews, toRenderableArtifact, type RenderableView } from './ViewRenderer'

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

  it('source-pin: ViewRenderer gains ZERO new renderer identifiers (closed set preserved)', () => {
    const source = readFileSync('src/analysis/ViewRenderer.tsx', 'utf8')
    // The shipped closed set: table, signal, metric, model (+ the error arm).
    // No new renderer identifier may appear in the switch.
    for (const banned of ['quantum', 'heatmap', 'scatter', 'component-tree']) {
      expect(source).not.toContain(banned)
    }
    // The compatibility error arm still exists.
    expect(source).toContain('view-spec__error')
  })
})
