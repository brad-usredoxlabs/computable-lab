/**
 * PROTO-AI-14 F1 (red-first): ChangesPanel must be theme-token styled.
 *
 * The component used ~17 `changes-panel__*` class references with ZERO CSS
 * definitions under app/src — Accept/Reject rendered as jammed plain text and
 * the apply-error (role=alert) was unstyled. Per the settings-surface
 * precedent (commit 8e14b061 "theme-token the settings surfaces"), the panel
 * gets a per-surface `ChangesPanel.css` next to the component, imported by it,
 * reading ONLY the --cl-* design tokens so light AND dark themes both work.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ChangesPanel } from './ChangesPanel'
import type { ProtocolEditDiff } from './sidebarState'

// Read the sources from disk (vitest runs with cwd = the app root; note a
// `?raw` CSS import returns empty under vitest because CSS processing is
// disabled, so a plain fs read is the reliable way to assert the hooks).
const surfaceDir = resolve(process.cwd(), 'src/event-editor/right-pane/ai')
const componentSource = readFileSync(resolve(surfaceDir, 'ChangesPanel.tsx'), 'utf8')
const cssSource = readFileSync(resolve(surfaceDir, 'ChangesPanel.css'), 'utf8')

/** Every distinct changes-panel__* class the component renders (enumerated
 *  from ChangesPanel.tsx itself — the F1 inventory). */
const REQUIRED_SELECTORS = [
  '.changes-panel',
  '.changes-panel__actions',
  '.changes-panel__btn',
  '.changes-panel__btn--apply',
  '.changes-panel__btn--discard',
  '.changes-panel__applying',
  '.changes-panel__apply-error',
  '.changes-panel__warning',
  '.changes-panel__warnings',
  '.changes-panel__warning--info',
  '.changes-panel__warning--warning',
  '.changes-panel__warning--error',
  '.changes-panel__change',
  '.changes-panel__change--add',
  '.changes-panel__change--modify',
  '.changes-panel__change--remove',
  '.changes-panel__change-desc',
  '.changes-panel__change-prefix',
  '.changes-panel__diff',
  '.changes-panel__protocol',
  '.changes-panel__protocol-target',
]

describe('ChangesPanel styling hooks (PROTO-AI-14 F1)', () => {
  it('ChangesPanel.tsx imports its per-surface ChangesPanel.css', () => {
    expect(componentSource).toContain("import './ChangesPanel.css'")
  })

  it('ChangesPanel.css defines a rule for every changes-panel__* class the component uses', () => {
    for (const selector of REQUIRED_SELECTORS) {
      expect(cssSource, `missing rule for ${selector}`).toContain(selector)
    }
  })

  it('ChangesPanel.css is token-only: every color/border reads a --cl-* design token (8e14b061 precedent)', () => {
    // No hardcoded hex/rgb/hsl colors — the theme switch (.cl-app[data-theme='light'])
    // must be able to re-skin the panel purely through the tokens.
    expect(cssSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(cssSource).not.toMatch(/\brgba?\(/)
    expect(cssSource).not.toMatch(/\bhsla?\(/)
    expect(cssSource).toContain('var(--cl-')
    // The alert and the primary action read the semantic status tokens.
    expect(cssSource).toContain('var(--cl-danger-soft)')
    expect(cssSource).toContain('var(--cl-danger-border)')
    expect(cssSource).toContain('var(--cl-accent)')
    expect(cssSource).toContain('var(--cl-on-accent)')
  })

  it('renders Accept/Reject through the styled button classes in protocol mode', () => {
    const protocolDiff: ProtocolEditDiff = {
      protocol: { recordId: 'PROT-1', title: 'Assay' },
      ops: [{ op: 'modify', target: { type: 'step', stepId: 'step-a' }, after: { label: 'A' } }],
    }
    render(
      <ChangesPanel
        changes={[]}
        warnings={[]}
        onApply={() => undefined}
        onDiscard={() => undefined}
        protocolDiff={protocolDiff}
      />,
    )
    const accept = screen.getByTestId('changes-apply')
    const reject = screen.getByRole('button', { name: 'Reject' })
    expect(accept.className).toContain('changes-panel__btn--apply')
    expect(reject.className).toContain('changes-panel__btn--discard')
    cleanup()
  })

  it('the apply-error alert element carries the alert-styled class', () => {
    render(
      <ChangesPanel
        changes={[]}
        warnings={[]}
        onApply={() => undefined}
        onDiscard={() => undefined}
        protocolDiff={{
          protocol: { recordId: 'PROT-1' },
          ops: [{ op: 'modify', target: { type: 'step', stepId: 'step-a' }, after: { label: 'A' } }],
        }}
        applyError='stale sha'
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('changes-panel__apply-error')
  })
})
