import { describe, expect, it, vi } from 'vitest';
import { createJsonLdSearchHandlers } from './JsonLdSearchHandlers.js';

describe('JsonLdSearchHandlers.searchProjects', () => {
  it('groups run-level hits under their study through transitive untyped refs', async () => {
    const getRefs = vi.fn((ids: string[]) => {
      const refs = new Map<string, Array<{ recordId: string; kind?: string }>>();
      if (ids.includes('RUN-1')) {
        refs.set('RUN-1', [{ recordId: 'EXP-1' }]);
      }
      if (ids.includes('EXP-1')) {
        refs.set('EXP-1', [{ recordId: 'STU-1' }]);
      }
      return refs;
    });

    const index = {
      query: vi.fn(() => ({
        hits: [
          {
            recordId: 'RUN-1',
            jsonLdId: 'https://computable-lab.com/run/RUN-1',
            kind: 'run',
            label: 'Friday Run',
            snippet: 'Friday <mark>baseline</mark> run',
            facets: {},
            updatedAt: null,
          },
        ],
        total: 1,
        facetCounts: {},
      })),
      getRefs,
    };

    const store = {
      get: vi.fn(async (id: string) => {
        if (id === 'EXP-1') {
          return {
            recordId: 'EXP-1',
            schemaId: 'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml',
            payload: { kind: 'experiment', recordId: 'EXP-1', title: 'Experiment One' },
          };
        }
        if (id === 'STU-1') {
          return {
            recordId: 'STU-1',
            schemaId: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml',
            payload: { kind: 'study', recordId: 'STU-1', title: 'Study One' },
          };
        }
        return null;
      }),
    };

    const handlers = createJsonLdSearchHandlers(index as never, {} as never, store as never);
    const reply = {
      status: vi.fn(function status(this: unknown) { return this; }),
      send: vi.fn((payload: unknown) => payload),
    };

    const response = await handlers.searchProjects(
      { body: { q: 'baseline' }, log: { error: vi.fn() } } as never,
      reply as never,
    );

    expect(response).toMatchObject({
      studies: [
        {
          studyId: 'STU-1',
          title: 'Study One',
          matches: [
            {
              recordId: 'RUN-1',
              kind: 'run',
              label: 'Friday Run',
              path: 'Study One → Experiment One → Friday Run',
            },
          ],
        },
      ],
      total: 1,
    });
    expect(getRefs).toHaveBeenCalledWith(['RUN-1']);
    expect(getRefs).toHaveBeenCalledWith(['EXP-1']);
  });
});
