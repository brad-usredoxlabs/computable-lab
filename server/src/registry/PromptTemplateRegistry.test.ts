/**
 * Tests for PromptTemplateRegistry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getPromptTemplateRegistry,
  renderPromptTemplate,
  type PromptTemplate,
} from './PromptTemplateRegistry.js';

describe('PromptTemplateRegistry', () => {
  let registry: ReturnType<typeof getPromptTemplateRegistry>;

  beforeEach(() => {
    registry = getPromptTemplateRegistry();
    registry.reload();
  });

  it('loads the chatbot-compile.precompile.system template', () => {
    const templates = registry.list();
    expect(templates.length).toBeGreaterThan(0);
    const found = templates.find((t) => t.id === 'chatbot-compile.precompile.system');
    expect(found).toBeDefined();
    expect(found!.kind).toBe('prompt-template');
    expect(found!.prompt_kind).toBe('compiler.precompile.system');
    expect(found!.content_format).toBe('markdown');
    expect(found!.content).toContain('You are the AI-precompile stage');
  });

  it('get returns the template by id', () => {
    const template = registry.get('chatbot-compile.precompile.system');
    expect(template).toBeDefined();
    expect(template!.id).toBe('chatbot-compile.precompile.system');
  });

  it('get returns undefined for unknown id', () => {
    const template = registry.get('nonexistent.template');
    expect(template).toBeUndefined();
  });

  it('render with no vars returns content unchanged (no variables template)', () => {
    const content = renderPromptTemplate('chatbot-compile.precompile.system');
    expect(content).toContain('You are the AI-precompile stage');
  });

  it('render with vars substitutes {{x}} correctly', async () => {
    // Create a temporary template with variables for testing
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const testDir = '/home/brad/git/computable-lab/schema/registry/prompt-templates';
    const testFile = `${testDir}/test-vars.yaml`;
    writeFileSync(
      testFile,
      `kind: prompt-template
id: test-vars
prompt_kind: test
description: Test template with variables
content_format: plain
variables:
  - name: user
    type: string
    description: The user name
  - name: count
    type: number
    description: A count
content: Hello {{user}}, you have {{count}} items.
`,
    );

    // Reload to pick up the new file
    const freshRegistry = getPromptTemplateRegistry();
    freshRegistry.reload();

    // Since RegistryLoader doesn't have render, we use renderPromptTemplate
    const rendered = renderPromptTemplate('test-vars', { user: 'Brad', count: 42 });
    expect(rendered).toBe('Hello Brad, you have 42 items.');

    // Clean up
    unlinkSync(testFile);
    freshRegistry.reload();
  });

  it('render throws for unknown template id', () => {
    expect(() => renderPromptTemplate('nonexistent.template')).toThrow(
      'PromptTemplate not found: nonexistent.template',
    );
  });

  it('render warns and substitutes empty string for missing variable', async () => {
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const testDir = '/home/brad/git/computable-lab/schema/registry/prompt-templates';
    const testFile = `${testDir}/test-missing-var.yaml`;
    writeFileSync(
      testFile,
      `kind: prompt-template
id: test-missing-var
prompt_kind: test
description: Test template with missing variable
content_format: plain
variables: []
content: Hello {{missingVar}}!
`,
    );

    const freshRegistry = getPromptTemplateRegistry();
    freshRegistry.reload();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rendered = renderPromptTemplate('test-missing-var');
    expect(rendered).toBe('Hello !');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Variable "missingVar" referenced but not provided'),
    );

    warnSpy.mockRestore();
    unlinkSync(testFile);
    freshRegistry.reload();
  });
});
