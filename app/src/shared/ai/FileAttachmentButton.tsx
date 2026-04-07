import { useRef, useCallback } from 'react'
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_MESSAGE,
  isAcceptedFileType,
  formatFileSize,
  isImageFile,
  type FileAttachment,
} from '../../types/aiContext'

interface FileAttachmentButtonProps {
  attachments: FileAttachment[]
  onAttach: (files: FileAttachment[]) => void
  onError: (message: string) => void
  disabled?: boolean
}

let attachmentIdCounter = 0
function nextAttachmentId(): string {
  return `attach-${Date.now()}-${++attachmentIdCounter}`
}

function createPreviewUrl(file: File): Promise<string | undefined> {
  if (!isImageFile(file.name)) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(file)
  })
}

export async function filesToAttachments(
  fileList: FileList | File[],
  existing: FileAttachment[],
  onError: (message: string) => void,
): Promise<FileAttachment[]> {
  const files = Array.from(fileList)
  const results: FileAttachment[] = []

  for (const file of files) {
    if (existing.length + results.length >= MAX_FILES_PER_MESSAGE) {
      onError(`Maximum ${MAX_FILES_PER_MESSAGE} files per message.`)
      break
    }
    if (!isAcceptedFileType(file.name)) {
      onError(`File type not accepted: ${file.name}. Accepted: ${ACCEPTED_FILE_TYPES.join(', ')}`)
      continue
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onError(`File too large: ${file.name} (${formatFileSize(file.size)}). Max ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`)
      continue
    }

    const previewUrl = await createPreviewUrl(file)
    results.push({
      id: nextAttachmentId(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      previewUrl,
    })
  }

  return results
}

export function FileAttachmentButton({ attachments, onAttach, onError, disabled }: FileAttachmentButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const newAttachments = await filesToAttachments(fileList, attachments, onError)
    if (newAttachments.length > 0) onAttach(newAttachments)
    // Reset input so re-selecting the same file works
    e.target.value = ''
  }, [attachments, onAttach, onError])

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES.join(',')}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || attachments.length >= MAX_FILES_PER_MESSAGE}
        title="Attach files"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          border: '1px solid #d0d5dd',
          borderRadius: 8,
          background: 'white',
          cursor: disabled || attachments.length >= MAX_FILES_PER_MESSAGE ? 'not-allowed' : 'pointer',
          opacity: disabled || attachments.length >= MAX_FILES_PER_MESSAGE ? 0.5 : 1,
          flexShrink: 0,
          fontSize: '1.1rem',
          color: '#64748b',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
    </>
  )
}
