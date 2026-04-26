import { describe, it, expect, beforeEach } from 'vitest';
import { createOntologyTermHandlers } from './OntologyTermHandlers.js';
import { getOntologyTermRegistry } from '../../registry/OntologyTermRegistry.js';

describe('OntologyTermHandlers', () => {
  let handlers: ReturnType<typeof createOntologyTermHandlers>;
  let mockReply: { status: (code: number) => { send: (body: unknown) => void }; _status: number; _body: unknown };

  beforeEach(() => {
    const registry = getOntologyTermRegistry();
    registry.reload();
    handlers = createOntologyTermHandlers(registry);

    mockReply = {
      _status: 200,
      _body: null,
      status: (code: number) => {
        mockReply._status = code;
        return mockReply;
      },
      send: (body: unknown) => {
        mockReply._body = body;
      },
    };
  });

  it('GET /ontology-terms/lookup returns 200 with term for existing id', async () => {
    const mockRequest = {
      query: { id: 'MANUAL:chebi-example' },
    } as any;

    const result = await handlers.getOntologyTerm(mockRequest, mockReply as any);

    expect(mockReply._status).toBe(200);
    expect(result).toEqual({
      success: true,
      term: expect.objectContaining({
        id: 'MANUAL:chebi-example',
        source: 'manual',
        kind: 'ontology-term',
      }),
    });
  });

  it('GET /ontology-terms/lookup returns 404 for unknown id', async () => {
    const mockRequest = {
      query: { id: 'UNKNOWN:nonexistent' },
    } as any;

    const result = await handlers.getOntologyTerm(mockRequest, mockReply as any);

    expect(mockReply._status).toBe(404);
    expect(result).toEqual({
      error: 'NOT_FOUND',
      message: 'Ontology term not found: UNKNOWN:nonexistent',
    });
  });

  it('GET /ontology-terms/lookup returns correct term for MANUAL:cl-example', async () => {
    const mockRequest = {
      query: { id: 'MANUAL:cl-example' },
    } as any;

    const result = await handlers.getOntologyTerm(mockRequest, mockReply as any);

    expect(mockReply._status).toBe(200);
    expect(result).toEqual({
      success: true,
      term: expect.objectContaining({
        id: 'MANUAL:cl-example',
        source: 'manual',
        label: 'Cell Ontology placeholder',
      }),
    });
  });

  it('GET /ontology-terms/lookup returns correct term for MANUAL:go-example', async () => {
    const mockRequest = {
      query: { id: 'MANUAL:go-example' },
    } as any;

    const result = await handlers.getOntologyTerm(mockRequest, mockReply as any);

    expect(mockReply._status).toBe(200);
    expect(result).toEqual({
      success: true,
      term: expect.objectContaining({
        id: 'MANUAL:go-example',
        source: 'manual',
        label: 'Gene Ontology placeholder',
      }),
    });
  });
});
