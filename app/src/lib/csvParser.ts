export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = [];
  let fields: string[] = [], current = '', inQuotes = false, i = 0;
  
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { current += '"'; i += 2; }
        else { inQuotes = false; i++; }
      } else { current += char; i++; }
    } else {
      if (char === '"') { inQuotes = true; i++; }
      else if (char === ',') { fields.push(current); current = ''; i++; }
      else if (char === '\n' || (char === '\r' && text[i + 1] === '\n')) {
        fields.push(current);
        const hasComma = fields.length > 1;
        const hasContent = current.trim() !== '' || fields.some(f => f.trim() !== '');
        if (hasComma || hasContent) {
          rows.push(fields);
        }
        fields = []; current = '';
        i++;
        if (char === '\r') i++;
      } else { current += char; i++; }
    }
  }
  if (fields.length > 0 || current !== '') {
    fields.push(current);
    const hasComma = fields.length > 1;
    const hasContent = current.trim() !== '' || fields.some(f => f.trim() !== '');
    if (hasComma || hasContent) {
      rows.push(fields);
    }
  }
  
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const result: Record<string, string>[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < rows[i].length ? rows[i][j] : '';
    }
    result.push(row);
  }
  return { headers, rows: result };
}
