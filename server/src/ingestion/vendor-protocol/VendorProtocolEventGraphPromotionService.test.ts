import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  promoteVendorProtocolEventGraph,
} from './VendorProtocolEventGraphPromotionService.js';
import type { VendorProtocolEventGraphDraftResult } from './VendorProtocolEventGraphDraftService.js';

function draft(overrides: Partial<VendorProtocolEventGraphDraftResult> = {}): VendorProtocolEventGraphDraftResult {
  return {
    kind: 'vendor-protocol-event-graph-draft',
    sourceProtocolRef: {
      documentId: 'doc-example-protocol',
      title: 'Example Protocol',
    },
    candidateSummary: {
      stepCount: 1,
      materialCount: 1,
      labwareCount: 1,
      equipmentCount: 0,
    },
    compilePrompt: 'Protocol: Example Protocol\nSteps:\n1. Add buffer.',
    compileStatus: 'complete',
    compile: {
      outcome: 'complete',
      eventCount: 1,
      labwareAdditionCount: 1,
      unresolvedRefCount: 0,
      events: [{
        eventId: 'evt-add-1',
        event_type: 'add_material',
        details: { material: 'buffer', volume_uL: 100, wells: ['A1'] },
        labwareId: 'lw-1',
      }],
      labwareAdditions: [{
        recordId: 'lbw-def-generic-96-well-plate',
        reason: 'compiled from vendor protocol',
        deckSlot: 'B2',
      }],
      diagnostics: [],
      terminalArtifacts: {
        events: [],
        directives: [],
        gaps: [],
      },
    },
    eventGraph: {
      kind: 'event-graph',
      id: 'vendor-protocol-draft-doc-example-protocol',
      name: 'Example Protocol Draft Event Graph',
      description: 'Draft event graph generated from vendor protocol candidate doc-example-protocol.',
      status: 'draft',
      sourceProtocolRef: {
        documentId: 'doc-example-protocol',
        title: 'Example Protocol',
      },
      events: [{
        eventId: 'evt-add-1',
        event_type: 'add_material',
        details: { material: 'buffer', volume_uL: 100, wells: ['A1'] },
        labwareId: 'lw-1',
      }],
      labwares: [{
        labwareId: 'lw-1',
        labwareType: 'lbw-def-generic-96-well-plate',
        name: 'lbw-def-generic-96-well-plate',
        deckSlot: 'B2',
        reason: 'compiled from vendor protocol',
      }],
      tags: ['vendor-protocol', 'draft'],
    },
    ...overrides,
  };
}

describe('VendorProtocolEventGraphPromotionService', () => {
  it('promotes a draft event graph to canonical event-graph YAML with provenance sidecar', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-promote-'));
    try {
      const result = await promoteVendorProtocolEventGraph({
        workspaceRoot,
        draft: draft(),
      });

      expect(result.status).toBe('promoted');
      expect(result.outputPath).toMatch(/^records\/event-graph\//);
      expect(result.sidecarPath).toMatch(/\.promotion\.json$/);
      expect(result.promotedEventGraph).toMatchObject({
        kind: 'event-graph',
        recordId: 'vendor-protocol-draft-doc-example-protocol',
        protocolId: 'doc-example-protocol',
      });
      expect(result.promotedEventGraph).not.toHaveProperty('sourceProtocolRef');
      const yaml = await readFile(join(workspaceRoot, result.outputPath!), 'utf-8');
      expect(yaml).toContain('$schema: https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml');
      expect(yaml).toContain('kind: event-graph');
      expect(yaml).toContain('deckLayout:');
      const sidecar = JSON.parse(await readFile(join(workspaceRoot, result.sidecarPath!), 'utf-8'));
      expect(sidecar.kind).toBe('vendor-protocol-event-graph-promotion-sidecar');
      expect(sidecar.sourceProtocolRef.documentId).toBe('doc-example-protocol');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('blocks incomplete or empty drafts unless explicitly allowed', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-promote-blocked-'));
    try {
      const incomplete = await promoteVendorProtocolEventGraph({
        workspaceRoot,
        draft: draft({
          compileStatus: 'gap',
          eventGraph: {
            ...draft().eventGraph,
            events: [],
          },
        }),
      });

      expect(incomplete.status).toBe('blocked');
      expect(incomplete.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
        'compile_not_complete',
        'empty_event_graph',
      ]));

      const allowed = await promoteVendorProtocolEventGraph({
        workspaceRoot,
        draft: draft({
          compileStatus: 'gap',
          eventGraph: {
            ...draft().eventGraph,
            events: [],
          },
        }),
        allowIncompleteCompile: true,
        allowEmptyEvents: true,
      });
      expect(allowed.status).toBe('promoted');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('blocks overwrite by default', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-promote-overwrite-'));
    try {
      const first = await promoteVendorProtocolEventGraph({ workspaceRoot, draft: draft() });
      expect(first.status).toBe('promoted');
      const second = await promoteVendorProtocolEventGraph({ workspaceRoot, draft: draft() });
      expect(second.status).toBe('blocked');
      expect(second.blockers[0]).toMatchObject({ code: 'record_exists' });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
