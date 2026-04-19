/**
 * ROS (Reactive Oxygen Species) positive-control fixture.
 * 
 * This module provides in-memory fixture data for the ROS end-to-end golden test
 * (spec-066). It includes a minimal ROS protocol, material records, extraction text,
 * and a canned extraction-draft with candidates.
 * 
 * All data is hermetic - no disk IO or network calls required.
 */

import type { ExtractionCandidate } from '../../../extract/ExtractorAdapter.js';
import type { ResolutionCandidate } from '../../../extract/MentionResolver.js';

/**
 * Minimal ROS protocol record.
 * 
 * This is a simplified protocol for a ROS positive-control assay:
 * 1. Seed HepG2 cells in a 96-well plate
 * 2. Add H2O2 at varying concentrations
 * 3. Read fluorescence after incubation
 */
export const rosProtocol = {
  kind: 'protocol' as const,
  recordId: 'PRT-ros-positive-control-v1',
  title: 'ROS Positive Control Assay',
  version: '1.0.0',
  steps: [
    {
      stepId: 'seed-cells',
      kind: 'add_material',
      semantic_verb: {
        ref: { id: 'VERB-seed-cells' },
        canonical: 'seed_cells',
      },
      parameters: {
        material_ref: 'MAT-hepg2-cells',
        volume: '100 uL',
        target_container: 'plate-96-well-ros-001',
      },
    },
    {
      stepId: 'add-h2o2',
      kind: 'add_material',
      semantic_verb: {
        ref: { id: 'VERB-add-reagent' },
        canonical: 'add_reagent',
      },
      parameters: {
        material_ref: 'MAT-h2o2-stock',
        volume: '10 uL',
        target_container: 'plate-96-well-ros-001',
        concentration_gradient: [0, 10, 50, 100], // uM
      },
    },
    {
      stepId: 'incubate',
      kind: 'incubate',
      semantic_verb: {
        ref: { id: 'VERB-incubate' },
        canonical: 'incubate',
      },
      parameters: {
        target_container: 'plate-96-well-ros-001',
        duration: '30 min',
        temperature: '37C',
      },
    },
    {
      stepId: 'read-fluorescence',
      kind: 'read',
      semantic_verb: {
        ref: { id: 'VERB-read-fluorescence' },
        canonical: 'read_fluorescence',
      },
      parameters: {
        target_container: 'plate-96-well-ros-001',
        excitation_wavelength: '485 nm',
        emission_wavelength: '535 nm',
      },
    },
  ],
};

/**
 * Material records for the ROS assay.
 */
export const rosMaterials = [
  {
    kind: 'material-spec' as const,
    recordId: 'MAT-hepg2-cells',
    title: 'HepG2 Human Hepatocellular Carcinoma Cells',
    material_class: 'cell_line',
    source: 'ATCC',
    catalog_number: 'HB-8065',
  },
  {
    kind: 'material-spec' as const,
    recordId: 'MAT-h2o2-stock',
    title: 'Hydrogen Peroxide Stock Solution',
    material_class: 'chemical_reagent',
    cas_number: '7722-84-1',
    concentration: '30% w/w',
  },
  {
    kind: 'material-spec' as const,
    recordId: 'MAT-dcfh-da',
    title: 'DCFH-DA Fluorescent Probe',
    material_class: 'fluorescent_probe',
    cas_number: '40924-98-1',
    excitation_max: '485 nm',
    emission_max: '535 nm',
  },
];

/**
 * Sample extraction text describing a ROS experimental observation.
 * 
 * This simulates what an AI extractor might receive from a PDF or lab notebook.
 */
export const extractionText = `
In the ROS positive-control experiment, HepG2 cells were seeded in a 96-well plate
at a density of 10,000 cells per well. After 24 hours of incubation, hydrogen peroxide
(H2O2) was added at concentrations of 0, 10, 50, and 100 micromolar. The cells were
then incubated for 30 minutes at 37 degrees Celsius. Fluorescence readings were taken
using excitation at 485 nm and emission at 535 nm. The results showed a dose-dependent
increase in fluorescence intensity, with the 100 micromolar H2O2 treatment producing
approximately 5-fold higher signal compared to the vehicle control. This confirms that
the DCFH-DA probe successfully detected reactive oxygen species generation in response
to oxidative stress.
`;

/**
 * Canned extraction-draft record for the ROS observation.
 * 
 * This represents what the extraction pipeline would produce after processing
 * the extractionText through the extractor and mention resolver.
 */
export const extractionDraft = {
  kind: 'extraction-draft' as const,
  recordId: 'XDR-ros-v1',
  source_artifact: {
    kind: 'freetext' as const,
    id: 'ros-experiment-note-001',
  },
  status: 'pending_review' as const,
  candidates: [
    {
      target_kind: 'observation' as const,
      confidence: 0.92,
      draft: {
        kind: 'observation' as const,
        recordId: 'OBS-ros-v1',
        title: 'ROS Detection in HepG2 Cells',
        experiment_type: 'reactive_oxygen_species_assay',
        cell_line: 'HepG2',
        treatment: 'H2O2',
        concentrations: [0, 10, 50, 100],
        concentration_unit: 'micromolar',
        result: 'dose-dependent increase in fluorescence',
        fold_change: 5.0,
        conclusion: 'DCFH-DA probe successfully detected ROS generation',
      },
    },
    {
      target_kind: 'observation' as const,
      confidence: 0.78,
      draft: {
        kind: 'observation' as const,
        recordId: 'OBS-ros-method-v1',
        title: 'ROS Assay Methodology',
        assay_type: 'fluorescence_based_ros_detection',
        probe: 'DCFH-DA',
        excitation_wavelength: '485 nm',
        emission_wavelength: '535 nm',
        incubation_duration: '30 minutes',
        incubation_temperature: '37C',
      },
    },
  ] as ExtractionCandidate[],
  created_at: new Date().toISOString(),
};

/**
 * Resolution candidates for mention resolution.
 * 
 * This map provides the context needed for the mention resolver to disambiguate
 * terms in the extraction draft.
 */
export const resolveCandidates = new Map<string, ReadonlyArray<ResolutionCandidate>>([
  [
    'cell_line',
    [
      {
        name: 'HepG2',
        aliases: ['HepG2 cells', 'HB-8065'],
        record_id: 'MAT-hepg2-cells',
        kind: 'material-spec',
      },
    ],
  ],
  [
    'chemical_reagent',
    [
      {
        name: 'H2O2',
        aliases: ['hydrogen peroxide', 'H2O2 stock'],
        record_id: 'MAT-h2o2-stock',
        kind: 'material-spec',
      },
    ],
  ],
  [
    'fluorescent_probe',
    [
      {
        name: 'DCFH-DA',
        aliases: ['DCFH-DA probe', '2\',7\'-dichlorodihydrofluorescein diacetate'],
        record_id: 'MAT-dcfh-da',
        kind: 'material-spec',
      },
    ],
  ],
] as const);

/**
 * All fixture data exported as a single object.
 */
export const rosFixture = {
  protocol: rosProtocol,
  materials: rosMaterials,
  extractionText,
  extractionDraft,
  resolveCandidates,
} as const;

export default rosFixture;
