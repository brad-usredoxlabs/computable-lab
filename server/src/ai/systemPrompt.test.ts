import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './systemPrompt.js';

describe('buildSystemPrompt', () => {
  it('formats well-state concentration truth and counts explicitly', () => {
    const prompt = buildSystemPrompt({
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
      wellStateSnapshot: [
        {
          labwareId: 'plate-1',
          labwareName: 'Assay Plate',
          wellId: 'A1',
          totalVolume_uL: 50,
          materials: [
            {
              label: 'Clofibrate',
              volume_uL: 10,
              concentrationUnknown: true,
              aliquotRefId: 'ALQ-001',
            },
            {
              label: 'Cells',
              volume_uL: 40,
              concentration: { value: 25000, unit: 'cells/mL', basis: 'count_per_volume' },
              count: 1000,
            },
          ],
          eventCount: 2,
          harvested: false,
        },
      ],
    });

    expect(prompt).toContain('concentration=unknown');
    expect(prompt).toContain('aliquot=ALQ-001');
    expect(prompt).toContain('25000 cells/mL');
    expect(prompt).toContain('count=1000.000');
  });

  it('formats GraphLemur revision context with source-preserving instructions', () => {
    const prompt = buildSystemPrompt({
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer', 'mix'],
      graphLemur: {
        revisionMode: true,
        sourcePdf: {
          title: 'Vendor DNA Extraction Protocol',
          vendor: 'thermo',
          url: 'https://vendor.example/protocol.pdf',
          artifactPath: 'artifacts/foundry/pdfs/protocol.pdf',
          sha256: 'abc123',
        },
        sourceProtocolCandidate: {
          kind: 'vendor-protocol-candidate',
          title: 'Vendor DNA Extraction Protocol',
          source: { documentId: 'doc-1', vendor: 'thermo', url: 'https://vendor.example/protocol.pdf' },
          steps: [{
            stepNumber: 1,
            text: 'Add lysis buffer to each well.',
            evidence: [{ pageNumber: 2, snippet: 'Add lysis buffer' }],
            confidence: 0.9,
          }],
          diagnostics: [{
            code: 'TABLE_AMBIGUOUS',
            severity: 'warning',
            message: 'Volume table was ambiguous.',
          }],
        },
        currentPreviewDraft: {
          events: [{ event_type: 'add_material', details: { volume: { value: 100, unit: 'uL' } } }],
          labwareRequirements: [],
          labwareAdditions: [],
          sourcePrompt: 'Draft this protocol in 96-well plates.',
        },
        revisionHistory: [{ prompt: 'Use deepwell plates.', createdAt: '2026-06-03T00:00:00.000Z' }],
      },
    });

    expect(prompt).toContain('## GraphLemur Context');
    expect(prompt).toContain('GraphLemur operating contract:');
    expect(prompt).toContain('Preserve source evidence anchors');
    expect(prompt).toContain('Mode: revise the current source-backed preview draft.');
    expect(prompt).toContain('Use the current preview draft as the baseline');
    expect(prompt).toContain('Return a full replacement draft, not a partial patch.');
    expect(prompt).toContain('Current preview draft to revise:');
    expect(prompt).toContain('Prior user corrections:');
  });

  it('formats generic preview revision context without GraphLemur wording', () => {
    const prompt = buildSystemPrompt({
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
      draftRevision: {
        currentPreviewDraft: {
          events: [{ event_type: 'transfer', details: { volume: { value: 10, unit: 'uL' } } }],
          labwareRequirements: [{ classCurie: 'CL:96_well_plate', deckSlot: 'B2' }],
          labwareAdditions: [],
          sourcePrompt: 'Transfer 10 uL to row A.',
          sourceSkips: ['CL:reservoir: deck slot unavailable'],
        },
        revisionHistory: [{ prompt: 'Use B2.', createdAt: '2026-06-03T00:00:00.000Z' }],
      },
    });

    expect(prompt).toContain('## Preview Revision Context');
    expect(prompt).toContain('Mode: revise the current ghost preview draft.');
    expect(prompt).toContain('Current preview draft to revise:');
    expect(prompt).toContain('Return a full replacement draft, not a partial patch.');
    expect(prompt).toContain('Prior user corrections:');
    expect(prompt).toContain('CL:reservoir: deck slot unavailable');
    expect(prompt).not.toContain('## GraphLemur Context');
  });

});
