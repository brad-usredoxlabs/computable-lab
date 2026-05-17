/**
 * ProtocolIdeRalphExportService — exports all current issue cards into
 * Ralph-compatible spec drafts and clears the canvas.
 *
 * This service:
 * - Reads all current issue cards from a session
 * - Generates one Ralph-compatible spec draft per card (multi-spec, not monolithic)
 * - Each draft carries source context, directive context, evidence citations,
 *   and requested compiler changes derived from the card
 * - After a successful export, clears the current issue-card set from the session
 * - Retains only summary export metadata on the session
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type { IssueCard } from './ProtocolIdeIssueCardService.js';
import { renderPromptTemplate } from '../registry/PromptTemplateRegistry.js';
import { writeYamlFile } from '../foundry/FoundryArtifacts.js';

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

/**
 * A single Ralph-compatible spec draft generated from one issue card.
 */
export interface RalphSpecDraft {
  /** Unique identifier for this draft */
  id: string;
  /** Short title derived from the issue card */
  title: string;
  /** Priority number (sequential within the bundle) */
  priority: number;
  /** Markdown content of the spec draft */
  markdown: string;
  /** Source issue card this draft was generated from */
  sourceCardId: string;
  /** Evidence citations carried from the card */
  evidenceCitations: Array<{
    sourceRef: string;
    snippet?: string;
    page?: number;
  }>;
  /** ISO 8601 timestamp of generation */
  generatedAt: string;
}

/**
 * On-disk queue metadata written for a submitted Ralph bundle.
 */
export interface RalphQueueSubmission {
  kind: 'protocol-ide-ralph-queue-submission';
  queueRoot: string;
  bundleDir: string;
  indexPath: string;
  draftPaths: Array<{
    draftId: string;
    path: string;
  }>;
}

/**
 * A complete export bundle containing multiple spec drafts.
 */
export interface RalphExportBundle {
  /** Unique bundle identifier */
  bundleId: string;
  /** Session this bundle was exported from */
  sessionId: string;
  /** Number of cards exported */
  cardCount: number;
  /** Number of spec drafts produced */
  draftCount: number;
  /** The spec drafts */
  drafts: RalphSpecDraft[];
  /** ISO 8601 timestamp of export */
  exportedAt: string;
  /** File queue metadata when the bundle was submitted to an on-disk Ralph queue. */
  queue?: RalphQueueSubmission;
}

/**
 * Response shape for the export operation.
 */
export interface ExportIssueCardsResponse {
  success: true;
  bundle: RalphExportBundle;
  /** The cleared card set (empty array) */
  clearedCards: IssueCard[];
}

/**
 * Response shape for checking if a session has exportable cards.
 */
export interface CanExportResponse {
  success: true;
  canExport: boolean;
  cardCount: number;
}

export interface RejectIssueCardsResponse {
  success: true;
  rejectedCardCount: number;
  rejectedAt: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _bundleCounter = 0;

/**
 * Generate a unique bundle ID.
 */
function generateBundleId(): string {
  _bundleCounter += 1;
  return `ralph-export-${Date.now().toString(36)}-${_bundleCounter.toString(36)}`;
}

/**
 * Generate a unique draft ID.
 */
function generateDraftId(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildSpecDraftMarkdown(
  card: IssueCard,
  priority: number,
  sessionId: string,
  sourcePdfUrl?: string,
  latestDirectiveText?: string,
): string {
  const evidence_block =
    (card.evidenceCitations ?? []).length > 0
      ? card.evidenceCitations
          .map(
            (c) =>
              `- **${c.sourceRef}**${c.page ? ` (page ${c.page})` : ''}${c.snippet ? ` — "${c.snippet}"` : ''}`,
          )
          .join('\n')
      : '_No citations_';

  const graph_anchor_block = card.graphAnchor
    ? `## Graph Anchor\n\n- Node ID: ${card.graphAnchor.nodeId}` +
      (card.graphAnchor.label ? `\n- Label: ${card.graphAnchor.label}` : '')
    : '';

  const requested_changes = card.suggestedChange ? card.suggestedChange : '';

  return renderPromptTemplate('protocol-ide.ralph-export.spec', {
    section_id: `spec-${String(priority).padStart(3, '0')}-ralph-export`,
    section_title: card.title,
    priority,
    source_pdf_url: sourcePdfUrl ?? '',
    session_id: sessionId,
    latest_directive: latestDirectiveText ?? '',
    origin: card.origin,
    card_id: card.id,
    description: card.body,
    evidence_block,
    graph_anchor_block,
    requested_changes,
  });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProtocolIdeRalphExportService {
  constructor(
    private store: RecordStore,
    private options: { queueRoot?: string } = {},
  ) {}

  /**
   * Check whether a session has exportable issue cards.
   *
   * @param sessionId — the Protocol IDE session ID
   * @returns whether cards can be exported and how many
   */
  async canExport(sessionId: string): Promise<CanExportResponse> {
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    const payload = envelope.payload as Record<string, unknown>;
    const raw = payload.issueCards;
    const cards = Array.isArray(raw) ? (raw as IssueCard[]) : [];

    return {
      success: true,
      canExport: cards.length > 0,
      cardCount: cards.length,
    };
  }

  /**
   * Export all current issue cards into Ralph-compatible spec drafts.
   *
   * This method:
   * 1. Reads all current issue cards from the session
   * 2. Generates one spec draft per card (multi-spec, not monolithic)
   * 3. Each draft carries source context, directive context, evidence citations,
   *    and requested compiler changes
   * 4. Clears the current issue-card set from the session
   * 5. Retains only summary export metadata on the session
   *
   * @param sessionId — the Protocol IDE session ID
   * @returns the export bundle and cleared cards
   */
  async exportIssueCards(
    sessionId: string,
    sourcePdfUrl?: string,
    latestDirectiveText?: string,
  ): Promise<ExportIssueCardsResponse> {
    // Fetch the current session
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    // Read current issue cards
    const payload = envelope.payload as Record<string, unknown>;
    const raw = payload.issueCards;
    const cards = Array.isArray(raw) ? (raw as IssueCard[]) : [];

    if (cards.length === 0) {
      throw new Error(`No issue cards to export for session '${sessionId}'`);
    }

    // Generate one spec draft per card (multi-spec, not monolithic)
    const drafts: RalphSpecDraft[] = cards.map((card, index) => {
      const evidenceCitations = card.evidenceCitations.map((c) => ({
        sourceRef: c.sourceRef,
        ...(c.snippet !== undefined ? { snippet: c.snippet } : {}),
        ...(c.page !== undefined ? { page: c.page } : {}),
      }));
      return {
        id: generateDraftId(),
        title: card.title,
        priority: index + 1,
        markdown: buildSpecDraftMarkdown(
          card,
          index + 1,
          sessionId,
          sourcePdfUrl,
          latestDirectiveText,
        ),
        sourceCardId: card.id,
        evidenceCitations,
        generatedAt: new Date().toISOString(),
      };
    });

    // Build the export bundle
    const bundle: RalphExportBundle = {
      bundleId: generateBundleId(),
      sessionId,
      cardCount: cards.length,
      draftCount: drafts.length,
      drafts,
      exportedAt: new Date().toISOString(),
    };
    const queue = await this.writeQueueBundle(bundle);
    if (queue) {
      bundle.queue = queue;
    }

    // Clear the current issue-card set from the session
    const clearedPayload = {
      ...(envelope.payload as Record<string, unknown>),
      issueCards: [],
      lastExportAt: new Date().toISOString(),
      lastExportBundleRef: {
        kind: 'record',
        id: bundle.bundleId,
        type: 'ralph-export-bundle',
      },
      ...(queue ? { lastRalphQueueSubmission: queue } : {}),
    };

    const clearedEnvelope: RecordEnvelope = {
      ...envelope,
      payload: clearedPayload,
    };

    const result = await this.store.update({
      envelope: clearedEnvelope,
      message: `Export ${cards.length} issue card(s) to Ralph spec drafts for session ${sessionId}`,
      skipLint: true,
    });

    if (!result.success) {
      throw new Error(
        `Failed to persist export metadata for session ${sessionId}: ${result.error ?? 'unknown error'}`,
      );
    }

    return {
      success: true,
      bundle,
      clearedCards: cards,
    };
  }

  /**
   * Retrieve the export bundle metadata for a session.
   *
   * @param sessionId — the Protocol IDE session ID
   * @returns the last export metadata, or null if no export has been done
   */
  async getLastExportMetadata(
    sessionId: string,
  ): Promise<{
    success: true;
    lastExportAt?: string;
    lastExportBundleRef?: { kind: string; id: string; type?: string };
  }> {
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    const payload = envelope.payload as Record<string, unknown>;

    const response: {
      success: true;
      lastExportAt?: string;
      lastExportBundleRef?: { kind: string; id: string; type?: string };
    } = {
      success: true,
    };
    if (typeof payload.lastExportAt === 'string') {
      response.lastExportAt = payload.lastExportAt;
    }
    if (payload.lastExportBundleRef && typeof payload.lastExportBundleRef === 'object') {
      response.lastExportBundleRef = payload.lastExportBundleRef as {
        kind: string;
        id: string;
        type?: string;
      };
    }
    return response;
  }

  /**
   * Reject all current issue cards without queuing them for Ralph.
   *
   * This lets a human reviewer discard redundant or incorrect architect/spec
   * recommendations while preserving an audit marker on the session.
   */
  async rejectIssueCards(sessionId: string, reason?: string): Promise<RejectIssueCardsResponse> {
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    const payload = envelope.payload as Record<string, unknown>;
    const raw = payload.issueCards;
    const cards = Array.isArray(raw) ? (raw as IssueCard[]) : [];
    const rejectedAt = new Date().toISOString();
    const clearedPayload = {
      ...payload,
      issueCards: [],
      lastIssueCardRejection: {
        rejectedAt,
        rejectedCardCount: cards.length,
        ...(reason && reason.trim() ? { reason: reason.trim() } : {}),
      },
    };

    const result = await this.store.update({
      envelope: {
        ...envelope,
        payload: clearedPayload,
      },
      message: `Reject ${cards.length} issue card(s) for session ${sessionId}`,
      skipLint: true,
    });

    if (!result.success) {
      throw new Error(
        `Failed to persist issue-card rejection for session ${sessionId}: ${result.error ?? 'unknown error'}`,
      );
    }

    const response: RejectIssueCardsResponse = {
      success: true,
      rejectedCardCount: cards.length,
      rejectedAt,
    };
    if (reason && reason.trim()) {
      response.reason = reason.trim();
    }
    return response;
  }

  private async writeQueueBundle(bundle: RalphExportBundle): Promise<RalphQueueSubmission | undefined> {
    if (!this.options.queueRoot) return undefined;

    const bundleDir = join(this.options.queueRoot, bundle.bundleId);
    const draftPaths = bundle.drafts.map((draft) => ({
      draftId: draft.id,
      path: join(bundleDir, `${draft.id}.md`),
    }));

    await mkdir(bundleDir, { recursive: true });
    for (const draft of bundle.drafts) {
      const draftPath = draftPaths.find((entry) => entry.draftId === draft.id)?.path;
      if (!draftPath) continue;
      await mkdir(dirname(draftPath), { recursive: true });
      await writeFile(draftPath, draft.markdown, 'utf-8');
    }

    const indexPath = join(bundleDir, 'index.yaml');
    const submission: RalphQueueSubmission = {
      kind: 'protocol-ide-ralph-queue-submission',
      queueRoot: this.options.queueRoot,
      bundleDir,
      indexPath,
      draftPaths,
    };
    await writeYamlFile(indexPath, {
      kind: submission.kind,
      bundleId: bundle.bundleId,
      sessionId: bundle.sessionId,
      cardCount: bundle.cardCount,
      draftCount: bundle.draftCount,
      exportedAt: bundle.exportedAt,
      drafts: bundle.drafts.map((draft) => ({
        id: draft.id,
        title: draft.title,
        priority: draft.priority,
        sourceCardId: draft.sourceCardId,
        path: draftPaths.find((entry) => entry.draftId === draft.id)?.path,
      })),
    });
    return submission;
  }
}
