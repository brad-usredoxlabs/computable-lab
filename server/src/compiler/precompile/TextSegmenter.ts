/**
 * TextSegmenter — clause-level tokenization of freetext prompts.
 *
 * Splits a user prompt into clauses; each clause carries its byte span
 * back into the original input so downstream passes can echo highlights.
 *
 * Splitting rules (applied in order):
 *   1. Sentence terminators: `.`, `!`, `?` followed by whitespace or end-of-string.
 *      The terminator is dropped.
 *   2. Semicolons. The `;` is dropped.
 *   3. Optional comma + whitespace before " and " or " then ". The comma+whitespace
 *      is dropped; 'and'/'then' stays in the next clause.
 *
 * After splitting, each fragment is trimmed of leading/trailing whitespace.
 * Empty fragments are dropped. Tokens are derived by lowercasing and splitting
 * on whitespace + punctuation; empty tokens are filtered.
 */

export interface Clause {
  text: string;
  span: [number, number];   // [start, end) byte offsets into the original input
  tokens: string[];          // lowercased, punctuation-split, no empties
}

interface Range {
  start: number;
  end: number;
}

const SENTENCE_TERMINATOR = /[.!?](?=\s|$)/g;
const SEMICOLON = /;/g;
const BEFORE_THEN_OR_AND = /(?:,)?\s+(?=(?:and|then)\s)/g;
const TOKEN_SPLITTER = /[\s,;:.\-—–"'()\[\]{}!?]+/;

function splitRange(text: string, range: Range, regexSrc: string, regexFlags: string): Range[] {
  const sub = text.slice(range.start, range.end);
  const re = new RegExp(regexSrc, regexFlags);
  const result: Range[] = [];
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sub)) !== null) {
    result.push({ start: range.start + lastEnd, end: range.start + m.index });
    lastEnd = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  result.push({ start: range.start + lastEnd, end: range.end });
  return result;
}

function trimRange(text: string, range: Range): Range | null {
  let s = range.start;
  let e = range.end;
  while (s < e && /\s/.test(text[s] ?? '')) s++;
  while (e > s && /\s/.test(text[e - 1] ?? '')) e--;
  if (s >= e) return null;
  return { start: s, end: e };
}

export function segmentClauses(text: string): Clause[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  if (text.trim().length === 0) return [];

  let ranges: Range[] = [{ start: 0, end: text.length }];

  ranges = ranges.flatMap(r => splitRange(text, r, SENTENCE_TERMINATOR.source, SENTENCE_TERMINATOR.flags));
  ranges = ranges.flatMap(r => splitRange(text, r, SEMICOLON.source, SEMICOLON.flags));
  ranges = ranges.flatMap(r => splitRange(text, r, BEFORE_THEN_OR_AND.source, BEFORE_THEN_OR_AND.flags));

  const clauses: Clause[] = [];
  for (const r of ranges) {
    const trimmed = trimRange(text, r);
    if (!trimmed) continue;
    const clauseText = text.slice(trimmed.start, trimmed.end);
    const tokens = clauseText.toLowerCase().split(TOKEN_SPLITTER).filter(t => t.length > 0);
    clauses.push({
      text: clauseText,
      span: [trimmed.start, trimmed.end],
      tokens
    });
  }
  return clauses;
}
