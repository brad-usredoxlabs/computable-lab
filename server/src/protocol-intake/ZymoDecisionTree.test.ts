/**
 * Zymo decision-tree golden regression — the original complaint was that
 * the PDF's if/then questions never materialized before drafting (they died
 * as a passive review gap). This test pins the intake pipeline's behavior on
 * the REAL ZymoBIOMICS 96 MagBead PDF: the lettered branches the extractor
 * captures must become REAL question axes (with step-gating conditions), and
 * the question gate must pass on the derived tree.
 *
 * NOTE: this vendor PDF's branch points are lysis-format choices (BashingBead
 * Rack vs ZR BashingBead Tubes) — a "DNA source" question is NOT stated as a
 * lettered branch here, so we assert on the derived shape (axis count,
 * conditions, then_stepIds, rebound predicate paths), not on any particular
 * vendor wording. AI-suggested questions (plan risk #2) would ADD a
 * dna-source axis later; that pass must never fabricate answers.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdfFile, extractVendorProtocolCandidate } from '../ingestion/vendor-protocol/VendorProtocolPdf.js';
import { deriveDecisionTree } from './deriveDecisionTree.js';
import { questionGate } from './ProtocolIntakeService.js';

const here = dirname(fileURLToPath(import.meta.url));
// This file is src/protocol-intake/ — three levels up to the repo root
// (the golden E2E under src/ingestion/vendor-protocol uses four).
const repoRoot = resolve(here, '../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

const SCALE_OPTIONS = [
  { level: 'manual_tubes' as const },
  { level: 'bench_plate_multichannel' as const },
  { level: 'robot_deck' as const },
];

describe('Zymo decision tree golden (intake question materialization)', () => {
  it('lettered PDF branches become question axes that gate steps', async () => {
    const document = await decodeVendorProtocolPdfFile(zymoPdfPath, {
      documentId: 'vendor-protocol-zymo-magbead',
    });
    const candidate = extractVendorProtocolCandidate(document);

    const branchySteps = candidate.steps.filter(
      (step) => new Set((step.branches ?? []).map((b) => b.trim()).filter(Boolean)).size >= 2,
    );
    // Ground truth of this fixture: the extractor captures branch points
    // (lysis-format a./b. choices on early steps). If extraction regressed
    // to zero, this test must fail — that IS the silent-drop bug.
    expect(branchySteps.length).toBeGreaterThanOrEqual(2);

    const tree = deriveDecisionTree({
      documentId: 'zymo-magbead',
      steps: candidate.steps.map((step) => ({
        stepNumber: step.stepNumber,
        stepId: step.id,
        branches: step.branches,
        sourceText: step.sourceText,
        actions: step.actions,
      })),
      tables: candidate.tables,
      scaleOptions: SCALE_OPTIONS,
    });

    // Every branchy step is gated by a question axis. Axes are grouped by
    // QUESTION (Phase 3): this document asks its lysis-format question in two
    // steps, so one axis gates both — the count is no longer 1:1 with steps,
    // and the invariant that matters is "no branchy step goes unasked".
    expect(tree.axes.length).toBeGreaterThanOrEqual(1);
    const gatedStepIds = new Set(
      tree.axes.flatMap((axis) => axis.conditions.flatMap((cond) => cond.then_stepIds ?? [])),
    );
    for (const step of branchySteps) {
      expect(gatedStepIds.has(step.id)).toBe(true);
    }
    // The shared question gates both of the steps that ask it.
    const sharedAxes = tree.axes.filter((axis) =>
      axis.conditions.every((cond) => (cond.then_stepIds ?? []).length >= 2),
    );
    expect(sharedAxes.length).toBeGreaterThanOrEqual(1);
    for (const axis of tree.axes) {
      // ...with >=2 options, each carrying the reviewer-facing question...
      expect(axis.conditions.length).toBeGreaterThanOrEqual(2);
      expect(axis.question.length).toBeGreaterThan(0);
      for (const cond of axis.conditions) {
        // ...and each answer actually gates steps (no decoration axes).
        expect(Array.isArray(cond.then_stepIds)).toBe(true);
        expect((cond.then_stepIds ?? []).length).toBeGreaterThan(0);
        // Predicate path is rebound per-axis so multi-axis choices resolve
        // independently ($.branchSelection.<axisId>, not the shared key).
        const predicate = cond.predicate as { path?: string } | undefined;
        expect(predicate?.path).toBe(`$.branchSelection.${axis.axisId}`);
      }
    }

    // The gate passes on a healthy derived tree...
    expect(questionGate(tree, branchySteps.length).ok).toBe(true);
    // ...and would refuse if the axes were silently dropped.
    const dropped = { ...tree, axes: [] };
    const verdict = questionGate(dropped, branchySteps.length);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe('derivation_silent_branch_drop');

    // Scale axis is the execution-scale question with all three levels —
    // tubes -> plate/multichannel -> robot.
    expect(tree.scaleAxis.options.map((o) => o.level)).toEqual([
      'manual_tubes',
      'bench_plate_multichannel',
      'robot_deck',
    ]);

    // Phase 3b — the document's own sample table ("Sample type maximum
    // input") IS a question, and step 1 ("...using the table below:") is the
    // step it gates. This is the "which are we extracting?" clarification the
    // review loop has to ask, derived from the PDF, not from an AI guess.
    const sampleAxis = tree.axes.find((axis) => axis.axisId === 'axis-sample-type');
    expect(sampleAxis).toBeDefined();
    expect(sampleAxis!.origin).toBe('document_table');
    expect(sampleAxis!.conditions.map((c) => c.label)).toEqual([
      'Feces',
      'Soil',
      'Liquid samples and swab collections',
      'Cells suspended in PBS',
      'Samples in DNA/RNA Shield',
    ]);
    expect(sampleAxis!.conditions.every((c) => (c.then_stepIds ?? []).length > 0)).toBe(true);
    const gatingIds = new Set(sampleAxis!.conditions.flatMap((c) => c.then_stepIds ?? []));
    expect(gatingIds.has(branchySteps[0]!.id)).toBe(true);
  });
});
