export const EDITOR_MODES = ['plan', 'biology', 'readouts', 'results'] as const

export type EditorMode = typeof EDITOR_MODES[number]

export function isEditorMode(value: string | null | undefined): value is EditorMode {
  return typeof value === 'string' && (EDITOR_MODES as readonly string[]).includes(value)
}

export function normalizeEditorMode(value: string | null | undefined, fallback: EditorMode = 'plan'): EditorMode {
  if (value === 'meaning') return 'biology'
  return isEditorMode(value) ? value : fallback
}
