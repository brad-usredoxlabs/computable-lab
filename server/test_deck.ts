// Test the extractNonDeckSlotWells logic
const DECK_SLOT_TOKEN_RE = /\b([A-D][1-4])\b/g;
const PLACEMENT_PREPOSITION_RE = /\b(?:on|onto|in|at)\b/gi;

function spansOverlap(left: [number, number], right: [number, number]): boolean {
  return left[0] < right[1] && right[0] < left[1];
}

function extractWellAddresses(text: string): Array<{ wells: string[]; span: [number, number]; raw: string }> {
  const results: Array<{ wells: string[]; span: [number, number]; raw: string }> = [];
  const singleRe = /\b([A-H])(\d{1,2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = singleRe.exec(text)) !== null) {
    results.push({
      wells: [m[0]],
      span: [m.index, m.index + m[0].length],
      raw: m[0],
    });
  }
  return results;
}

function extractBareDeckSlotSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const lower = text.toLowerCase();

  const prepPositions: number[] = [];
  let m: RegExpExecArray | null;
  PLACEMENT_PREPOSITION_RE.lastIndex = 0;
  while ((m = PLACEMENT_PREPOSITION_RE.exec(lower)) !== null) {
    prepPositions.push(m.index);
  }

  if (prepPositions.length === 0) return spans;

  DECK_SLOT_TOKEN_RE.lastIndex = 0;
  while ((m = DECK_SLOT_TOKEN_RE.exec(lower)) !== null) {
    const tokenStart = m.index;
    const precedingPrep = prepPositions.filter((p) => p < tokenStart && (tokenStart - p) <= 30).pop();
    if (precedingPrep !== undefined) {
      const between = lower.slice(precedingPrep + m[0].length, tokenStart);
      if (!/\b[A-H]\d{1,2}\b/.test(between)) {
        spans.push([tokenStart, tokenStart + m[1]!.length]);
      }
    }
  }

  return spans;
}

function extractNonDeckSlotWells(text: string): ReturnType<typeof extractWellAddresses> {
  const deckSlotSpans: Array<[number, number]> = [];
  const bareDeckSlotSpans = extractBareDeckSlotSpans(text);
  const allDeckSpans = [...deckSlotSpans, ...bareDeckSlotSpans];

  if (allDeckSpans.length === 0) return extractWellAddresses(text);
  return extractWellAddresses(text).filter((well) => (
    !allDeckSpans.some((span) => spansOverlap(well.span, span))
  ));
}

const text = "a 96-well plate on B2";
console.log("Text:", text);
console.log("Bare deck slot spans:", extractBareDeckSlotSpans(text));
console.log("Non-deck-slot wells:", extractNonDeckSlotWells(text));
