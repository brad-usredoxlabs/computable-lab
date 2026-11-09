/**
 * Tests for derived-tab stripping on PUT — unit 7 of
 * L2-PROMPT2-FIXTURE-BOARD-1. Derived tabs (declared with
 * `derived: true`) must never be persisted to the sidecar YAML.
 *
 * Ruling: .hermes/plans/decisions/FIXTURE-BOARD-firstpaint-flake-l2t3300-ruling.md
 */
import { describe, expect, it } from 'vitest';
import { parseWorkspaceState, stripDerivedTabs } from './types.js';

const baseState = {
  version: 3,
  studyId: 'STU-scratch',
  activeTabId: null,
  rightPaneMode: 'find',
  rightPaneCollapsed: false,
  paneWidths: { left: 0.6, right: 0.4 },
};

describe('derived tab handling', () => {
  it('strips derived deck tabs and adjusts activeTabId when it points at a derived tab', () => {
    const incoming = {
      ...baseState,
      tabs: [
        {
          id: 'tab-deck-EVG-xyz',
          kind: 'deck',
          eventGraphId: 'EVG-xyz',
          title: 'CellRox',
          derived: true,
        },
        {
          id: 'details:STU-scratch',
          kind: 'project-details',
          title: 'Project',
        },
      ],
      activeTabId: 'tab-deck-EVG-xyz',
    };

    const state = parseWorkspaceState(incoming);
    expect(state).not.toBeNull();

    const cleaned = stripDerivedTabs(state!);

    // Derived tab removed
    expect(cleaned.tabs).toHaveLength(1);
    expect(cleaned.tabs[0].kind).toBe('project-details');

    // activeTabId no longer points at the stripped tab
    expect(cleaned.activeTabId).toBe('details:STU-scratch');
  });

  it('passes through states with no derived tabs unchanged', () => {
    const incoming = {
      ...baseState,
      tabs: [
        {
          id: 'tab-deck-EVG-abc',
          kind: 'deck',
          eventGraphId: 'EVG-abc',
          title: 'Some Deck',
        },
        {
          id: 'details:STU-scratch',
          kind: 'project-details',
          title: 'Project',
        },
      ],
      activeTabId: 'tab-deck-EVG-abc',
    };

    const state = parseWorkspaceState(incoming);
    expect(state).not.toBeNull();

    const cleaned = stripDerivedTabs(state!);

    // Both tabs survive — no derived flag
    expect(cleaned.tabs).toHaveLength(2);
    expect(cleaned.activeTabId).toBe('tab-deck-EVG-abc');
  });
});
