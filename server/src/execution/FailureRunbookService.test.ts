import { describe, expect, it } from 'vitest';
import { FailureRunbookService } from './FailureRunbookService.js';

describe('FailureRunbookService', () => {
  it('lists known entries and resolves by failure code', () => {
    const service = new FailureRunbookService();
    const entries = service.list();
    expect(entries.length).toBeGreaterThan(0);
    const exhausted = service.get('RETRY_EXHAUSTED');
    expect(exhausted).not.toBeNull();
    expect(exhausted?.severity).toBe('critical');
    expect(service.get('NOT_A_REAL_CODE')).toBeNull();
  });
});

