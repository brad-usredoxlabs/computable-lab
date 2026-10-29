/**
 * GC-13 gatefix3 (browser gate2 defect D1 + D2) — the hand-off and the
 * provenance panel carry their OWN stylesheet.
 *
 * The gate2 defect (shots/14-03-g2-handoff-chips.png, partC/shots/20-18-
 * g2-handoff-surface-styling.png): on the GC-12 results surface
 * (/runs/RUN-…) the hand-off rendered COMPLETELY UNSTYLED — chip name /
 * dataKind / actions ran together as plain text, buttons computed
 * margin:0 padding:0 border:0, claim back-links concatenated. Cause: the
 * gc-ev__* / gc-prov__* rules lived in GcEvidenceRunPage.css scoped under
 * the ancestor class .gc-evidence-run, a class ONLY /gc-run/:runId renders
 * (GcEvidenceRunPage.tsx). The GC-12 mount (GcRunSheetSection) therefore
 * got bare markup.
 *
 * Fix: the components import their own stylesheets. jsdom cannot compute
 * external CSS (vitest stubs CSS imports), so the pins here are the
 * module-graph + source-contract form the dispatch names:
 *   1. GcEvidenceHandoff.tsx imports a CSS module of its own (side-effect
 *      import — the wiring that makes the rules reach BOTH mount sites);
 *   2. the hand-off sheet declares the interactive states UNSCOPED — no
 *      .gc-evidence-run ancestor requirement anywhere in the hand-off /
 *      form / panel rules (the GC-12 mount has no such ancestor, so an
 *      ancestor-prefixed rule is exactly the D1 defect);
 *   3. the D2 fix rides the same sheets: the provenance sheet declares
 *      .gc-prov__fact-label / .gc-prov__standards-table cells with REAL
 *      separation (margin on the label; padding on the cells).
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(process.cwd(), 'src')

function readSrc(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8')
}

/** The component's own side-effect CSS import (import './X.css' —
 *  RELATIVE TO THE COMPONENT'S DIR, so resolve it against run/gc/). */
function ownCssImportOf(component: 'GcEvidenceHandoff.tsx' | 'GcProvenancePanel.tsx'): string | null {
  const imp = readSrc(`run/gc/${component}`).match(/^import\s+['"](\.[^'"]*\.css)['"]/m)?.[1]
  if (imp === undefined) return null
  return `run/gc/${imp.replace(/^\.\//, '')}`
}

/** Split a CSS file into rule blocks: `selector-list { body }`.
 *  Comments stripped; the sheets are flat (no nesting). */
function rules(css: string): Array<{ sel: string; body: string }> {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((chunk) => {
      const idx = chunk.indexOf('{')
      if (idx < 0) return null
      const sel = chunk.slice(0, idx).trim()
      const body = chunk.slice(idx + 1).trim()
      return sel !== '' && body !== '' ? { sel, body } : null
    })
    .filter((r): r is { sel: string; body: string } => r !== null)
}

function assertOwnCss(component: 'GcEvidenceHandoff.tsx' | 'GcProvenancePanel.tsx'): string {
  const path = ownCssImportOf(component)
  expect(path, `${component} must side-effect-import a .css module of its own`).not.toBeNull()
  expect(existsSync(resolve(SRC, path ?? '')), `${component}'s own sheet ${path} must exist`).toBe(true)
  return path!
}

describe('GC-13 gatefix3 D1: the hand-off imports its OWN stylesheet', () => {
  it('GcEvidenceHandoff.tsx carries a side-effect CSS import of its own (exists on disk)', () => {
    assertOwnCss('GcEvidenceHandoff.tsx')
  })

  it('GcProvenancePanel.tsx carries a side-effect CSS import of its own (exists on disk)', () => {
    assertOwnCss('GcProvenancePanel.tsx')
  })
})

describe('GC-13 gatefix3 D1: the hand-off rules are UNSCOPED (no .gc-evidence-run ancestor)', () => {
  it('the hand-off sheet declares the interactive states the gate2 shot names (chip, buttons, claim back-links)', () => {
    const css = readSrc(ownCssImportOf('GcEvidenceHandoff.tsx')!)
    // the three affordance classes the gate2 shot measured as unstyled:
    // the chip row, the chip buttons, the claim back-links block.
    expect(css).toContain('.gc-ev__chip')
    expect(css).toContain('.gc-ev__claims')
    expect(css).toMatch(/\.gc-ev__chip\s+button|\.gc-ev\s+button/)
  })

  it('NOT ONE rule in the hand-off sheet is prefixed by the /gc-run-only ancestor .gc-evidence-run', () => {
    const css = readSrc(ownCssImportOf('GcEvidenceHandoff.tsx')!)
    const offenders = rules(css).filter(
      (r) => r.sel.split(',').some((s) => s.trim().startsWith('.gc-evidence-run')),
    )
    expect(offenders.map((r) => r.sel), 'no rule may require the .gc-evidence-run ancestor (D1)').toEqual([])
  })

  it('the provenance panel sheet is equally unscoped (no .gc-evidence-run ancestor)', () => {
    const css = readSrc(ownCssImportOf('GcProvenancePanel.tsx')!)
    const offenders = rules(css).filter(
      (r) => r.sel.split(',').some((s) => s.trim().startsWith('.gc-evidence-run')),
    )
    expect(offenders.map((r) => r.sel), 'no rule may require the .gc-evidence-run ancestor (D1)').toEqual([])
  })

  it('the /gc-run page chrome stays in GcEvidenceRunPage.css (the page is not restyled)', () => {
    // the page's OWN chrome (header/refusal/section) must remain — the
    // defect fix moves the hand-off/panel rules out of the page sheet, it
    // does not restyle what already renders right there.
    const pageCss = readSrc('run/gc/GcEvidenceRunPage.css')
    expect(pageCss).toContain('.gc-evidence-run__section')
    expect(pageCss).toContain('.gc-evidence-run__header')
    expect(pageCss).toContain('.gc-evidence-run__title')
  })
})

describe('GC-13 gatefix3 D2: fact label/value separation + standards-table cells', () => {
  it('the panel sheet declares .gc-prov__fact-label with REAL separation (margin or gap)', () => {
    const css = readSrc(ownCssImportOf('GcProvenancePanel.tsx')!)
    const labelRules = rules(css).filter(
      (r) => r.sel.split(',').some((s) => s.trim() === '.gc-prov__fact-label'),
    )
    expect(labelRules.length, 'the panel sheet must style .gc-prov__fact-label').toBeGreaterThan(0)
    expect(
      labelRules.some((r) => /(^|\s|;)margin|(^|\s|;)gap/.test(r.body)),
      'the label must carry margin/gap — D2 measured margin-right 0px (label runs into the value)',
    ).toBe(true)
  })

  it('the panel sheet declares .gc-prov__standards-table td with padding (columns + flags stop merging)', () => {
    const css = readSrc(ownCssImportOf('GcProvenancePanel.tsx')!)
    const cellRules = rules(css).filter(
      (r) => r.sel.split(',').some((s) => s.trim() === '.gc-prov__standards-table td'),
    )
    expect(cellRules.length, 'the panel sheet must style the standards table cells').toBeGreaterThan(0)
    expect(
      cellRules.some((r) => /(^|\s|;)padding/.test(r.body)),
      'the cells must carry padding — D2 measured zero cell padding ("TEST-CMPD-1"+"1" merged)',
    ).toBe(true)
  })
})
