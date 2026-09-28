/**
 * Tests for the standalone read-only evidence viewer.
 *
 * TDD: these were written against the mount() contract before Viewer/index
 * existed. They exercise the public surface only: mount(element, opts) ->
 * {destroy()}, apiVersion, and fail-closed behavior.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { apiVersion, mount } from './index'
import { evidenceV1, evidenceV1With } from './__fixtures__/evidence-v1'
import type { UntrustedEvidenceDocument } from './types'

/** Host stub: only sanctioned artifact ids resolve to same-origin URLs. */
function resolver(allowed: Record<string, string>) {
  return (id: string) => allowed[id]
}

const authorized = resolver({
  'art-graph': '/artifacts/art-graph.json',
  'art-pdf': '/artifacts/report.pdf',
})

let container: HTMLDivElement

afterEach(() => {
  cleanup()
  container?.remove()
})

function mountViewer(
  doc: UntrustedEvidenceDocument = evidenceV1,
  resolve = authorized,
) {
  container = document.createElement('div')
  document.body.appendChild(container)
  return mount(container, { document: doc, resolveArtifact: resolve })
}

describe('evidence viewer', () => {
  it('exports apiVersion 1', () => {
    expect(apiVersion).toBe(1)
  })

  it('renders barcode and sample_id', () => {
    mountViewer()
    expect(container.textContent).toContain('BX-9912-XY')
    expect(container.textContent).toContain('SAMPLE-042')
    expect(container.textContent).toContain('tyf.evidence/1')
  })

  it('clicking an event reveals its linked records (type + JSON data)', async () => {
    mountViewer()
    const buttons = [...container.querySelectorAll('button')]
    const evtButton = buttons.find((b) => b.textContent?.includes('evt-1'))
    expect(evtButton).toBeDefined()
    evtButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await Promise.resolve()
    // Records resolved via event.record_ids -> records[]
    const text = container.textContent ?? ''
    expect(text).toContain('rec-1')
    expect(text).toContain('rec-2')
    expect(text).toContain('fluorescence-read')
    expect(text).toContain('4213')
    // evt-2's record is not shown
    expect(text).not.toContain('rec-3')
  })

  it('artifact not returned by resolveArtifact renders disabled, never a link', () => {
    mountViewer()
    const links = [...container.querySelectorAll('a')]
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/artifacts/report.pdf')
    expect(hrefs.some((h) => h?.includes('evil') || h?.includes('not-authorized'))).toBe(false)

    // The 'evil' artifact entry exists but is not an anchor and is marked disabled
    const disabledEntries = [...container.querySelectorAll('[data-disabled="true"]')]
    expect(disabledEntries.some((el) => el.textContent?.includes('not-authorized.zip'))).toBe(true)
    for (const el of disabledEntries) {
      expect(el.tagName).not.toBe('A')
    }
  })

  it('viewer_version mismatch (99): fail-closed banner, downloads still rendered', () => {
    mountViewer(evidenceV1With({ viewer_version: 99 }))
    const text = container.textContent ?? ''
    expect(text).toMatch(/unsupported evidence version/i)
    // Downloads remain usable: authorized artifacts still render as links
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/artifacts/report.pdf')
    expect(hrefs).toContain('/artifacts/art-graph.json')
    // Per spec: viewer_version mismatch still renders events/records content
    const evtButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('evt-1'),
    )
    expect(evtButton).toBeDefined()
  })

  it('schema_version mismatch: content panes blank, artifact list remains', () => {
    mountViewer(evidenceV1With({ schema_version: 'tyf.evidence/2' }))
    const text = container.textContent ?? ''
    expect(text).toMatch(/unsupported evidence version/i)
    // Fully closed: no events/records rendered
    expect(text).not.toContain('evt-1')
    expect(text).not.toContain('fluorescence-read')
    // But downloads stay listed
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/artifacts/report.pdf')
  })

  it('destroy() empties the mount element', () => {
    const handle = mountViewer()
    expect(container.innerHTML).not.toBe('')
    handle.destroy()
    expect(container.innerHTML).toBe('')
  })

  it('destroy() is idempotent', () => {
    const handle = mountViewer()
    handle.destroy()
    expect(() => handle.destroy()).not.toThrow()
  })

  it('renders injected HTML payloads as escaped text, never live elements', async () => {
    const evil = '<img src=x onerror=alert(1)>'
    mountViewer(
      evidenceV1With({
        records: [
          {
            id: 'rec-1',
            type: 'fluorescence-read',
            sample_id: 'SAMPLE-042',
            data: { note: evil },
          },
        ],
      }),
    )
    const evtButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('evt-1'),
    )
    evtButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    expect(container.querySelector('img')).toBeNull()
    // The payload is present only as inert text
    expect(container.textContent).toContain('onerror')
  })
})
