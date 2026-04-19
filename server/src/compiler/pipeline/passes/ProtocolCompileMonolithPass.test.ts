/**
 * Tests for ProtocolCompileMonolithPass.
 */

import { describe, it, expect } from 'vitest';
import type { Pass } from '../types.js';
import type { PipelineState } from '../types.js';
import { createProtocolCompileMonolithPass, type ProtocolCompileInput } from './ProtocolCompileMonolithPass.js';

describe('ProtocolCompileMonolithPass', () => {
  describe('createProtocolCompileMonolithPass', () => {
    it('throws when neither runCompiler nor store is provided', () => {
      expect(() => createProtocolCompileMonolithPass()).toThrow('requires either runCompiler or store option');
    });

    it('creates a pass with correct id and family when runCompiler is provided', () => {
      const pass = createProtocolCompileMonolithPass({
        runCompiler: async () => ({ status: 'ok' }),
      });
      expect(pass.id).toBe('protocol_compile_monolith');
      expect(pass.family).toBe('project');
    });

    it('creates a pass with correct id and family when store is provided', () => {
      const mockStore = {
        list: async () => [],
      };
      const pass = createProtocolCompileMonolithPass({ store: mockStore });
      expect(pass.id).toBe('protocol_compile_monolith');
      expect(pass.family).toBe('project');
    });
  });

  describe('pass.run()', () => {
    describe('success case', () => {
      it('returns {ok: true, output: <result>} when compiler succeeds', async () => {
        const mockResult = { status: 'ok', steps: [], diagnostics: [] };
        const pass = createProtocolCompileMonolithPass({
          runCompiler: async () => mockResult,
        });

        const state: PipelineState = {
          input: { protocol: { recordId: 'test-protocol', steps: [] } },
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        };

        const result = await pass.run({ pass_id: 'protocol_compile_monolith', state });

        expect(result.ok).toBe(true);
        expect(result.output).toBe(mockResult);
        expect(result.diagnostics).toBeUndefined();
      });
    });

    describe('compiler error status', () => {
      it('returns {ok: false} with diagnostic when compiler returns status: error', async () => {
        const mockResult = { status: 'error', diagnostics: [] };
        const pass = createProtocolCompileMonolithPass({
          runCompiler: async () => mockResult,
        });

        const state: PipelineState = {
          input: { protocol: { recordId: 'test-protocol', steps: [] } },
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        };

        const result = await pass.run({ pass_id: 'protocol_compile_monolith', state });

        expect(result.ok).toBe(false);
        expect(result.output).toBe(mockResult);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics![0].code).toBe('protocol_compile_failed');
        expect(result.diagnostics![0].severity).toBe('error');
        expect(result.diagnostics![0].message).toBe('ProtocolCompiler returned error status');
        expect(result.diagnostics![0].pass_id).toBe('protocol_compile_monolith');
      });
    });

    describe('error diagnostic from compiler', () => {
      it('returns {ok: false} when compiler returns diagnostics with severity: error', async () => {
        const mockResult = {
          status: 'blocked',
          diagnostics: [
            { severity: 'error', code: 'VERB_UNREGISTERED', message: 'Verb not found' },
            { severity: 'info', code: 'INFO', message: 'Info message' },
          ],
        };
        const pass = createProtocolCompileMonolithPass({
          runCompiler: async () => mockResult,
        });

        const state: PipelineState = {
          input: { protocol: { recordId: 'test-protocol', steps: [] } },
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        };

        const result = await pass.run({ pass_id: 'protocol_compile_monolith', state });

        expect(result.ok).toBe(false);
        expect(result.output).toBe(mockResult);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics![0].code).toBe('protocol_compile_failed');
      });
    });

    describe('missing input', () => {
      it('returns {ok: false} with missing_input diagnostic when state.input.protocol is undefined', async () => {
        const pass = createProtocolCompileMonolithPass({
          runCompiler: async () => ({ status: 'ok' }),
        });

        const state: PipelineState = {
          input: {}, // No protocol field
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        };

        const result = await pass.run({ pass_id: 'protocol_compile_monolith', state });

        expect(result.ok).toBe(false);
        expect(result.output).toBeUndefined();
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics![0].code).toBe('missing_input');
        expect(result.diagnostics![0].severity).toBe('error');
        expect(result.diagnostics![0].message).toBe('state.input.protocol not provided');
        expect(result.diagnostics![0].pass_id).toBe('protocol_compile_monolith');
      });

      it('returns {ok: false} with missing_input diagnostic when state.input.protocol is null', async () => {
        const pass = createProtocolCompileMonolithPass({
          runCompiler: async () => ({ status: 'ok' }),
        });

        const state: PipelineState = {
          input: { protocol: null },
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        };

        const result = await pass.run({ pass_id: 'protocol_compile_monolith', state });

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics![0].code).toBe('missing_input');
      });
    });

    describe('stub receives the protocol record', () => {
      it('calls runCompiler with the protocol record verbatim', async () => {
        const protocolRecord = { recordId: 'test-123', title: 'Test Protocol', steps: [{ id: 'step1' }] };
        let capturedInput: ProtocolCompileInput | undefined;

        const mockRunCompiler = async (input: ProtocolCompileInput): Promise<unknown> => {
          capturedInput = input;
          return { status: 'ok', steps: [] };
        };

        const pass = createProtocolCompileMonolithPass({
          runCompiler: mockRunCompiler,
        });

        const state: PipelineState = {
          input: { protocol: protocolRecord },
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        };

        await pass.run({ pass_id: 'protocol_compile_monolith', state });

        expect(capturedInput).toBeDefined();
        expect(capturedInput!.protocolRecord).toBe(protocolRecord);
      });
    });

    describe('compiler exception handling', () => {
      it('returns {ok: false} with diagnostic when runCompiler throws', async () => {
        const errorMessage = 'Compiler crashed!';
        const pass = createProtocolCompileMonolithPass({
          runCompiler: async () => {
            throw new Error(errorMessage);
          },
        });

        const state: PipelineState = {
          input: { protocol: { recordId: 'test-protocol' } },
          context: {},
          meta: {},
          outputs: new Map(),
          diagnostics: [],
        };

        const result = await pass.run({ pass_id: 'protocol_compile_monolith', state });

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics![0].code).toBe('protocol_compile_failed');
        expect(result.diagnostics![0].message).toContain(errorMessage);
      });
    });
  });
});
