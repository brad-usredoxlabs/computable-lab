import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUIHandlers } from './UIHandlers.js';

const schemaId = 'https://computable-lab.com/schema/computable-lab/study.schema.yaml';
const spec = YAML.parse(readFileSync(fileURLToPath(new URL('../../../../schema/studies/study.ui.yaml', import.meta.url)), 'utf8'));
const now = '2026-10-04T12:00:00.000Z';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(now)); });
afterEach(() => vi.useRealTimers());

describe('project draft provenance', () => {
  async function project(userId: string | null, displayName?: string) {
    const identity = { resolveRequestUser: vi.fn(async () => ({ userId })) };
    const store = { get: vi.fn(async () => displayName ? { payload: { displayName } } : null) };
    const handlers = createUIHandlers(
      { get: () => spec } as any, store as any,
      { getById: () => ({ id: schemaId }) } as any, identity as any,
    );
    const request = { params: { schemaId: encodeURIComponent(schemaId) }, headers: { 'x-user-id': 'USR-HEADER' } };
    const result = await handlers.getEditorDraftProjection(request as any, { status: vi.fn() } as any);
    expect(identity.resolveRequestUser).toHaveBeenCalledWith(request);
    if (!('slots' in result)) throw new Error(result.message);
    return result;
  }

  it('prefills read-only author and timestamps on the real project form from the resolved session', async () => {
    const result = await project('USR-SESSION', 'Brad');
    expect(result.slots.find(slot => slot.path === '$.createdBy')).toMatchObject({ value: 'Brad', readOnly: true });
    expect(result.slots.find(slot => slot.path === '$.createdAt')).toMatchObject({ value: now, readOnly: true });
    expect(result.slots.find(slot => slot.path === '$.updatedAt')).toMatchObject({ value: now, readOnly: true });
  });

  it('falls back to the resolved user ID when no display name is available', async () => {
    const result = await project('USR-SESSION');
    expect(result.displayValues?.createdBy).toBe('USR-SESSION');
  });

  it('does not invent an author when the session identity is unresolved', async () => {
    const result = await project(null);
    expect(result.displayValues?.createdBy).toBeUndefined();
    expect(result.displayValues?.createdAt).toBe(now);
  });
});
