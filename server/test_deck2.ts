const DECK_SLOT_TOKEN_RE = /\b([A-Da-d][1-4])\b/g;
const PLACEMENT_PREPOSITION_RE = /\b(?:on|onto|in|at)\b/gi;

const text = "a 96-well plate on B2";
const lower = text.toLowerCase();

console.log("Lower:", lower);

// Find placement prepositions
const prepPositions: number[] = [];
let m: RegExpExecArray | null;
PLACEMENT_PREPOSITION_RE.lastIndex = 0;
while ((m = PLACEMENT_PREPOSITION_RE.exec(lower)) !== null) {
  console.log("Prep match:", m[0], "at", m.index);
  prepPositions.push(m.index);
}

console.log("Prep positions:", prepPositions);

// Find deck slot tokens
DECK_SLOT_TOKEN_RE.lastIndex = 0;
while ((m = DECK_SLOT_TOKEN_RE.exec(lower)) !== null) {
  console.log("Deck slot match:", m[0], "group1:", m[1], "at", m.index);
}
