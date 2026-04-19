export interface TextChunk {
  index: number;
  text: string;
  byte_start: number;
  byte_end: number;
}

export interface ChunkOptions {
  maxCharsPerChunk?: number;
  overlapChars?: number;
}

const DEFAULT_MAX = 8000;
const DEFAULT_OVERLAP = 200;

export function chunkText(text: string, opts?: ChunkOptions): TextChunk[] {
  const maxChars = opts?.maxCharsPerChunk ?? DEFAULT_MAX;
  const overlap = opts?.overlapChars ?? DEFAULT_OVERLAP;
  
  // Handle empty input
  if (text.length === 0) {
    return [];
  }
  
  if (text.length <= maxChars) {
    return [{ index: 0, text, byte_start: 0, byte_end: text.length }];
  }
  
  const chunks: TextChunk[] = [];
  let cursor = 0;
  let index = 0;
  
  while (cursor < text.length) {
    const hardEnd = Math.min(cursor + maxChars, text.length);
    // Find the best split within [cursor, hardEnd]
    const splitAt = findBestSplit(text, cursor, hardEnd);
    const end = splitAt ?? hardEnd;
    // For chunks after the first, include overlap from the previous chunk
    const start = index === 0 ? cursor : Math.max(0, cursor - overlap);
    
    // Skip degenerate splits (empty chunk text)
    if (end > start) {
      chunks.push({ index, text: text.slice(start, end), byte_start: start, byte_end: end });
    }
    
    cursor = end;
    index += 1;
    
    // Prevent infinite loop if no progress was made
    if (end === cursor && cursor < text.length) {
      cursor = Math.min(cursor + 1, text.length);
    }
  }
  
  return chunks;
}

function findBestSplit(text: string, start: number, end: number): number | null {
  // Priority 1: heading markers '\n## '
  const headingSplit = text.lastIndexOf('\n## ', end);
  if (headingSplit > start + 200) return headingSplit;
  
  // Priority 2: blank-line paragraph break
  const paraSplit = text.lastIndexOf('\n\n', end);
  if (paraSplit > start + 200) return paraSplit + 2;
  
  // Priority 3: sentence terminator followed by space
  const sentenceSplit = Math.max(
    text.lastIndexOf('. ', end),
    text.lastIndexOf('! ', end),
    text.lastIndexOf('? ', end),
  );
  if (sentenceSplit > start + 200) return sentenceSplit + 2;
  
  // Priority 4: no good split; caller uses hardEnd
  return null;
}
