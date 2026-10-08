import { slugify } from '../ingestion/vendor-protocol/deriveBranchAxes.js';
import type { ProtocolCandidate } from '../ingestion/vendor-protocol/types.js';

/**
 * One child protocol carved out of a vendor handbook: a `kind: 'protocol'`
 * section, its steps, and any pretreatment/appendix sections whose titles are
 * mentioned by those steps.
 */
export interface HandbookChild {
  sectionId: string;
  sectionTitle: string;
  slug: string;
  stepIds: string[];
  attachedSectionIds: string[];
  /** Steps reached by an explicit “continue with step N of the protocol …”. */
  continuationStepIds: string[];
}

/** Collapse runs of whitespace (incl. newlines) to a single space, lowercased. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * A section is an attachment candidate if it is an appendix or its title
 * starts with "pretreatment" (pretreatment subsections of a protocol are
 * auxiliary to whichever protocol mentions them). Operates on non-protocol
 * sections only.
 */
function isAttachmentCandidate(title: string, kind: string): boolean {
  return kind === 'appendix' || /^\s*pretreatment\b/i.test(title);
}

/**
 * Pure predicate: does a handbook candidate split into multiple child
 * protocols, and how?
 *
 * Returns one child per `kind: 'protocol'` section (in candidate order) when
 * there are at least TWO protocol sections. Fewer than two means the document
 * is a single protocol, NOT a handbook — the caller must no-op and keep
 * whole-document behavior.
 *
 * Attachment: a pretreatment/appendix section attaches to every child whose
 * steps' sourceText mention the section title (case-insensitive,
 * whitespace-normalized on both sides). An attachment candidate mentioned by
 * NO child is left out of the result entirely — the caller keeps
 * whole-document behavior for it.
 *
 * A protocol section with zero steps still gets a child (with empty
 * stepIds): honesty over silence.
 */
export function splitHandbookSections(candidate: ProtocolCandidate): HandbookChild[] {
  // A printed pretreatment is an entry path too; its continuation points
  // forward into purification, rather than purification pointing back to it.
  const protocolSections = candidate.sections.filter((s) => s.kind === 'protocol');
  if (protocolSections.length < 2) return [];

  const stepsBySection = new Map<string, typeof candidate.steps>();
  for (const section of protocolSections) stepsBySection.set(section.id, []);
  for (const step of candidate.steps) {
    if (step.sectionId !== undefined) {
      const bucket = stepsBySection.get(step.sectionId);
      if (bucket) bucket.push(step);
    }
  }

  const children: HandbookChild[] = protocolSections.map((section) => ({
    sectionId: section.id,
    sectionTitle: section.title,
    slug: slugify(section.title),
    stepIds: (stepsBySection.get(section.id) ?? []).map((st) => st.id),
    attachedSectionIds: [],
    continuationStepIds: [],
  }));

  const attachmentCandidates = candidate.sections.filter(
    (s) => s.kind !== 'protocol' && isAttachmentCandidate(s.title, s.kind),
  );

  for (const attachment of attachmentCandidates) {
    const needle = normalize(attachment.title);
    if (!needle) continue;
    for (const child of children) {
      const steps = stepsBySection.get(child.sectionId) ?? [];
      const mentioned = steps.some((st) => normalize(st.sourceText).includes(needle));
      if (mentioned) child.attachedSectionIds.push(attachment.id);
    }
    // Unmentioned attachment candidates stay absent from every child:
    // the caller retains whole-document behavior for them.
  }

  for (const child of children) {
    // Follow only a uniquely named protocol and an existing entry step. Keep
    // the source ids and traversal order; a continuation is not an alternative.
    const visited = new Set([child.sectionId]);
    let steps = stepsBySection.get(child.sectionId) ?? [];
    while (steps.length > 0) {
      const last = steps[steps.length - 1]!;
      const ref = /continue with step\s+(\d+)([a-z]?)\s+of the protocol\s+[“"]([^”"]+)[”"]/i.exec(last.sourceText.replace(/\s+/g, ' '));
      if (!ref) break;
      const titleKey = (value: string) => normalize(value).replace(/[^a-z0-9]/g, '');
      const targets = protocolSections.filter((s) => titleKey(s.title) === titleKey(ref[3]!));
      if (targets.length !== 1 || visited.has(targets[0]!.id)) break;
      const target = targets[0]!;
      const targetSteps = stepsBySection.get(target.id) ?? [];
      const start = targetSteps.findIndex((s) => s.stepNumber === Number(ref[1]) && (s.substep ?? '') === (ref[2] ?? '').toLowerCase());
      if (start < 0) break;
      visited.add(target.id);
      steps = targetSteps.slice(start);
      child.continuationStepIds.push(...steps.map((s) => s.id));
    }
  }
  return children;
}

/**
 * Scope the (spine-annotated) parent candidate down to one handbook child:
 * the child's protocol section + attached sections, the steps they own, and
 * only the materials/labware/equipment/tables/notes/outputs whose provenance
 * points at a section in scope. Step ids are inherited VERBATIM from the
 * parent (no renumbering — the step-007 padding incident pattern).
 */
export function childCandidateFrom(
  parent: ProtocolCandidate,
  child: HandbookChild,
  childDocumentId: string,
): ProtocolCandidate {
  const selectedSections = new Set<string>([child.sectionId, ...child.attachedSectionIds]);
  const byId = new Map(parent.steps.map((step) => [step.id, step]));
  const orderedIds = [...child.stepIds, ...child.continuationStepIds];
  const steps = orderedIds.map((id) => byId.get(id)).filter((step) => step !== undefined);
  steps.push(...parent.steps.filter((step) => step.sectionId !== undefined && child.attachedSectionIds.includes(step.sectionId)));
  const scope = new Set([...selectedSections, ...steps.flatMap((step) => step.sectionId ? [step.sectionId] : [])]);
  const inScope = (item: { provenance?: { sectionId?: string } }): boolean =>
    item.provenance?.sectionId !== undefined && scope.has(item.provenance.sectionId);
  return {
    ...parent,
    title: child.sectionTitle,
    source: { ...parent.source, documentId: childDocumentId },
    // Continuation sections are dependencies, not choices between protocols.
    // Their original section/page provenance remains on every included step.
    sections: parent.sections.filter((s) => selectedSections.has(s.id)),
    steps,
    materials: parent.materials.filter(inScope),
    labware: parent.labware.filter(inScope),
    equipment: parent.equipment.filter(inScope),
    tables: parent.tables.filter(inScope),
    notes: parent.notes.filter(inScope),
    outputs: parent.outputs.filter(inScope),
  };
}
