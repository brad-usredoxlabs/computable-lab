import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { CompletionRequest, CompletionResponse, InferenceClient } from '../ai/types.js';
import { completeWithCodebaseTools } from './FoundryCodebaseTools.js';

describe('FoundryCodebaseTools', () => {
  it('executes codebase read tools before requesting the final answer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-codebase-tools-'));
    await mkdir(join(root, 'server/src/example'), { recursive: true });
    await writeFile(join(root, 'server/src/example/value.ts'), 'export const value = 1;\n', 'utf-8');
    const requests: CompletionRequest[] = [];
    const client: InferenceClient = {
      async complete(request: CompletionRequest): Promise<CompletionResponse> {
        requests.push(request);
        if (requests.length === 1) {
          expect(request.tools?.map((tool) => tool.function.name)).toContain('codebase_read');
          return {
            id: 'tool-request',
            choices: [{
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'codebase_read',
                    arguments: JSON.stringify({ path: 'server/src/example/value.ts', startLine: 1, endLine: 1 }),
                  },
                }],
              },
            }],
          };
        }
        const toolMessage = request.messages.find((message) => message.role === 'tool');
        expect(toolMessage?.content).toContain('export const value = 1;');
        return {
          id: 'final',
          choices: [{
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: '{"summary":"saw code"}' },
          }],
        };
      },
      async *completeStream() {
        throw new Error('not used');
      },
    };

    const response = await completeWithCodebaseTools({
      client,
      repoRoot: root,
      request: {
        model: 'coder',
        messages: [{ role: 'user', content: 'inspect value' }],
      },
    });

    expect(response.choices[0]?.message.content).toBe('{"summary":"saw code"}');
    expect(requests).toHaveLength(2);
  });

  it('exposes browser review evidence as a Foundry tool when context is supplied', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-browser-tools-repo-'));
    const artifactRoot = await mkdtemp(join(tmpdir(), 'foundry-browser-tools-artifacts-'));
    await mkdir(join(artifactRoot, 'browser-review', 'demo-protocol', 'manual_tubes'), { recursive: true });
    await writeFile(join(artifactRoot, 'browser-review', 'demo-protocol', 'manual_tubes', 'report.yaml'), [
      'kind: protocol-browser-review-report',
      'protocolId: demo-protocol',
      'variant: manual_tubes',
      'status: fail',
      'route: http://localhost:5173/labware-editor?id=demo',
      'visual_failures:',
      '  - event sequence was not visible',
      '',
    ].join('\n'), 'utf-8');
    await writeFile(join(artifactRoot, 'browser-review', 'demo-protocol', 'manual_tubes', 'screenshot-1.png'), '', 'utf-8');

    const requests: CompletionRequest[] = [];
    const client: InferenceClient = {
      async complete(request: CompletionRequest): Promise<CompletionResponse> {
        requests.push(request);
        if (requests.length === 1) {
          expect(request.tools?.map((tool) => tool.function.name)).toContain('foundry_browser_review_read');
          return {
            id: 'tool-request',
            choices: [{
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call-browser-1',
                  type: 'function',
                  function: {
                    name: 'foundry_browser_review_read',
                    arguments: '{}',
                  },
                }],
              },
            }],
          };
        }
        const toolMessage = request.messages.find((message) => message.role === 'tool');
        expect(toolMessage?.content).toContain('event sequence was not visible');
        expect(toolMessage?.content).toContain('screenshot-1.png');
        return {
          id: 'final',
          choices: [{
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: '{"summary":"saw browser report"}' },
          }],
        };
      },
      async *completeStream() {
        throw new Error('not used');
      },
    };

    const response = await completeWithCodebaseTools({
      client,
      repoRoot: root,
      browserContext: {
        artifactRoot,
        protocolId: 'demo-protocol',
        variant: 'manual_tubes',
      },
      request: {
        model: 'architect',
        messages: [{ role: 'user', content: 'inspect browser evidence' }],
      },
    });

    expect(response.choices[0]?.message.content).toBe('{"summary":"saw browser report"}');
    expect(requests).toHaveLength(2);
  });
});
