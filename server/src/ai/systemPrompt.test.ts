import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './systemPrompt.js';

describe('buildSystemPrompt', () => {
  it('renders protocol-step context (protocol planning) as a dedicated block', () => {
    const prompt = buildSystemPrompt({
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
      protocolStepContext: {
        stepId: 'step-2',
        stepLabel: 'Seal and read',
        highlightedSection: 'Seal the plate and read fluorescence over 60 min.',
      },
    });

    expect(prompt).toContain('CURRENT PROTOCOL STEP (protocol planning):');
    expect(prompt).toContain('Step: Seal and read (step-2)');
    expect(prompt).toContain('User-highlighted detail: "Seal the plate and read fluorescence over 60 min."');
    expect(prompt).toContain('Adapt exactly THIS step to this lab');
  });

  it('renders localProtocolSetup sections for the localization surface', () => {
    const prompt = buildSystemPrompt({
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
      protocolStepContext: {
        stepId: 'step-1',
        stepLabel: 'Add treatment',
        highlightedSection: '',
      },
      localProtocolSetup: {
        labwares: [
          { role: 'Sample plate', ref: { kind: 'record', id: 'LBW-0001', type: 'labware', label: '96-well PCR plate' } },
        ],
        materials: [
          { role: 'Treatment', description: 'Rotenone 1uM', ref: { kind: 'record', id: 'MAT-1', type: 'material-spec', label: 'Rotenone 1µM' } },
        ],
        equipment: [],
      },
    });

    expect(prompt).toContain('Plate setup (this lab)');
    expect(prompt).toContain('Sample plate → 96-well PCR plate (LBW-0001)');
    expect(prompt).toContain('Treatment → Rotenone 1µM (MAT-1) — Rotenone 1uM');
    // Empty sections contribute no rows
    expect(prompt).not.toContain('Equipment: ');
  });

  it('renders pending setup rows (no ref yet) as "not set yet"', () => {
    const prompt = buildSystemPrompt({
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
      localProtocolSetup: {
        labwares: [{ role: 'Sample plate' }],
      },
    });

    expect(prompt).toContain('Sample plate → not set yet');
  });
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
