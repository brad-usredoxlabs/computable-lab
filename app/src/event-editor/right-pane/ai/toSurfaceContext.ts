/**
 * toSurfaceContext — standardize the selection→AI seams onto SurfaceContext
 * (phase 4). Pure builders: PDF text selection and protocol-step selection
 * each produce a well-formed SurfaceContext before callers dispatch to the AI,
 * replacing the inline string-building that used to live in the AiTabPanel
 * handlers. Keeps the seams declarative and corpus-capturable.
 */
import type { SurfaceContext } from '../../../shared/context/SurfaceContext'

/** PDF text selection → a knowledge-surface SurfaceContext. */
export interface PdfSelectionInput {
  text: string
  pageNumber: number
  /** Optional document/artifact id + label to scope the context to. */
  documentId?: string
  documentLabel?: string
}

export function pdfSelectionToSurfaceContext(input: PdfSelectionInput): SurfaceContext {
  const label = input.documentLabel ?? 'Vendor protocol PDF'
  return {
    surface: 'knowledge',
    active: {
      objectType: 'document',
      objectId: input.documentId ?? `pdf:${input.pageNumber}`,
      label,
    },
    selection: [
      {
        ref: { kind: 'record', id: input.documentId ?? `pdf:${input.pageNumber}`, type: 'document', label },
        label: input.text.slice(0, 80),
      },
    ],
    prompt: `Here is a protocol section from the PDF (page ${input.pageNumber}):\n\n${input.text}`,
  }
}

/** Protocol-step selection → a run-plan-surface SurfaceContext. */
export interface StepSelectionInput {
  runId?: string
  runLabel?: string
  stepId: string
  stepLabel: string
  highlightedSection: string
}

export function stepSelectionToSurfaceContext(input: StepSelectionInput): SurfaceContext {
  const runObject = input.runId
    ? { objectType: 'run', objectId: input.runId, label: input.runLabel ?? 'This run' }
    : { objectType: 'run', objectId: 'run:current', label: 'This run' }
  return {
    surface: 'run-plan',
    active: runObject,
    selection: [
      {
        ref: {
          kind: 'record',
          id: input.stepId,
          type: 'event',
          label: input.stepLabel,
        },
        label: input.highlightedSection.slice(0, 80),
      },
    ],
    prompt:
      `Here is the current protocol step adapt request:\n\n` +
      `Adapt step "${input.stepLabel}" (${input.stepId}) to this lab. ` +
      `Ghost the events for this step onto the editor.`,
  }
}