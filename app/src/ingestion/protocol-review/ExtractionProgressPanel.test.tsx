/**
 * ExtractionProgressPanel + the SSE frame parser.
 *
 * The parser is the part that must be exact: network chunks split SSE frames
 * arbitrarily, so a parser that assumes whole frames loses the reasoning text
 * (or the final result) exactly when a long run is streaming hardest.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { parseSseBlocks } from '../../shared/api/client'
import ExtractionProgressPanel from './ExtractionProgressPanel'

afterEach(cleanup)

describe('parseSseBlocks', () => {
  it('parses complete frames and keeps the partial tail for the next read', () => {
    const first = 'data: {"type":"start","chunks":2}\n\ndata: {"type":"stage","index":1}\n\ndata: {"type":"rea'
    const parsed = parseSseBlocks(first)
    expect(parsed.events).toEqual([{ type: 'start', chunks: 2 }, { type: 'stage', index: 1 }])
    expect(parsed.rest).toBe('data: {"type":"rea')

    const second = parseSseBlocks(`${parsed.rest}soning","text":"hmm"}\n\n`)
    expect(second.events).toEqual([{ type: 'reasoning', text: 'hmm' }])
    expect(second.rest).toBe('')
  })

  it('ignores comments, [DONE], and malformed frames without dropping later ones', () => {
    const parsed = parseSseBlocks('data: [DONE]\n\ndata: not-json\n\ndata: {"type":"done"}\n\n')
    expect(parsed.events).toEqual([{ type: 'done' }])
  })
})

describe('ExtractionProgressPanel', () => {
  it('shows stage, elapsed, liveness and the streamed reasoning while running', () => {
    render(
      <ExtractionProgressPanel
        running
        stage="Extracting chunk 1 of 3 (12,345 characters)"
        log={[{ kind: 'note', text: 'stage 1' }, { kind: 'reasoning', text: 'Thinking about step 1… ' }]}
        elapsedMs={42_000}
        sinceLastEventMs={3_000}
        canStart={false}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        error={null}
        note={null}
      />,
    )
    const status = screen.getByTestId('extraction-status').textContent ?? ''
    expect(status).toContain('Extracting chunk 1 of 3')
    expect(status).toContain('42s elapsed')
    expect(status).toContain('last event 3s ago')
    expect(screen.getByTestId('extraction-reasoning').textContent).toContain('Thinking about step 1…')
    // running ⇒ the button cancels rather than starts
    expect(screen.getByTestId('vpdf-extract-cancel')).toBeTruthy()
    expect(screen.queryByTestId('vpdf-extract')).toBeNull()
  })

  it('says the model is quiet but the connection is fine (never a silent hang)', () => {
    render(
      <ExtractionProgressPanel
        running
        stage="Extracting chunk 1 of 1 (900,000 characters)"
        log={[]}
        elapsedMs={90_000}
        sinceLastEventMs={40_000}
        canStart={false}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        error={null}
        note={null}
      />,
    )
    expect(screen.getByTestId('extraction-status').textContent).toContain('still connected')
  })

  it('labels the last stage once the run has stopped (no phantom "Extracting…")', () => {
    render(
      <ExtractionProgressPanel
        running={false}
        stage="Extracting chunk 2 of 6 (9,840 characters)"
        log={[{ kind: 'note', text: 'chunk 1 done\n' }]}
        elapsedMs={76_000}
        sinceLastEventMs={null}
        canStart
        onStart={vi.fn()}
        onCancel={vi.fn()}
        error={null}
        note="Extraction cancelled."
      />,
    )
    expect(screen.getByTestId('extraction-status').textContent).toContain('Last stage: Extracting chunk 2 of 6')
    expect(screen.getByTestId('extraction-status').textContent).not.toContain('elapsed')
  })

  it('carries no model or thinking control — that is a deployment setting', () => {
    render(
      <ExtractionProgressPanel
        running={false}
        stage={null}
        log={[]}
        elapsedMs={0}
        sinceLastEventMs={null}
        canStart
        onStart={vi.fn()}
        onCancel={vi.fn()}
        error="UNKNOWN_THINKING_LEVEL: unknown thinking level"
        note="cancelled"
      />,
    )
    expect(screen.getByTestId('extraction-error').textContent).toContain('UNKNOWN_THINKING_LEVEL')
    expect(screen.getByTestId('extraction-note').textContent).toContain('cancelled')
    expect(screen.queryByTestId('extraction-level-picker')).toBeNull()
    // no model switch either: one model, set once, in settings
    expect(screen.queryByLabelText('Thinking level')).toBeNull()
  })
})