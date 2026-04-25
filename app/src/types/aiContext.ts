/**
 * AiContext — Surface-agnostic interface for providing page context to the AI chat system.
 *
 * Each page builds its own AiContext from whatever state is relevant.
 * useAiChat consumes this interface instead of reading LabwareEditorContext directly.
 */

export type AiSurface =
  | 'event-editor'
  | 'run-workspace'
  | `run-workspace:${'overview' | 'plan' | 'biology' | 'readouts' | 'results' | 'claims' | 'budget'}`
  | 'materials'
  | 'formulations'
  | 'ingestion'
  | 'literature'

export interface AiContext {
  /** Which page surface is providing context. */
  surface: AiSurface
  /** Human-readable summary of what the user is currently looking at. */
  summary: string
  /** Arbitrary surface-specific data sent to the backend as the context payload. */
  surfaceContext: Record<string, unknown>
  /** Current editor mode (if applicable, e.g. plan/biology/readouts/results/canvas). */
  editorMode?: string
}

// =============================================================================
// File Attachments
// =============================================================================

export const ACCEPTED_FILE_TYPES = [
  '.csv', '.tsv', '.xlsx', '.xls', '.pdf',
  '.png', '.jpg', '.jpeg', '.gif',
  '.json', '.yaml', '.yml', '.txt', '.md',
] as const

export const ACCEPTED_MIME_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_FILES_PER_MESSAGE = 5

export interface FileAttachment {
  id: string
  file: File
  name: string
  size: number
  type: string
  /** Data URL for image thumbnails */
  previewUrl?: string
}

export function isImageFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif'].includes(ext)
}

export function getFileExtension(name: string): string {
  return name.slice(name.lastIndexOf('.')).toLowerCase()
}

export function isAcceptedFileType(name: string): boolean {
  const ext = getFileExtension(name)
  return (ACCEPTED_FILE_TYPES as readonly string[]).includes(ext)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
