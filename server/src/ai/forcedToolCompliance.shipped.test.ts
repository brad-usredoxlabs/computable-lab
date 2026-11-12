// @vitest-environment node
/**
 * L2-PROSE-SHORTHAND-SALVAGE-1 — unit C3surf.
 *
 * Pins the SHIPPED forced-tool compliance DATA: the two surfaces where
 * shorthand drafting actually happens (`event-editor`, `run-workspace`) must
 * be declared so the bounded zero-tool-call retry is reachable there. Loaded
 * through the real loader with no path argument — a DATA-only pin, never a
 * policy object constructed in the test (a constructed policy would pass even
 * with the shipped entries deleted).
 */
import { describe, expect, it } from 'vitest';
import {
  forcedToolComplianceEntry,
  loadForcedToolCompliancePolicy,
} from './forcedToolCompliance.js';

const ANTI_CLAIM = 'Do not claim to have saved or changed anything; no action has executed.';

const shipped = loadForcedToolCompliancePolicy();

describe('shipped forced-tool compliance policy (C3surf)', () => {
  it('declares event-editor: one retry, the event_shorthand envelope, the anti-claim clause', () => {
    const entry = forcedToolComplianceEntry(shipped, 'event-editor');
    expect(entry).not.toBeNull();
    expect(entry?.maxRetries).toBe(1);
    expect(entry?.nudge).toContain('event_shorthand');
    expect(entry?.nudge).toContain(ANTI_CLAIM);
  });

  it('declares run-workspace: one retry, the event_shorthand envelope, the anti-claim clause', () => {
    const entry = forcedToolComplianceEntry(shipped, 'run-workspace');
    expect(entry).not.toBeNull();
    expect(entry?.maxRetries).toBe(1);
    expect(entry?.nudge).toContain('event_shorthand');
    expect(entry?.nudge).toContain(ANTI_CLAIM);
  });

  it('leaves the sequences nudge intact (HARNESS-SEQ-2 bytes ride in DATA)', () => {
    const entry = forcedToolComplianceEntry(shipped, 'sequences');
    expect(entry).not.toBeNull();
    expect(entry?.maxRetries).toBe(1);
    expect(entry?.nudge.startsWith('Return the requested emission with agent_intent.')).toBe(true);
    expect(entry?.nudge).toContain('ROUTING RULE');
  });

  it('retains the workspace.deck entry (cited by AgentOrchestrator.repeatEcho.test.ts)', () => {
    const entry = forcedToolComplianceEntry(shipped, 'workspace.deck');
    expect(entry).not.toBeNull();
    expect(entry?.maxRetries).toBe(1);
  });
});
