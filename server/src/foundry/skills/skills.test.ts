import { describe, expect, it } from 'vitest';
import { FIXIT_SKILLS, renderSkillsForPrompt } from './index.js';

describe('FIXIT_SKILLS', () => {
  it('exposes the four canonical fix-it skills', () => {
    const names = FIXIT_SKILLS.map((s) => s.name).sort();
    expect(names).toEqual([
      'event-state-debug',
      'lowering-debug',
      'prompt-variation-debug',
      'resolution-debug',
    ]);
  });

  it('every skill carries name, triggersWhen, tools, and promptText', () => {
    for (const skill of FIXIT_SKILLS) {
      expect(skill.name).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(skill.triggersWhen.length).toBeGreaterThan(20);
      expect(skill.tools.length).toBeGreaterThan(0);
      expect(skill.promptText).toContain(`SKILL: ${skill.name}`);
    }
  });
});

describe('renderSkillsForPrompt', () => {
  it('emits the triage rubric followed by every skill', () => {
    const rendered = renderSkillsForPrompt();
    expect(rendered).toContain('SKILL TRIAGE');
    for (const skill of FIXIT_SKILLS) {
      expect(rendered).toContain(`SKILL: ${skill.name}`);
    }
  });

  it('respects an explicit skills override', () => {
    const rendered = renderSkillsForPrompt([FIXIT_SKILLS[0]!]);
    expect(rendered).toContain(`SKILL: ${FIXIT_SKILLS[0]!.name}`);
    // The other skills should not appear when override is restricted to one.
    for (const skill of FIXIT_SKILLS.slice(1)) {
      expect(rendered).not.toContain(`SKILL: ${skill.name}`);
    }
  });
});
