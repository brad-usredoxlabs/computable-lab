/**
 * Task 2+3 of the 2026-08-15 study/experiment schema audit: the three empty
 * studies lint files get the rules the schemas' own prose promises.
 *
 * Harness: parse the REAL *.lint.yaml files from disk (same file the server
 * loads at startup via LintSpecLoader) into a LintEngine and lint sample
 * payloads directly — no HTTP.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from './LintEngine.js';
import type { LintSpec } from './types.js';

const SCHEMA_ID = (name: string) =>
  `https://computable-lab.com/schema/computable-lab/${name}`;

function loadSpec(file: string): LintSpec {
  const url = new URL(`../../../schema/studies/${file}`, import.meta.url);
  const parsed = parseYaml(readFileSync(fileURLToPath(url), 'utf-8')) as LintSpec;
  if (typeof parsed.lintVersion !== 'number' || !Array.isArray(parsed.rules)) {
    throw new Error(`Invalid lint spec: ${file}`);
  }
  return parsed;
}

function engineWith(file: string): LintEngine {
  const eng = new LintEngine();
  eng.addSpec(file, loadSpec(file));
  return eng;
}

describe('run lint rules', () => {
  const RUN = SCHEMA_ID('run.schema.yaml');
  let engine: LintEngine;

  beforeAll(() => {
    engine = engineWith('run.lint.yaml');
  });

  it('passes a run with studyId', () => {
    const r = engine.lint(
      { kind: 'run', recordId: 'RUN-1', status: 'planned', studyId: 'STU-scratch' },
      RUN,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some(v => v.ruleId === 'run-has-parent-link')).toBe(false);
  });

  it('passes a run with projectIds only', () => {
    const r = engine.lint(
      { kind: 'run', recordId: 'RUN-1', status: 'planned', projectIds: ['STU-1'] },
      RUN,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some(v => v.ruleId === 'run-has-parent-link')).toBe(false);
  });

  it('flags (warning) a run with neither parent', () => {
    const r = engine.lint(
      { kind: 'run', recordId: 'RUN-1', status: 'planned' },
      RUN,
    );
    // severity is warning: the record stays writable, the gap is surfaced
    expect(r.valid).toBe(true);
    expect(r.summary.warnings).toBeGreaterThanOrEqual(1);
    expect(r.violations.some(v => v.ruleId === 'run-has-parent-link')).toBe(true);
  });

  it('interpolates the recordId into the warning message', () => {
    const r = engine.lint(
      { kind: 'run', recordId: 'RUN-orphan', status: 'planned' },
      RUN,
    );
    const v = r.violations.find(v => v.ruleId === 'run-has-parent-link');
    expect(v?.message).toContain('RUN-orphan');
  });
});

describe('study + experiment lint rules', () => {
  const STUDY = SCHEMA_ID('study.schema.yaml');
  const EXPERIMENT = SCHEMA_ID('experiment.schema.yaml');
  let studyEngine: LintEngine;
  let experimentEngine: LintEngine;

  beforeAll(() => {
    studyEngine = engineWith('study.lint.yaml');
    experimentEngine = engineWith('experiment.lint.yaml');
  });

  it('study: good kebab-case shortSlug passes', () => {
    const r = studyEngine.lint(
      { kind: 'study', recordId: 'STU-1', title: 'S', shortSlug: 'quick-test' },
      STUDY,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some(v => v.ruleId === 'study-short-slug')).toBe(false);
  });

  it('study: bad shortSlug is flagged (warning)', () => {
    const r = studyEngine.lint(
      { kind: 'study', recordId: 'STU-1', title: 'S', shortSlug: 'Quick_Test' },
      STUDY,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some(v => v.ruleId === 'study-short-slug')).toBe(true);
  });

  it('experiment: good kebab-case shortSlug passes', () => {
    const r = experimentEngine.lint(
      { kind: 'experiment', recordId: 'EXP-1', title: 'E', shortSlug: 'validate-assay' },
      EXPERIMENT,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some(v => v.ruleId === 'experiment-short-slug')).toBe(false);
  });

  it('experiment: bad shortSlug is flagged (warning)', () => {
    const r = experimentEngine.lint(
      { kind: 'experiment', recordId: 'EXP-1', title: 'E', shortSlug: 'Validate Assay!' },
      EXPERIMENT,
    );
    expect(r.valid).toBe(true);
    expect(r.violations.some(v => v.ruleId === 'experiment-short-slug')).toBe(true);
  });
});
