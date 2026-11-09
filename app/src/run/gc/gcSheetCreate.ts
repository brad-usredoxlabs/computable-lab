/**
 * GC-12 (deliverable D2) — the GC run-sheet CREATE chain, PURE.
 *
 * The create front door mints a chain of records in order (the GC-4
 * create-last discipline: the sequence HEADER is minted LAST so a partial
 * failure never leaves a header with dangling entryRefs). The lane DB has 0
 * requests / 0 samples / 0 parties (bait #12: build the chain, never assume
 * lane seed), so the minimal valid chain is:
 *
 *   person (PARTY-*)  -> request (REQ-*)  -> sample (SMP-*)  ->
 *   run (RUN-*)  -> entries (ISEN-*)  -> sequence header (ISEQ-*, LAST)
 *
 * Every payload is validated against the LIVE :3092 schemas (required sets:
 *   request: kind, recordId, requesterRef, status
 *   sample:  kind, recordId, requestRef, status
 *   party:   kind, recordId, name, partyType, status
 *   run:     kind, recordId, status
 *   entry:   kind, id, position, runRef, sampleRef, gcMethodRef
 *   sequence: kind, id, title, entryRefs).
 *
 * This module is PURE (no fetch, no React): it returns the ordered list of
 * { schemaId, payload, recordId } the create form POSTs via the EXISTING
 * createRecord. The component owns the POST order + the ref-wiring (each
 * later record's ref uses the earlier record's minted recordId).
 */

const SCHEMA = {
  party: 'https://computable-lab.com/schema/computable-lab/party.schema.yaml',
  request: 'https://computable-lab.com/schema/computable-lab/request.schema.yaml',
  sample: 'https://computable-lab.com/schema/computable-lab/sample.schema.yaml',
  run: 'https://computable-lab.com/schema/computable-lab/run.schema.yaml',
  entry: 'https://computable-lab.com/schema/computable-lab/instrument-sequence-entry.schema.yaml',
  sequence: 'https://computable-lab.com/schema/computable-lab/instrument-sequence.schema.yaml',
} as const

export interface CreateChainStep {
  schemaId: string
  recordId: string
  payload: Record<string, unknown>
}

/** The create form's inputs (the honest fields the scientist supplies). */
export interface GcSheetCreateInput {
  /** The run title (seeds the run recordId slug + the sequence title). */
  title: string
  /** The GC method record id to bind to each entry (a gc-method record). */
  gcMethodId: string
  /** The instrument record id (operatorRef on the header; optional). */
  instrumentId?: string
  /** The study record id (optional — the run may be unrooted). */
  studyId?: string
  /** The vial for the (single) entry row the front door mints. */
  vial: string
  /** The sample label (seeds the sample recordId slug + customerLabel). */
  sampleLabel: string
  /** A random id suffix (the caller supplies — keeps the model pure). */
  rand: string
}

/** A stable id from a slug + the caller-supplied rand (id patterns per schema). */
function slugify(text: string, max: number): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
}

/**
 * Build the ordered create chain. The caller POSTs the steps IN ORDER via
 * createRecord; each step's payload already carries the minted recordIds of
 * the earlier steps (the refs are wired at build time, not post-hoc).
 *
 * Order (create-last): person → request → sample → run → entry → sequence.
 * The sequence (header) is LAST — its entryRefs point at the minted entry,
 * and its runRef points at the minted run.
 */
export function buildGcSheetCreateChain(input: GcSheetCreateInput): CreateChainStep[] {
  const personId = `PARTY-${input.rand}`
  const requestId = `REQ-${input.rand}`
  const sampleId = `SMP-${input.rand}`
  const runId = `RUN-${slugify(input.title, 24) || 'untitled'}-${input.rand}`
  const entryId = `ISEN-${input.rand}`
  const sequenceId = `ISEQ-${input.rand}`

  const person: CreateChainStep = {
    schemaId: SCHEMA.party,
    recordId: personId,
    payload: {
      kind: 'party',
      recordId: personId,
      name: input.title || 'GC sheet requester',
      partyType: 'person',
      status: 'active',
    },
  }

  const request: CreateChainStep = {
    schemaId: SCHEMA.request,
    recordId: requestId,
    payload: {
      kind: 'request',
      recordId: requestId,
      requesterRef: { kind: 'record', id: personId, type: 'party' },
      status: 'submitted',
    },
  }

  const sample: CreateChainStep = {
    schemaId: SCHEMA.sample,
    recordId: sampleId,
    payload: {
      kind: 'sample',
      recordId: sampleId,
      requestRef: { kind: 'record', id: requestId, type: 'request' },
      status: 'registered',
      submittedDescription: { customerLabel: input.sampleLabel },
    },
  }

  const run: CreateChainStep = {
    schemaId: SCHEMA.run,
    recordId: runId,
    payload: {
      kind: 'run',
      recordId: runId,
      status: 'planned',
      title: input.title,
      ...(input.studyId ? { studyId: input.studyId } : {}),
    },
  }

  const entry: CreateChainStep = {
    schemaId: SCHEMA.entry,
    recordId: entryId,
    payload: {
      kind: 'instrument-sequence-entry',
      id: entryId,
      position: { vial: input.vial },
      // FAME-8 B4: the TYPED run-table label (schema-declared `sampleName` —
      // SAMPLE.XML <Name>). The form gate blocks an empty label, so the stamp
      // is the label as typed (no id-derived fallback). GcRunTable renders it
      // as a column; today the row shows only the SMP-/GCM- ids.
      sampleName: input.sampleLabel,
      runRef: { kind: 'record', id: runId, type: 'run' },
      sampleRef: { kind: 'record', id: sampleId, type: 'sample' },
      gcMethodRef: { kind: 'record', id: input.gcMethodId, type: 'gc-method' },
      state: 'draft',
    },
  }

  const sequence: CreateChainStep = {
    schemaId: SCHEMA.sequence,
    recordId: sequenceId,
    payload: {
      kind: 'instrument-sequence',
      id: sequenceId,
      title: input.title,
      runRef: { kind: 'record', id: runId, type: 'run' },
      entryRefs: [{ kind: 'record', id: entryId, type: 'instrument-sequence-entry' }],
      ...(input.instrumentId ? { instrumentRef: { kind: 'record', id: input.instrumentId, type: 'equipment' } } : {}),
    },
  }

  // create-last order.
  return [person, request, sample, run, entry, sequence]
}

/** The id the front door navigates to after the chain is minted (the run
 *  record — the /runs/:runId surface the section hangs off). */
export function gcSheetCreatedRunId(chain: CreateChainStep[]): string {
  return chain.find((s) => s.schemaId === SCHEMA.run)?.recordId ?? ''
}

/**
 * A sample-add to an EXISTING sheet (D3 / V7(c)): mint the minimal
 * party → request → sample → new-entry chain for ONE added row. The lane DB
 * has 0 requests/samples (bait #12), so a sample's required requestRef is
 * minted first. The new entry (ISEN-*) carries the chosen method + vial + the
 * minted sample, and is APPENDED to the sequence's entryRefs (append-only —
 * the existing rows are never dropped; bait #8's history discipline extended
 * to the row list). Returns the steps to POST in order + the sequence
 * entryRefs append payload the caller PUTs.
 */
export interface GcSampleAddInput {
  runId: string
  gcMethodId: string
  vial: string
  sampleLabel: string
  rand: string
}

export interface GcSampleAddResult {
  steps: CreateChainStep[]
  /** The new entry's recordId (the caller appends this to the sequence). */
  entryRecordId: string
}

export function buildGcSampleAdd(input: GcSampleAddInput): GcSampleAddResult {
  const personId = `PARTY-${input.rand}`
  const requestId = `REQ-${input.rand}`
  const sampleId = `SMP-${input.rand}`
  const entryId = `ISEN-${input.rand}`
  const steps: CreateChainStep[] = [
    {
      schemaId: SCHEMA.party,
      recordId: personId,
      payload: {
        kind: 'party',
        recordId: personId,
        name: input.sampleLabel || 'GC sheet requester',
        partyType: 'person',
        status: 'active',
      },
    },
    {
      schemaId: SCHEMA.request,
      recordId: requestId,
      payload: {
        kind: 'request',
        recordId: requestId,
        requesterRef: { kind: 'record', id: personId, type: 'party' },
        status: 'submitted',
      },
    },
    {
      schemaId: SCHEMA.sample,
      recordId: sampleId,
      payload: {
        kind: 'sample',
        recordId: sampleId,
        requestRef: { kind: 'record', id: requestId, type: 'request' },
        status: 'registered',
        submittedDescription: { customerLabel: input.sampleLabel },
      },
    },
    {
      schemaId: SCHEMA.entry,
      recordId: entryId,
      payload: {
        kind: 'instrument-sequence-entry',
        id: entryId,
        position: { vial: input.vial },
        // FAME-8 B4: the typed run-table label (see the sheet-create entry —
        // the same schema-declared field, stamped on the sample-add path too).
        sampleName: input.sampleLabel,
        runRef: { kind: 'record', id: input.runId, type: 'run' },
        sampleRef: { kind: 'record', id: sampleId, type: 'sample' },
        gcMethodRef: { kind: 'record', id: input.gcMethodId, type: 'gc-method' },
        state: 'draft',
      },
    },
  ]
  return { steps, entryRecordId: entryId }
}
