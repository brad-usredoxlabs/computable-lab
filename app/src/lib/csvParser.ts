export interface ParseResult {
  headers: string[]
  rows: Record<string, string>[]
  errors: string[]
}

export function parseCsv(text: string): ParseResult {
  const errors: string[] = []
  const rawRows: string[][] = []
  let fields: string[] = [], current = '', inQuotes = false, i = 0
  let currentRow = 1 // 1-based, header is row 1

  while (i < text.length) {
    const char = text[i]
    if (inQuotes) {
      if (char === '\n' || char === '\r') {
        errors.push(`Row ${currentRow + 1}: multiline quoted fields are not supported`)
        // Skip the rest of this field to continue parsing
        while (i < text.length) {
          if (text[i] === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') {
              i += 2
            } else {
              inQuotes = false
              i++
              break
            }
          } else {
            i++
          }
        }
        continue
      }
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { current += '"'; i += 2; }
        else { inQuotes = false; i++; }
      } else { current += char; i++; }
    } else {
      if (char === '"') { inQuotes = true; i++; }
      else if (char === ',') { fields.push(current); current = ''; i++; }
      else if (char === '\n' || (char === '\r' && text[i + 1] === '\n')) {
        fields.push(current)
        const hasComma = fields.length > 1
        const hasContent = current.trim() !== '' || fields.some(f => f.trim() !== '')
        if (hasComma || hasContent) {
          rawRows.push(fields)
        }
        fields = []; current = ''
        i++
        if (char === '\r') i++
        currentRow++
      } else { current += char; i++; }
    }
  }
  // Handle trailing content (no final newline)
  if (fields.length > 0 || current !== '') {
    fields.push(current)
    const hasComma = fields.length > 1
    const hasContent = current.trim() !== '' || fields.some(f => f.trim() !== '')
    if (hasComma || hasContent) {
      rawRows.push(fields)
    }
  }

  if (rawRows.length === 0) return { headers: [], rows: [], errors }
  const headers = rawRows[0].map(h => h.trim())
  const result: Record<string, string>[] = []

  for (let i = 1; i < rawRows.length; i++) {
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < rawRows[i].length ? rawRows[i][j] : ''
    }
    result.push(row)
  }
  return { headers, rows: result, errors }
}
