// @vitest-environment node
/**
 * L2-JOURNEY-HUMANTASK-1 (unit htcreceipt), RED-first: completion fires only
 * on the COMMITTED record — (a) versioned members -> receipt in member order;
 * (b) staged draft only -> not_committed, no receipt; (c) visit, no candidate
 * -> no_selection; (d) kind outside the contract -> kind_mismatch verbatim;
 * (e) member without revisionRef -> member_unversioned naming the member;
 * (f) receipt validates against the receipt schema under ONE strict Ajv2020;
 * (g) committed + still-listed-as-draft is committed; (h) governed_write ->
 * completion_kind_unsupported. Arm (a)'s fixture is in REVERSE id order so a
 * sorting mutation goes RED; arm (d)'s 'reagent' defeats any kind table.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import {
  decideHumanTaskCompletion,
  RULE_HUMAN_TASK_COMPLETION_KIND_UNSUPPORTED,
  RULE_HUMAN_TASK_KIND_MISMATCH,
  RULE_HUMAN_TASK_MEMBER_UNVERSIONED,
  RULE_HUMAN_TASK_NO_SELECTION,
  RULE_HUMAN_TASK_NOT_COMMITTED,
} from './humanTaskCompletion.js';

const SCHEMA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../schema');
/** Contract fragment: run-plan's registry kinds; 'protocol-step' defeats any hardcoded table. */
const contract = (overrides: Record<string, unknown> = {}): unknown => ({
  selectable_kinds: ['protocol-step', 'event'],
  completion: { kind: 'versioned_selection', receipt_required: true },
  ...overrides,
});
const member = (id: string, revisionId: string, type = 'protocol-step'): Record<string, unknown> =>
  ({ kind: 'record', type, id, revisionRef: { kind: 'record', type: 'record-revision', id: revisionId } });
/** Envelope-shaped committed record — the shipped RecordEnvelope spelling (recordId, not id). */
const committed = (members: Record<string, unknown>[], recordId = 'REC-COLLECTION-1'): Record<string, unknown> =>
  ({ recordId, schemaId: 'https://computable-lab.com/schema/computable-lab/collection.schema.yaml', payload: { members } });
const NOW = '2026-11-13T06:00:00.000Z';

describe('decideHumanTaskCompletion', () => {
  it('(a) committed record with versioned members yields a receipt in member order', () => {
    const out = decideHumanTaskCompletion({
      task_id: 'task-select-step', contract: contract(),
      candidate: { record_id: 'REC-COLLECTION-1' },
      committed_record: committed([member('MEMBER-B', 'REV-BBB2'), member('MEMBER-A', 'REV-AAA1')]),
      staged_draft_ids: [], now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.receipt.record_id).toBe('REC-COLLECTION-1');
    expect(out.receipt.member_refs).toEqual([
      { record_id: 'MEMBER-B', revision_id: 'REV-BBB2' },
      { record_id: 'MEMBER-A', revision_id: 'REV-AAA1' },
    ]);
  });
  it('(b) a staged draft with no committed record is refused as not committed', () => {
    const out = decideHumanTaskCompletion({
      task_id: 'task-select-step', contract: contract(),
      candidate: { record_id: 'DRAFT-STAGED-9' }, staged_draft_ids: ['DRAFT-STAGED-9'], now: NOW,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect('receipt' in out).toBe(false);
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0].rule).toBe(RULE_HUMAN_TASK_NOT_COMMITTED);
    expect(out.diagnostics[0].message).toContain('task-select-step');
  });
  it('(c) a surface visit with no candidate is refused as no selection', () => {
    const out = decideHumanTaskCompletion({ task_id: 'task-select-step', contract: contract(), staged_draft_ids: [], now: NOW });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics[0].rule).toBe(RULE_HUMAN_TASK_NO_SELECTION);
  });
  it('(d) a member kind outside the contract selectable_kinds quotes the kind verbatim', () => {
    const out = decideHumanTaskCompletion({
      task_id: 'task-select-step', contract: contract(),
      candidate: { record_id: 'REC-COLLECTION-1' },
      committed_record: committed([member('MEMBER-A', 'REV-AAA1'), member('MEMBER-B', 'REV-BBB2', 'reagent')]),
      staged_draft_ids: [], now: NOW,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0].rule).toBe(RULE_HUMAN_TASK_KIND_MISMATCH);
    expect(out.diagnostics[0].message).toContain("'reagent'");
  });
  it('(e) a member without a revisionRef names the member as unversioned', () => {
    const bare = { kind: 'record', type: 'protocol-step', id: 'MEMBER-Z' };
    const out = decideHumanTaskCompletion({
      task_id: 'task-select-step', contract: contract(),
      candidate: { record_id: 'REC-COLLECTION-1' },
      committed_record: committed([member('MEMBER-A', 'REV-AAA1'), bare]),
      staged_draft_ids: [], now: NOW,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0].rule).toBe(RULE_HUMAN_TASK_MEMBER_UNVERSIONED);
    expect(out.diagnostics[0].message).toContain('MEMBER-Z');
  });
  it('(f) the receipt validates against the receipt schema under one strict Ajv', () => {
    const out = decideHumanTaskCompletion({
      task_id: 'task-select-step', contract: contract(),
      candidate: { record_id: 'REC-COLLECTION-1' },
      committed_record: committed([member('MEMBER-A', 'REV-AAA1')]),
      staged_draft_ids: [], now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const schemaText = readFileSync(resolve(SCHEMA_DIR, 'workflow/human-task-receipt.schema.yaml'), 'utf8');
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormats(ajv); // same-instance formats, the shipped AjvValidator precedent
    const validate = ajv.compile(parse(schemaText));
    expect(validate(out.receipt)).toBe(true);
  });
  it('(g) a committed record still listed in staged_draft_ids is committed', () => {
    const out = decideHumanTaskCompletion({
      task_id: 'task-select-step', contract: contract(),
      candidate: { record_id: 'REC-COLLECTION-1' },
      committed_record: committed([member('MEMBER-A', 'REV-AAA1')]),
      staged_draft_ids: ['REC-COLLECTION-1'], now: NOW,
    });
    expect(out.ok).toBe(true);
  });
  it('(h) a governed_write contract never receives a selection receipt', () => {
    const out = decideHumanTaskCompletion({
      task_id: 'task-select-step', contract: contract({ completion: { kind: 'governed_write', receipt_required: true } }),
      candidate: { record_id: 'REC-COLLECTION-1' },
      committed_record: committed([member('MEMBER-A', 'REV-AAA1')]),
      staged_draft_ids: [], now: NOW,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0].rule).toBe(RULE_HUMAN_TASK_COMPLETION_KIND_UNSUPPORTED);
  });
});
