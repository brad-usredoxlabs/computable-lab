/**
 * Tests for the validate pass.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createValidatePass } from './ChatbotCompilePasses.js';
import {
  registerValidationCheck,
  getValidationChecks,
  clearValidationChecks,
} from '../../validation/ValidationCheck.js';
import type { PipelineState } from '../types.js';
import { emptyLabState } from '../../state/LabState.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeCheck(
  id: string,
  category: string,
  findings: unknown[],
): ReturnType<typeof registerValidationCheck> extends (check: infer T) => void
  ? T
  : never {
  return {
    id,
    category,
    run: () => findings,
  } as never;
}

// ---------------------------------------------------------------------------
// createValidatePass tests
// ---------------------------------------------------------------------------

describe('createValidatePass', () => {
  beforeEach(() => {
    clearValidationChecks();
  });

  it('pass id is validate and family is validate', () => {
    const pass = createValidatePass();
    expect(pass.id).toBe('validate');
    expect(pass.family).toBe('validate');
  });

  it('no checks registered → empty findings', () => {
    const pass = createValidatePass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'validate',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { validationReport: { findings: unknown[] } };
    expect(output.validationReport.findings).toHaveLength(0);
  });

  it('fake check returning one warning finding appears in output', () => {
    const pass = createValidatePass();

    registerValidationCheck(makeFakeCheck('fake-check', 'test', [
      {
        severity: 'warning' as const,
        category: 'test',
        message: 'test finding',
      },
    ]));

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'validate',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { validationReport: { findings: unknown[] } };
    expect(output.validationReport.findings).toHaveLength(1);
    expect(output.validationReport.findings[0]).toEqual({
      severity: 'warning',
      category: 'test',
      message: 'test finding',
    });
  });

  it('fake check returning one error finding appears in output', () => {
    const pass = createValidatePass();

    registerValidationCheck(makeFakeCheck('error-check', 'errors', [
      {
        severity: 'error' as const,
        category: 'errors',
        message: 'critical error',
      },
    ]));

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'validate',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { validationReport: { findings: unknown[] } };
    expect(output.validationReport.findings).toHaveLength(1);
    expect(output.validationReport.findings[0].severity).toBe('error');
  });

  it('multiple checks aggregate all findings', () => {
    const pass = createValidatePass();

    registerValidationCheck(makeFakeCheck('check-a', 'cat-a', [
      { severity: 'warning' as const, category: 'cat-a', message: 'a1' },
    ]));
    registerValidationCheck(makeFakeCheck('check-b', 'cat-b', [
      { severity: 'info' as const, category: 'cat-b', message: 'b1' },
      { severity: 'info' as const, category: 'cat-b', message: 'b2' },
    ]));

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'validate',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { validationReport: { findings: unknown[] } };
    expect(output.validationReport.findings).toHaveLength(3);
  });
});
