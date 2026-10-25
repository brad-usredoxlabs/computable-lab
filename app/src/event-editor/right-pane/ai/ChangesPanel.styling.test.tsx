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

// ── CHANGES-UI-1 FIX RUN DEFECT 1 (browser gate, criterion E): the pinned ──
// shorthand must be BOUNDED so it never starves the questions list.
// Measured in-page by the reviewer: `.changes-panel__shorthand` is
// `flex: 0 0 auto` with NO max-height, so the verbatim <pre> pins at its full
// content height (~300-400px) inside a 439-527px section and leaves the
// questions list a 20-106px scroll window over 243-1516px of cards — the
// prompts and the answer controls fall below the window and the page itself
// cannot scroll (documentElement.scrollHeight == innerHeight == 900). The
// reviewer's A/B: flex-shrink:1 does NOT help (min-content floor); ONLY
// bounding the shorthand (max-height + overflow-y:auto) lifted the list to
// 215px. The shorthand stays VISIBLE (spec'd affordance: the verbatim document
// above the proposal) — capped and internally scrollable, never hidden.
describe('Shorthand containment on the clarification pane (CHANGES-UI-1 DEFECT 1)', () => {
  const aiCssSource = readFileSync(resolve(surfaceDir, 'ai.css'), 'utf8')

  /** Pull one rule's declaration block out of a CSS source by selector. */
  function ruleBlock(css: string, selector: string): string {
    const at = css.indexOf(selector)
    expect(at, `missing rule for ${selector}`).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', at)
    const close = css.indexOf('}', open)
    return css.slice(open + 1, close)
  }

  it('.changes-panel__shorthand is BOUNDED: a max-height cap with internal scroll', () => {
    const block = ruleBlock(cssSource, '.changes-panel__shorthand')
    // The cap is what lifts the questions list off its 20-106px sliver.
    // Accepts a plain length or a min() cap (viewport-relative guard).
    expect(block, 'shorthand needs a max-height cap').toMatch(/max-height:\s*(?:\d|min\(\s*\d)/)
    // The capped block must scroll its own overflow, not clip it away.
    expect(block, 'shorthand needs internal scroll').toMatch(/overflow-y:\s*auto/)
    expect(block).toMatch(/overscroll-behavior:\s*contain/)
  })

  it('the shorthand stays a VISIBLE pinned block (still flex:0 0 auto, never hidden/collapsed)', () => {
    const block = ruleBlock(cssSource, '.changes-panel__shorthand')
    // Spec'd affordance: the verbatim document stays above the proposal.
    expect(block).toMatch(/flex:\s*0\s*0\s*auto/)
    expect(block).not.toMatch(/display:\s*none/)
    expect(block).not.toMatch(/visibility:\s*hidden/)
    expect(block).not.toMatch(/max-height:\s*0/)
    expect(block).not.toMatch(/overflow:\s*hidden/)
  })

  it('the questions list keeps its own scroll region (unchanged — its sibling was the problem)', () => {
    const block = ruleBlock(aiCssSource, '.questions-panel__list')
    expect(block).toMatch(/flex:\s*1\s*1\s*auto/)
    expect(block).toMatch(/min-height:\s*0/)
    expect(block).toMatch(/overflow-y:\s*auto/)
  })

  it('the clarification view renders the SAME bounded shorthand component (one rendering home)', () => {
    // DEFECT 1 lives in the shared block, so the fix must land on the shared
    // component — QuestionsPanel renders ChangesPanel's ShorthandView, it does
    // not grow a second shorthand grammar with its own sizing.
    const questionsSource = readFileSync(resolve(surfaceDir, 'QuestionsPanel.tsx'), 'utf8')
    expect(questionsSource).toContain('ShorthandView')
    expect(questionsSource).toContain("from './ChangesPanel'")
    expect(questionsSource).not.toMatch(/questions-panel__shorthand/)
  })
})

// ── CHANGES-UI-1 (D): the changes list must scroll INSIDE the pane ──────────
// Same 2026-09-20 incident as the questions tab: `.ai-tab__section`'s base rule
// is `flex-shrink: 0` and there was NO `.ai-tab__section--changes` rule, so a
// long change list (40+ rows under a shorthand draft) grew the section past the
// pane and pushed the Apply/Discard bar off-screen. The fix mirrors the
// `.ai-tab__section--questions` / `.questions-panel__list` precedent in the
// same file: the section flexes, `.changes-panel` fills it, and
// `.changes-panel__diff` is the single scrolling region with the actions bar
// pinned outside it.
describe('ChangesPanel scroll containment (CHANGES-UI-1 D)', () => {
  const aiCssSource = readFileSync(resolve(surfaceDir, 'ai.css'), 'utf8')

  /** Pull one rule's declaration block out of a CSS source by selector. */
  function ruleBlock(css: string, selector: string): string {
    const at = css.indexOf(selector)
    expect(at, `missing rule for ${selector}`).toBeGreaterThanOrEqual(0)
    const open = css.indexOf('{', at)
    const close = css.indexOf('}', open)
    return css.slice(open + 1, close)
  }

  it('ai.css gives the changes section the --questions flex treatment (flex:1, min-height:0)', () => {
    const block = ruleBlock(aiCssSource, '.ai-tab__section--changes')
    expect(block).toMatch(/flex:\s*1/)
    expect(block).toMatch(/min-height:\s*0/)
    expect(block).toMatch(/display:\s*flex/)
    expect(block).toMatch(/flex-direction:\s*column/)
  })

  it('.changes-panel fills its section as a flex column (mirrors .questions-panel)', () => {
    const block = ruleBlock(cssSource, '.changes-panel')
    expect(block).toMatch(/display:\s*flex/)
    expect(block).toMatch(/flex-direction:\s*column/)
    expect(block).toMatch(/min-height:\s*0/)
    expect(block).toMatch(/height:\s*100%/)
  })

  it('.changes-panel__diff is THE scrolling region (overflow-y auto, overscroll contained)', () => {
    const block = ruleBlock(cssSource, '.changes-panel__diff')
    expect(block).toMatch(/flex:\s*1\s+1\s+auto/)
    expect(block).toMatch(/min-height:\s*0/)
    expect(block).toMatch(/overflow-y:\s*auto/)
    expect(block).toMatch(/overscroll-behavior:\s*contain/)
  })

  it('the actions bar stays pinned outside the scroll region (flex:0 0 auto)', () => {
    const block = ruleBlock(cssSource, '.changes-panel__actions')
    expect(block).toMatch(/flex:\s*0\s*0\s*auto/)
  })

  it('renders a 40+ row draft without dropping rows, and the diff container is the scroll region', () => {
    const rows = Array.from({ length: 42 }, (_, i) => ({
      op: 'add' as const,
      description: `add_material · A${i + 1} · compound ${i + 1} · 100 uL`,
    }))
    render(
      <ChangesPanel
        changes={rows}
        warnings={[]}
        onApply={() => undefined}
        onDiscard={() => undefined}
      />,
    )
    const diff = document.querySelector('.changes-panel__diff')
    expect(diff).not.toBeNull()
    expect(diff!.querySelectorAll('.changes-panel__change')).toHaveLength(42)
    // The actions bar is a SIBLING of the diff (outside the scrolling region),
    // not inside it — it can never be scrolled/pushed away.
    const actions = screen.getByTestId('changes-apply').closest('.changes-panel__actions')
    expect(actions).not.toBeNull()
    expect(actions!.parentElement).toBe(diff!.parentElement)
    expect(actions!.parentElement?.querySelector('.changes-panel__diff')?.contains(actions!)).toBe(false)
    cleanup()
  })
})
