import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { CompletionRequest, CompletionResponse, InferenceClient } from '../ai/types.js';
import { completeWithWorktreeTools, readWorktreeDiff } from './FoundryWorktreeTools.js';

const execFileAsync = promisify(execFile);

async function git(root: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd: root });
}

describe('FoundryWorktreeTools', () => {
  it('lets coder agents inspect, edit, run commands, and produce a real git diff', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-worktree-tools-'));
    await mkdir(join(root, 'server/src/example'), { recursive: true });
    await writeFile(join(root, 'server/src/example/value.ts'), [
      'export function value(): number {',
      '  return 1;',
      '}',
      '',
    ].join('\n'), 'utf-8');
    await git(root, ['init']);
    await git(root, ['add', '.']);
    await git(root, ['-c', 'user.name=Foundry Test', '-c', 'user.email=foundry@example.test', 'commit', '-m', 'initial']);

    const requests: CompletionRequest[] = [];
    const client: InferenceClient = {
      async complete(request: CompletionRequest): Promise<CompletionResponse> {
        requests.push(request);
        if (requests.length === 1) {
          expect(request.tools?.map((tool) => tool.function.name)).toContain('worktree_replace_lines');
          return {
            id: 'read',
            choices: [{
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call-read',
                  type: 'function',
                  function: {
                    name: 'worktree_read',
                    arguments: JSON.stringify({ path: 'server/src/example/value.ts', startLine: 1, endLine: 3 }),
                  },
                }],
              },
            }],
          };
        }
        if (requests.length === 2) {
          const toolMessage = request.messages.find((message) => message.role === 'tool');
          expect(toolMessage?.content).toContain('return 1;');
          return {
            id: 'edit',
            choices: [{
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call-edit',
                  type: 'function',
                  function: {
                    name: 'worktree_replace_lines',
                    arguments: JSON.stringify({
                      path: 'server/src/example/value.ts',
                      startLine: 2,
                      endLine: 2,
                      replacement: '  return 2;',
                    }),
                  },
                }],
              },
            }],
          };
        }
        if (requests.length === 3) {
          return {
            id: 'status',
            choices: [{
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call-status',
                  type: 'function',
                  function: {
                    name: 'worktree_run',
                    arguments: JSON.stringify({ command: 'git', args: ['status', '--short'] }),
                  },
                }],
              },
            }],
          };
        }
        if (requests.length === 4) {
          return {
            id: 'diff',
            choices: [{
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call-diff',
                  type: 'function',
                  function: {
                    name: 'worktree_diff',
                    arguments: '{}',
                  },
                }],
              },
            }],
          };
        }
        const toolMessages = request.messages.filter((message) => message.role === 'tool');
        expect(toolMessages.at(-1)?.content).toContain('return 2;');
        return {
          id: 'final',
          choices: [{
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: '{"summary":"patched value"}' },
          }],
        };
      },
      async *completeStream() {
        throw new Error('not used');
      },
    };

    const response = await completeWithWorktreeTools({
      client,
      worktreeRoot: root,
      request: {
        model: 'coder',
        messages: [{ role: 'user', content: 'patch value' }],
      },
    });

    expect(response.choices[0]?.message.content).toBe('{"summary":"patched value"}');
    const diff = await readWorktreeDiff(root);
    expect(diff).toContain('-  return 1;');
    expect(diff).toContain('+  return 2;');
  });
});
