#!/usr/bin/env tsx
/**
 * corpus-replay.ts — replay a captured corpus JSONL file to the corpus service
 * (SHORTHAND-CORPUS WS4 CLI).
 *
 * The local JSONL (CLA_CORPUS_LOCAL_PATH capture) is Brad's hand-seed store;
 * this CLI turns it into corpus-service POST bodies. All decode/shape logic
 * lives in the PURE kernel (src/corpus/corpusReplay.ts) that the vitest
 * round-trip suite pins; this file owns the fs read and the network POST —
 * the same split as golden-replay.ts vs replayKernel.ts.
 *
 * NOT collected by vitest (lives under server/scripts/, outside src/).
 *
 * Run:
 *   cd <wt>/server && npx tsx scripts/corpus-replay.ts [--dry-run] <path.jsonl>
 *
 * --dry-run prints one POST-body JSON per line with NO network call (this is
 * what the lane exercises). Without --dry-run the POST rides the SAME
 * resolveCorpusConfig-resolved service URL the app's corpus posts use; a
 * disabled corpus reports corpus.disabled and exits 1 (no fake success).
 *
 * Exit codes (operator tool: loud is allowed — the kernel stays pure):
 *   0  every line posted (or printed, dry-run) with zero failures
 *   1  at least one line failed OR the corpus is disabled for a live replay
 *   2  usage / unreadable input file
 */
import { readFileSync } from 'node:fs';
import {
  entryToPostBody,
  parseCorpusJsonlLine,
  replayCorpusJsonl,
  type CorpusJsonlEntry,
} from '../src/corpus/corpusReplay.js';
import { postCorpusEntry, resolveCorpusConfig, type CorpusEntryInput } from '../src/corpus/CorpusClient.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const paths = args.filter((a) => a !== '--dry-run');

if (paths.length !== 1) {
  console.error('usage: corpus-replay [--dry-run] <pairs.jsonl>');
  process.exit(2);
}

const inputPath = paths[0]!;
let content: string;
try {
  content = readFileSync(inputPath, 'utf8');
} catch (err) {
  console.error(`cannot read ${inputPath}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}

// Line-by-line pass first so dry-run prints bodies in file order with line
// numbers on failures (the kernel's reporting contract).
if (dryRun) {
  const lines = content.split('\n');
  let printed = 0;
  const failures: Array<{ lineNo: number; error: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.trim()) continue;
    const parsed = parseCorpusJsonlLine(line, i + 1);
    if (!parsed.ok) {
      failures.push({ lineNo: parsed.lineNo, error: parsed.error });
      continue;
    }
    console.log(JSON.stringify(entryToPostBody(parsed.entry)));
    printed++;
  }
  for (const f of failures) console.error(`FAILED ${f.error}`);
  console.error(`dry-run: ${printed} body(ies) printed, ${failures.length} failure(s)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

const config = resolveCorpusConfig();
if (!config.enabled) {
  console.error('corpus.disabled — set corpus.enabled/CLA_CORPUS_ENABLED + CLA_CORPUS_URL for a live replay, or use --dry-run');
  process.exit(1);
}

const result = await replayCorpusJsonl(content, (body: CorpusJsonlEntry) =>
  postCorpusEntry(body as unknown as CorpusEntryInput, config),
);
console.error(`replay: ${result.posted} posted, ${result.failures.length} failure(s) -> ${config.serviceBaseUrl}`);
for (const f of result.failures) console.error(`FAILED ${f.error}`);
process.exit(result.failures.length === 0 ? 0 : 1);
