/**
 * Tests for IssueCardTemplateRegistry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getIssueCardTemplateRegistry,
  getIssueCardTemplateByCategory,
  renderIssueCardTemplate,
  type IssueCardTemplate,
} from './IssueCardTemplateRegistry.js';

describe('IssueCardTemplateRegistry', () => {
  let registry: ReturnType<typeof getIssueCardTemplateRegistry>;

  beforeEach(() => {
    registry = getIssueCardTemplateRegistry();
    registry.reload();
  });

  it('loads all issue-card-template YAMLs', () => {
    const templates = registry.list();
    expect(templates.length).toBeGreaterThanOrEqual(6);
  });

  it('loads the user-feedback template', () => {
    const template = registry.get('user-feedback');
    expect(template).toBeDefined();
    expect(template!.kind).toBe('issue-card-template');
    expect(template!.id).toBe('user-feedback');
    expect(template!.category).toBe('user');
    expect(template!.title_template).toContain('{{snippet}}');
    expect(template!.body_template).toBe('{{full_body}}');
  });

  it('loads the system-deck template', () => {
    const template = registry.get('system-deck');
    expect(template).toBeDefined();
    expect(template!.category).toBe('system');
    expect(template!.subcategory).toBe('deck');
    expect(template!.title_template).toBe('Deck layout issue: {{issue_short}}');
  });

  it('loads the system-tool template', () => {
    const template = registry.get('system-tool');
    expect(template).toBeDefined();
    expect(template!.subcategory).toBe('tool');
    expect(template!.title_template).toBe('Tool/instrument issue: {{issue_short}}');
  });

  it('loads the system-reagent template', () => {
    const template = registry.get('system-reagent');
    expect(template).toBeDefined();
    expect(template!.subcategory).toBe('reagent');
    expect(template!.title_template).toBe('Reagent issue: {{issue_short}}');
  });

  it('loads the system-budget template', () => {
    const template = registry.get('system-budget');
    expect(template).toBeDefined();
    expect(template!.subcategory).toBe('budget');
    expect(template!.title_template).toBe('Budget issue: {{issue_short}}');
  });

  it('loads the mixed-rolling-summary template', () => {
    const template = registry.get('mixed-rolling-summary');
    expect(template).toBeDefined();
    expect(template!.category).toBe('mixed');
    expect(template!.title_template).toBe('Mixed: {{summary_head}}');
  });

  it('get returns undefined for unknown id', () => {
    const template = registry.get('nonexistent.template');
    expect(template).toBeUndefined();
  });

  it('getIssueCardTemplateByCategory finds by category', () => {
    const template = getIssueCardTemplateByCategory('user');
    expect(template!.id).toBe('user-feedback');
  });

  it('getIssueCardTemplateByCategory finds by category and subcategory', () => {
    const template = getIssueCardTemplateByCategory('system', 'deck');
    expect(template!.id).toBe('system-deck');
  });

  it('getIssueCardTemplateByCategory throws for unknown category', () => {
    expect(() => getIssueCardTemplateByCategory('nonexistent')).toThrow(
      'IssueCardTemplate not found: category=nonexistent',
    );
  });

  it('getIssueCardTemplateByCategory throws for unknown subcategory', () => {
    expect(() => getIssueCardTemplateByCategory('system', 'nonexistent')).toThrow(
      'IssueCardTemplate not found: category=system, subcategory=nonexistent',
    );
  });

  it('renderIssueCardTemplate renders user-feedback correctly', () => {
    const rendered = renderIssueCardTemplate('user-feedback', {
      snippet: 'The wash step is missing',
      full_body: 'The wash step is missing from the protocol',
    });
    expect(rendered.title).toBe('User feedback: The wash step is missing');
    expect(rendered.body).toBe('The wash step is missing from the protocol');
    expect(rendered.suggestedChange).toContain('User-requested issue');
    expect(rendered.suggestedChange).toContain('Consider adding a compiler pass');
  });

  it('renderIssueCardTemplate renders system-deck correctly', () => {
    const rendered = renderIssueCardTemplate('system-deck', {
      issue_short: 'Slot conflict at 1',
      issue_full: 'Slot conflict at 1: 96-well-plate, reservoir',
    });
    expect(rendered.title).toBe('Deck layout issue: Slot conflict at 1');
    expect(rendered.body).toBe('Slot conflict at 1: 96-well-plate, reservoir');
    expect(rendered.suggestedChange).toContain('System-detected issue');
  });

  it('renderIssueCardTemplate renders mixed-rolling-summary correctly', () => {
    const rendered = renderIssueCardTemplate('mixed-rolling-summary', {
      summary_head: 'Rolling feedback + system diagnostics (1 issue(s))',
      summary_full: 'Rolling summary (1 comment(s)): Need to add a wash step\n\nSystem diagnostics:\n- Slot conflict at 1',
    });
    expect(rendered.title).toBe('Mixed: Rolling feedback + system diagnostics (1 issue(s))');
    expect(rendered.suggestedChange).toContain('User-and-system issue');
  });

  it('renderIssueCardTemplate throws for unknown template id', () => {
    expect(() => renderIssueCardTemplate('nonexistent.template')).toThrow(
      'IssueCardTemplate not found: nonexistent.template',
    );
  });

  it('renderIssueCardTemplate warns and substitutes empty string for missing variable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rendered = renderIssueCardTemplate('user-feedback');
    expect(rendered.title).toBe('User feedback: ');
    expect(rendered.body).toBe('');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Variable "snippet" referenced but not provided'),
    );
    warnSpy.mockRestore();
  });
});
