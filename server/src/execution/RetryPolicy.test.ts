import { describe, expect, it } from 'vitest';
import { classifyExecutionFailure } from './RetryPolicy.js';

describe('RetryPolicy', () => {
  it('classifies timeout and temporary failures as transient', () => {
    const timeout = classifyExecutionFailure({ statusRaw: 'timeout' });
    expect(timeout.failureClass).toBe('transient');
    expect(timeout.retryRecommended).toBe(true);
    expect(timeout.failureCode).toBe('TIMEOUT_TEMPORARY');
  });

  it('classifies invalid payload failures as terminal', () => {
    const terminal = classifyExecutionFailure({ stderr: 'invalid schema syntax' });
    expect(terminal.failureClass).toBe('terminal');
    expect(terminal.retryRecommended).toBe(false);
    expect(terminal.failureCode).toBe('INVALID_PROTOCOL');
  });

  it('classifies unknown failures conservatively', () => {
    const unknown = classifyExecutionFailure({});
    expect(unknown.failureClass).toBe('unknown');
    expect(unknown.retryRecommended).toBe(false);
    expect(unknown.failureCode).toBe('UNCLASSIFIED');
  });
});
