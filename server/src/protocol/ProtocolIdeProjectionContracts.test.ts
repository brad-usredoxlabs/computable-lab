/**
 * Unit tests for ProtocolIdeProjectionContracts types and validation.
 *
 * Tests:
 *  (a) One valid latest-state rerun request round-trips through validation.
 *  (b) One valid latest-state response round-trips through validation.
 *  (c) An invalid payload that tries to send a run-history model is rejected.
 *  (d) An invalid payload that tries to send a branch-selection model is rejected.
 */

import { describe, it, expect } from 'vitest';
import {
  validateProjectionRequest,
  validateProjectionResponse,
  type ProjectionRequest,
  type ProjectionResponse,
  type SourceRef,
  type EvidenceEntry,
  type CompactDiagnostic,
} from './ProtocolIdeProjectionContracts.js';

// ---------------------------------------------------------------------------
// (a) Valid latest-state rerun request
// ---------------------------------------------------------------------------

describe('ProjectionRequest validation', () => {
  it('accepts a valid latest-state rerun request with all fields', () => {
    const validRequest: ProjectionRequest = {
      sessionRef: 'PIS-abc123',
      directiveText: 'Add 50 uL of buffer to wells B2-B4',
      rollingIssueSummary: '1 issue: wash-step volume mismatch.',
      sourceRefs: [
        {
          recordId: 'doc-extracted-text-001',
          label: 'Extracted text from source PDF',
          kind: 'document',
        },
        {
          recordId: 'evidence-snippet-002',
          label: 'Evidence: buffer specification',
          kind: 'evidence',
        },
      ],
      overlaySummaryToggles: {
        includeDeckSummary: true,
        includeToolsSummary: true,
        includeReagentsSummary: false,
        includeBudgetSummary: true,
      },
    };

    const result = validateProjectionRequest(validRequest);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.request.sessionRef).toBe('PIS-abc123');
      expect(result.request.directiveText).toBe('Add 50 uL of buffer to wells B2-B4');
      expect(result.request.rollingIssueSummary).toBe('1 issue: wash-step volume mismatch.');
      expect(result.request.sourceRefs).toHaveLength(2);
      expect(result.request.overlaySummaryToggles).toEqual({
        includeDeckSummary: true,
        includeToolsSummary: true,
        includeReagentsSummary: false,
        includeBudgetSummary: true,
      });
    }
  });

  it('accepts a valid request with minimal fields (no toggles)', () => {
    const minimalRequest: ProjectionRequest = {
      sessionRef: 'PIS-minimal',
      directiveText: 'Re-run the protocol',
      rollingIssueSummary: '',
      sourceRefs: [],
    };

    const result = validateProjectionRequest(minimalRequest);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.request.sessionRef).toBe('PIS-minimal');
      expect(result.request.sourceRefs).toHaveLength(0);
      expect(result.request.overlaySummaryToggles).toBeUndefined();
    }
  });

  it('rejects a request missing sessionRef', () => {
    const invalid = {
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [],
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('sessionRef');
    }
  });

  it('rejects a request missing directiveText', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      rollingIssueSummary: '',
      sourceRefs: [],
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('directiveText');
    }
  });

  it('rejects a request missing rollingIssueSummary', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      directiveText: 'test',
      sourceRefs: [],
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('rollingIssueSummary');
    }
  });

  it('rejects a request with non-object sourceRefs', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: 'not-an-array',
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('sourceRefs');
    }
  });

  it('rejects a request with a malformed source ref', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [{ recordId: '', label: 'test', kind: 'doc' }],
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('recordId');
    }
  });

  it('rejects a request with invalid overlaySummaryToggles type', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [],
      overlaySummaryToggles: 'not-an-object',
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('overlaySummaryToggles');
    }
  });

  // ---------------------------------------------------------------------------
  // (c) & (d) Reject forbidden fields (history, branch, compare)
  // ---------------------------------------------------------------------------

  it('rejects a request that includes a runHistory array (forbidden field)', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [],
      runHistory: [
        { runId: 'run-1', events: [] },
        { runId: 'run-2', events: [] },
      ],
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('runHistory');
      expect(result.error).toContain('not allowed');
    }
  });

  it('rejects a request that includes a branchSelection field (forbidden field)', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [],
      branchSelection: 'branch-A',
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('branchSelection');
      expect(result.error).toContain('not allowed');
    }
  });

  it('rejects a request that includes a compareView field (forbidden field)', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [],
      compareView: { baseline: 'run-1', current: 'run-2' },
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('compareView');
      expect(result.error).toContain('not allowed');
    }
  });

  it('rejects a request that includes a branchBase field (forbidden field)', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [],
      branchBase: 'PIS-base-001',
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('branchBase');
      expect(result.error).toContain('not allowed');
    }
  });

  it('rejects a request that includes a timeline field (forbidden field)', () => {
    const invalid = {
      sessionRef: 'PIS-abc',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [],
      timeline: ['2024-01-01', '2024-01-02'],
    };
    const result = validateProjectionRequest(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('timeline');
      expect(result.error).toContain('not allowed');
    }
  });

  it('rejects a non-object input', () => {
    const result = validateProjectionRequest('not-an-object');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('must be an object');
    }
  });

  it('rejects a null input', () => {
    const result = validateProjectionRequest(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('must be an object');
    }
  });
});

// ---------------------------------------------------------------------------
// (b) Valid latest-state response
// ---------------------------------------------------------------------------

describe('ProjectionResponse validation', () => {
  it('accepts a valid latest-state projection response', () => {
    const validResponse: ProjectionResponse = {
      status: 'success',
      eventGraphData: {
        recordId: 'graph-evt-001',
        eventCount: 42,
        description: 'Full protocol compilation with 42 events',
      },
      projectedProtocolRef: 'proto-xyz-789',
      projectedRunRef: 'run-planned-001',
      evidenceMap: {
        'node-1': [
          {
            evidenceRef: 'ev-001',
            description: 'Buffer specification from section 3.2',
            sourceLocation: 'page 5',
          },
        ],
        'node-2': [
          {
            evidenceRef: 'ev-002',
            description: 'Plate layout from figure 2',
          },
        ],
      },
      overlaySummaries: {
        deck: {
          summary: '3 slots in use: A1 (96-well), B1 (reservoir), C1 (tip-rack)',
          slotsInUse: 3,
          totalSlots: 12,
        },
        tools: {
          summary: 'P300 single-channel, P1000 single-channel',
          pipettes: [
            { type: 'p300_single', channels: 1 },
            { type: 'p1000_single', channels: 1 },
          ],
        },
        reagents: {
          summary: '2 reagents: PBS buffer, HeLa cells',
          reagentCount: 2,
        },
        budget: {
          summary: 'Estimated cost: $12.50',
          totalCost: 12.5,
          currency: 'USD',
        },
      },
      diagnostics: [
        {
          severity: 'info',
          title: 'All wells within pipette range',
          detail: 'No wells exceed the pipette volume cap.',
        },
        {
          severity: 'warning',
          title: 'Tip rack may need swapping',
          detail: 'Estimated tip usage exceeds single P300 rack capacity.',
          suggestedAction: 'Add a second P300 tip rack to the deck.',
        },
      ],
    };

    const result = validateProjectionResponse(validResponse);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.response.status).toBe('success');
      expect(result.response.eventGraphData.recordId).toBe('graph-evt-001');
      expect(result.response.eventGraphData.eventCount).toBe(42);
      expect(result.response.projectedProtocolRef).toBe('proto-xyz-789');
      expect(result.response.projectedRunRef).toBe('run-planned-001');
      expect(Object.keys(result.response.evidenceMap)).toHaveLength(2);
      expect(result.response.overlaySummaries.deck).toBeDefined();
      expect(result.response.overlaySummaries.tools).toBeDefined();
      expect(result.response.overlaySummaries.reagents).toBeDefined();
      expect(result.response.overlaySummaries.budget).toBeDefined();
      expect(result.response.diagnostics).toHaveLength(2);
    }
  });

  it('accepts a minimal valid response with only required fields', () => {
    const minimalResponse: ProjectionResponse = {
      status: 'partial',
      eventGraphData: {
        recordId: 'graph-min-001',
        eventCount: 0,
        description: '',
      },
      evidenceMap: {},
      diagnostics: [],
    };

    const result = validateProjectionResponse(minimalResponse);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.response.status).toBe('partial');
      expect(result.response.eventGraphData.eventCount).toBe(0);
      expect(result.response.evidenceMap).toEqual({});
      expect(result.response.diagnostics).toHaveLength(0);
      expect(result.response.overlaySummaries).toEqual({});
    }
  });

  it('accepts a failed response', () => {
    const failedResponse: ProjectionResponse = {
      status: 'failed',
      eventGraphData: {
        recordId: 'graph-fail-001',
        eventCount: 0,
        description: 'Compilation failed due to unresolved reference',
      },
      evidenceMap: {},
      diagnostics: [
        {
          severity: 'error',
          title: 'Unresolved reference',
          detail: 'Could not resolve "AhR-activator" in compound-class registry.',
          suggestedAction: 'Add the compound-class entry or use a known identifier.',
        },
      ],
    };

    const result = validateProjectionResponse(failedResponse);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.response.status).toBe('failed');
      expect(result.response.diagnostics[0].severity).toBe('error');
    }
  });

  it('rejects a response with invalid status', () => {
    const invalid = {
      status: 'unknown-status',
      eventGraphData: {
        recordId: 'graph-001',
        eventCount: 0,
        description: '',
      },
      evidenceMap: {},
      diagnostics: [],
    };
    const result = validateProjectionResponse(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('status');
    }
  });

  it('rejects a response missing eventGraphData', () => {
    const invalid = {
      status: 'success',
      evidenceMap: {},
      diagnostics: [],
    };
    const result = validateProjectionResponse(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('eventGraphData');
    }
  });

  it('rejects a response missing evidenceMap', () => {
    const invalid = {
      status: 'success',
      eventGraphData: {
        recordId: 'graph-001',
        eventCount: 0,
        description: '',
      },
      diagnostics: [],
    };
    const result = validateProjectionResponse(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('evidenceMap');
    }
  });

  it('rejects a response missing diagnostics', () => {
    const invalid = {
      status: 'success',
      eventGraphData: {
        recordId: 'graph-001',
        eventCount: 0,
        description: '',
      },
      evidenceMap: {},
    };
    const result = validateProjectionResponse(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('diagnostics');
    }
  });

  // ---------------------------------------------------------------------------
  // Reject forbidden fields in response
  // ---------------------------------------------------------------------------

  it('rejects a response that includes a runHistory array (forbidden field)', () => {
    const invalid = {
      status: 'success',
      eventGraphData: {
        recordId: 'graph-001',
        eventCount: 0,
        description: '',
      },
      evidenceMap: {},
      diagnostics: [],
      runHistory: [
        { runId: 'run-1', events: [] },
        { runId: 'run-2', events: [] },
      ],
    };
    const result = validateProjectionResponse(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('runHistory');
      expect(result.error).toContain('not allowed');
    }
  });

  it('rejects a response that includes a branchSelection field (forbidden field)', () => {
    const invalid = {
      status: 'success',
      eventGraphData: {
        recordId: 'graph-001',
        eventCount: 0,
        description: '',
      },
      evidenceMap: {},
      diagnostics: [],
      branchSelection: 'branch-A',
    };
    const result = validateProjectionResponse(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('branchSelection');
      expect(result.error).toContain('not allowed');
    }
  });

  it('rejects a response that includes a compareView field (forbidden field)', () => {
    const invalid = {
      status: 'success',
      eventGraphData: {
        recordId: 'graph-001',
        eventCount: 0,
        description: '',
      },
      evidenceMap: {},
      diagnostics: [],
      compareView: { baseline: 'run-1', current: 'run-2' },
    };
    const result = validateProjectionResponse(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('compareView');
      expect(result.error).toContain('not allowed');
    }
  });

  it('rejects a non-object input for response', () => {
    const result = validateProjectionResponse('not-an-object');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('must be an object');
    }
  });

  it('rejects a null input for response', () => {
    const result = validateProjectionResponse(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('must be an object');
    }
  });
});

// ---------------------------------------------------------------------------
// Type-level tests — ensure the types are correctly defined
// ---------------------------------------------------------------------------

describe('Type-level checks', () => {
  it('ProjectionRequest has all required fields', () => {
    const req: ProjectionRequest = {
      sessionRef: 'PIS-test',
      directiveText: 'test',
      rollingIssueSummary: '',
      sourceRefs: [],
    };
    expect(req.sessionRef).toBeDefined();
    expect(req.directiveText).toBeDefined();
    expect(req.rollingIssueSummary).toBeDefined();
    expect(req.sourceRefs).toBeDefined();
  });

  it('ProjectionResponse has all required fields', () => {
    const resp: ProjectionResponse = {
      status: 'success',
      eventGraphData: {
        recordId: 'g-1',
        eventCount: 0,
        description: '',
      },
      evidenceMap: {},
      diagnostics: [],
    };
    expect(resp.status).toBeDefined();
    expect(resp.eventGraphData.recordId).toBeDefined();
    expect(resp.eventGraphData.eventCount).toBeDefined();
    expect(resp.evidenceMap).toBeDefined();
    expect(resp.diagnostics).toBeDefined();
  });

  it('SourceRef is a simple record with recordId, label, kind', () => {
    const ref: SourceRef = {
      recordId: 'doc-1',
      label: 'Test doc',
      kind: 'document',
    };
    expect(ref.recordId).toBe('doc-1');
    expect(ref.label).toBe('Test doc');
    expect(ref.kind).toBe('document');
  });

  it('EvidenceEntry has evidenceRef, description, optional sourceLocation', () => {
    const entry: EvidenceEntry = {
      evidenceRef: 'ev-1',
      description: 'Test evidence',
      sourceLocation: 'page 1',
    };
    expect(entry.evidenceRef).toBe('ev-1');
    expect(entry.description).toBe('Test evidence');
    expect(entry.sourceLocation).toBe('page 1');
  });

  it('CompactDiagnostic has severity, title, detail, optional suggestedAction', () => {
    const diag: CompactDiagnostic = {
      severity: 'warning',
      title: 'Test warning',
      detail: 'Test detail',
      suggestedAction: 'Fix it',
    };
    expect(diag.severity).toBe('warning');
    expect(diag.title).toBe('Test warning');
    expect(diag.detail).toBe('Test detail');
    expect(diag.suggestedAction).toBe('Fix it');
  });

  it('OverlaySummaryToggles has optional boolean fields', () => {
    const toggles = {
      includeDeckSummary: true,
      includeToolsSummary: false,
      includeReagentsSummary: true,
      includeBudgetSummary: false,
    };
    expect(toggles.includeDeckSummary).toBe(true);
    expect(toggles.includeToolsSummary).toBe(false);
    expect(toggles.includeReagentsSummary).toBe(true);
    expect(toggles.includeBudgetSummary).toBe(false);
  });

  it('DeckSummarySlot has summary, slotsInUse, totalSlots', () => {
    const deck = {
      summary: '3 slots in use',
      slotsInUse: 3,
      totalSlots: 12,
    };
    expect(deck.summary).toBe('3 slots in use');
    expect(deck.slotsInUse).toBe(3);
    expect(deck.totalSlots).toBe(12);
  });

  it('ToolsSummarySlot has summary and pipettes array', () => {
    const tools = {
      summary: 'P300 and P1000',
      pipettes: [
        { type: 'p300_single', channels: 1 },
        { type: 'p1000_single', channels: 1 },
      ],
    };
    expect(tools.summary).toBe('P300 and P1000');
    expect(tools.pipettes).toHaveLength(2);
  });

  it('ReagentsSummarySlot has summary and reagentCount', () => {
    const reagents = {
      summary: '2 reagents',
      reagentCount: 2,
    };
    expect(reagents.summary).toBe('2 reagents');
    expect(reagents.reagentCount).toBe(2);
  });

  it('BudgetSummarySlot has summary with optional cost and currency', () => {
    const budget = {
      summary: '$12.50',
      totalCost: 12.5,
      currency: 'USD',
    };
    expect(budget.summary).toBe('$12.50');
    expect(budget.totalCost).toBe(12.5);
    expect(budget.currency).toBe('USD');
  });
});
