#!/usr/bin/env tsx
/**
 * run-compile-fixtures.ts — Fixture scoreboard CLI.
 *
 * Discovers all *.yaml files under server/src/compiler/pipeline/fixtures/,
 * runs each through runFixture + diffFixture, and prints a summary table
 * to stdout.  The scoreboard is descriptive, not a pass/fail gate.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFixture } from '../src/compiler/pipeline/fixtures/FixtureTypes.js';
import { runFixture } from '../src/compiler/pipeline/fixtures/FixtureRunner.js';
import { diffFixture } from '../src/compiler/pipeline/fixtures/FixtureDiff.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = resolve(__dirname, '../src/compiler/pipeline/fixtures');

interface Row {
  name: string;
  outcome: string;
  matched: number;
  partial: number;
  missing: number;
  extra: number;
}

function printTable(rows: Row[]): void {
  // Column definitions: display name -> Row property
  const colDefs: Array<{ label: string; key: keyof Row }> = [
    { label: 'fixture', key: 'name' },
    { label: 'outcome', key: 'outcome' },
    { label: 'matched', key: 'matched' },
    { label: 'partial', key: 'partial' },
    { label: 'missing', key: 'missing' },
    { label: 'extra', key: 'extra' },
  ];

  // Column widths (header-based)
  const widths = colDefs.map(({ label }) => {
    const headerLen = label.length;
    const maxRowLen = Math.max(...rows.map((r) => String(r[colDefs[colDefs.findIndex((c) => c.label === label)].key]).length));
    return Math.max(headerLen, maxRowLen);
  });

  // Header
  const header = colDefs
    .map(({ label }, i) => label.padEnd(widths[i]))
    .join('  ');
  console.log(header);

  // Rows
  for (const row of rows) {
    const line = colDefs
      .map(({ key }, i) => String(row[key]).padEnd(widths[i]))
      .join('  ');
    console.log(line);
  }
}

async function main(): Promise<void> {
  const files = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .sort();

  const rows: Row[] = [];

  for (const file of files) {
    const text = readFileSync(join(FIXTURE_DIR, file), 'utf8');
    const fixture = parseFixture(text);

    try {
      const actual = await runFixture(fixture);
      const diff = diffFixture(actual, fixture.expected);
      const expectedOutcome = fixture.expected.outcome ?? '—';
      rows.push({
        name: fixture.name,
        outcome: `${actual.outcome}/${expectedOutcome}`,
        matched: diff.matched.length,
        partial: diff.partial.length,
        missing: diff.missing.length,
        extra: diff.extra.length,
      });
    } catch (err) {
      rows.push({
        name: fixture.name,
        outcome: 'ERROR',
        matched: 0,
        partial: 0,
        missing: 0,
        extra: 0,
      });
      console.error(
        `[${fixture.name}] runner threw:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  printTable(rows);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
