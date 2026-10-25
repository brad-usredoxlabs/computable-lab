export interface ProtocolStepTextBlock {
  kind: 'instruction' | 'note' | 'footnote'
  text: string
  marker?: string
}

/** Keep paragraph boundaries, but reflow PDF line wrapping inside supporting text. */
function reflow(text: string): string {
  return text.replace(/\u00ad\s*\n\s*/g, '')
    .replace(/-\s*\n\s*/g, '-')
    .replace(/\s+/g, ' ').trim()
}

/** Notes and numbered footnotes belong to a step, not to the step list itself. */
export function splitProtocolStepText(value: string): ProtocolStepTextBlock[] {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ProtocolStepTextBlock[] = []
  let kind: ProtocolStepTextBlock['kind'] = 'instruction'
  let marker: string | undefined
  let pending: string[] = []
  const flush = () => {
    const text = pending.join('\n').trim()
    if (text || kind === 'note' || marker) blocks.push({kind, text: kind === 'instruction' ? text : reflow(text), ...(marker ? {marker} : {})})
    pending = []
    kind = 'instruction'
    marker = undefined
  }
  lines.forEach((line, index) => {
    if (!line.trim()) { flush(); return }
    const note = /^\s*note\s*:\s*(.*)$/i.exec(line)
    // PDF extraction puts superscript footnote labels on their own lines.
    // Also recognize the inline form produced when the editor saves them.
    // A trailing page number and ordinary "1. Do this" lists aren't footnotes.
    const separateNumber = /^\s*(\d{1,2})\s*$/.exec(line)
    const nextLine = lines[index + 1]?.trim() ?? ''
    const footnote = separateNumber && /^[A-Za-z]/.test(nextLine)
      ? {marker: separateNumber[1]!, text: ''}
      : /^\s*(\d{1,2})\s+([A-Z][a-z].*)$/.exec(line)
    if (note) {
      flush(); kind = 'note'; pending.push(note[1]!); return
    }
    if (footnote) {
      flush(); kind = 'footnote'
      marker = Array.isArray(footnote) ? footnote[1]! : footnote.marker
      pending.push(Array.isArray(footnote) ? footnote[2]! : footnote.text)
      return
    }
    pending.push(line)
  })
  flush()
  return blocks
}
