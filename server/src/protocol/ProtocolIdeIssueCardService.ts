/**
 * ProtocolIdeIssueCardService — generates on-demand issue cards from
 * user feedback, rolling issue summary, and system diagnostics.
 *
 * This service is responsible for:
 * - Synthesizing a fresh set of issue cards from the latest session state
 * - Each card captures title, body, origin, evidence citations, graph anchors,
 *   and suggested compiler-change language
 * - Card generation REPLACES the current card set (no historical accumulation)
 *
 * v1 intentionally avoids:
 * - Continuous card generation (must be triggered by user action)
 * - Automatic spec export (cards are review artifacts first)
 * - Dropping evidence from diagnostics
 */

import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type {
  FeedbackComment,
  RollingIssueSummary,
} from './ProtocolIdeFeedbackService.js';
import type {
  DeckSummary,
  ToolsSummary,
  ReagentsSummary,
  BudgetSummary,
} from './ProtocolIdeOverlaySummaryService.js';
import { renderIssueCardTemplate } from '../registry/IssueCardTemplateRegistry.js';

// ---------------------------------------------------------------------------
// Issue-card types
// ---------------------------------------------------------------------------

/**
 * Origin of an issue card — where the issue was detected.
 */
export type IssueCardOrigin = 'user' | 'system' | 'mixed';

/**
 * A citation linking to source evidence (PDF, vendor doc, etc.).
 */
export interface EvidenceCitation {
  /** Reference to the source (e.g. vendor document ID, PDF URL) */
  sourceRef: string;
  /** Optional snippet or excerpt */
  snippet?: string;
  /** Optional page or line number */
  page?: number;
}

/**
 * A single issue card generated from session state.
 */
export interface IssueCard {
  /** Unique identifier for this card */
  id: string;
  /** Short, descriptive title */
  title: string;
  /** Detailed body describing the issue */
  body: string;
  /** Origin: user, system, or mixed */
  origin: IssueCardOrigin;
  /** Evidence citations linking to source documents */
  evidenceCitations: EvidenceCitation[];
  /** Optional graph anchor pointing to an event-graph node */
  graphAnchor?: {
    /** The event-graph node ID */
    nodeId: string;
    /** Optional label describing what the anchor refers to */
    label?: string;
  };
  /** Suggested compiler-change language that can seed Ralph specs */
  suggestedChange?: string;
  /** ISO 8601 timestamp of generation */
  generatedAt: string;
}

/**
 * Response shape for generating issue cards.
 */
export interface GenerateIssueCardsResponse {
  success: true;
  cards: IssueCard[];
  cardCount: number;
}

/**
 * Response shape for retrieving the current issue-card set.
 */
export interface GetIssueCardsResponse {
  success: true;
  cards: IssueCard[];
  cardCount: number;
}

/**
 * Response shape for replacing the issue-card set.
 */
export interface ReplaceIssueCardsResponse {
  success: true;
  cards: IssueCard[];
  cardCount: number;
}

// ---------------------------------------------------------------------------
// Diagnostics shape — compact system diagnostics from the overlay summaries
// ---------------------------------------------------------------------------

/**
 * Compact diagnostics derived from overlay summaries.
 */
export interface CompactDiagnostics {
  /** Deck layout issues (conflicts, missing labware, etc.) */
  deckIssues: string[];
  /** Tool/instrument issues (pipette too coarse, missing mounts, etc.) */
  toolIssues: string[];
  /** Reagent issues (missing concentrations, unknown kinds, etc.) */
  reagentIssues: string[];
  /** Budget issues (missing costs, unknown vendors, etc.) */
  budgetIssues: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique issue-card ID.
 */
function generateIssueCardId(): string {
  return `ic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Extract feedback comments from a session envelope's payload.
 */
function extractCommentsFromEnvelope(
  envelope: RecordEnvelope,
): FeedbackComment[] {
  const payload = envelope.payload as Record<string, unknown>;
  const raw = payload.feedbackComments;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw as unknown as FeedbackComment[];
}

/**
 * Extract the rolling issue summary from a session envelope's payload.
 */
function extractRollingSummaryFromEnvelope(
  envelope: RecordEnvelope,
): RollingIssueSummary | null {
  const payload = envelope.payload as Record<string, unknown>;
  const raw = payload.rollingIssueSummary;
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    updatedAt:
      typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
    commentCount:
      typeof obj.commentCount === 'number' ? obj.commentCount : 0,
  };
}

/**
 * Extract the overlay summaries from a session envelope's payload.
 */
function extractOverlaySummariesFromEnvelope(
  envelope: RecordEnvelope,
): {
  deck: DeckSummary | null;
  tools: ToolsSummary | null;
  reagents: ReagentsSummary | null;
  budget: BudgetSummary | null;
} {
  const payload = envelope.payload as Record<string, unknown>;

  const extractSummary = (
    key: string,
  ): DeckSummary | ToolsSummary | ReagentsSummary | BudgetSummary | null => {
    const raw = payload[key];
    if (raw === null || raw === undefined || typeof raw !== 'object') {
      return null;
    }
    return raw as DeckSummary | ToolsSummary | ReagentsSummary | BudgetSummary | null;
  };

  return {
    deck: extractSummary('latestDeckSummary') as DeckSummary | null,
    tools: extractSummary('latestToolsSummary') as ToolsSummary | null,
    reagents: extractSummary('latestReagentsSummary') as ReagentsSummary | null,
    budget: extractSummary('latestBudgetSummary') as BudgetSummary | null,
  };
}

/**
 * Extract evidence links from overlay summaries into compact diagnostics.
 */
function deriveCompactDiagnostics(
  deck: DeckSummary | null,
  tools: ToolsSummary | null,
  reagents: ReagentsSummary | null,
  budget: BudgetSummary | null,
): CompactDiagnostics {
  const deckIssues: string[] = [];
  const toolIssues: string[] = [];
  const reagentIssues: string[] = [];
  const budgetIssues: string[] = [];

  // Deck issues: conflicts, missing labware
  if (deck) {
    for (const conflict of deck.conflicts ?? []) {
      deckIssues.push(
        `Slot conflict at ${conflict.slot}: ${conflict.candidates.join(', ')}`,
      );
    }
    if (deck.slotsInUse === 0 && deck.totalSlots > 0) {
      deckIssues.push('No labware placed on deck');
    }
  }

  // Tool issues: pipette too coarse, missing mounts
  if (tools) {
    for (const pipette of tools.pipettes ?? []) {
      if (pipette.channels > 1) {
        toolIssues.push(
          `Multi-channel pipette ${pipette.type} may be too coarse for single-well operations`,
        );
      }
    }
  }

  // Reagent issues: unknown kinds, missing concentrations
  if (reagents) {
    for (const reagent of reagents.reagents ?? []) {
      if (reagent.kind === 'unknown') {
        reagentIssues.push(`Unknown reagent kind detected`);
      }
    }
  }

  // Budget issues: missing costs
  if (budget) {
    for (const line of budget.lines ?? []) {
      if (line.estimatedCost === 0 || line.estimatedCost === undefined) {
        budgetIssues.push(`No cost estimate for: ${line.description}`);
      }
    }
  }

  return {
    deckIssues,
    toolIssues,
    reagentIssues,
    budgetIssues,
  };
}

/**
 * Build evidence citations from feedback comment anchors.
 */
function buildEvidenceCitationsFromComment(
  comment: FeedbackComment,
): EvidenceCitation[] {
  const citations: EvidenceCitation[] = [];

  if (comment.sourceAnchor) {
    citations.push({
      sourceRef: comment.sourceAnchor.sourceRef,
      snippet: comment.sourceAnchor.snippet,
      page: comment.sourceAnchor.page,
    });
  }

  return citations;
}

/**
 * Build evidence citations from overlay summary evidence links.
 */
function buildEvidenceCitationsFromDiagnostics(
  diagnostics: CompactDiagnostics,
): EvidenceCitation[] {
  const citations: EvidenceCitation[] = [];

  for (const issue of diagnostics.deckIssues) {
    citations.push({
      sourceRef: 'deck-layout',
      snippet: issue,
    });
  }
  for (const issue of diagnostics.toolIssues) {
    citations.push({
      sourceRef: 'tools-summary',
      snippet: issue,
    });
  }
  for (const issue of diagnostics.reagentIssues) {
    citations.push({
      sourceRef: 'reagents-summary',
      snippet: issue,
    });
  }
  for (const issue of diagnostics.budgetIssues) {
    citations.push({
      sourceRef: 'budget-summary',
      snippet: issue,
    });
  }

  return citations;
}

// ---------------------------------------------------------------------------
// Card generation logic
// ---------------------------------------------------------------------------

/**
 * Generate user-origin issue cards from feedback comments.
 */
function generateUserCards(
  comments: FeedbackComment[],
): IssueCard[] {
  const cards: IssueCard[] = [];

  for (const comment of comments) {
    // Skip empty comments
    if (!comment.body || comment.body.trim().length === 0) {
      continue;
    }

    const snippet = comment.body.slice(0, 80) + (comment.body.length > 80 ? '…' : '');
    const rendered = renderIssueCardTemplate('user-feedback', {
      snippet,
      full_body: comment.body,
    });

    cards.push({
      id: generateIssueCardId(),
      title: rendered.title,
      body: rendered.body,
      origin: 'user',
      evidenceCitations: buildEvidenceCitationsFromComment(comment),
      graphAnchor: comment.graphAnchor
        ? { nodeId: comment.graphAnchor.nodeId, label: comment.graphAnchor.label }
        : undefined,
      suggestedChange: rendered.suggestedChange,
      generatedAt: new Date().toISOString(),
    });
  }

  return cards;
}

/**
 * Generate system-origin issue cards from compact diagnostics.
 */
function generateSystemCards(
  diagnostics: CompactDiagnostics,
): IssueCard[] {
  const cards: IssueCard[] = [];
  const evidenceCitations = buildEvidenceCitationsFromDiagnostics(diagnostics);

  // Deck issues
  for (const issue of diagnostics.deckIssues) {
    const rendered = renderIssueCardTemplate('system-deck', {
      issue_short: issue.slice(0, 80),
      issue_full: issue,
    });

    cards.push({
      id: generateIssueCardId(),
      title: rendered.title,
      body: rendered.body,
      origin: 'system',
      evidenceCitations,
      suggestedChange: rendered.suggestedChange,
      generatedAt: new Date().toISOString(),
    });
  }

  // Tool issues
  for (const issue of diagnostics.toolIssues) {
    const rendered = renderIssueCardTemplate('system-tool', {
      issue_short: issue.slice(0, 80),
      issue_full: issue,
    });

    cards.push({
      id: generateIssueCardId(),
      title: rendered.title,
      body: rendered.body,
      origin: 'system',
      evidenceCitations,
      suggestedChange: rendered.suggestedChange,
      generatedAt: new Date().toISOString(),
    });
  }

  // Reagent issues
  for (const issue of diagnostics.reagentIssues) {
    const rendered = renderIssueCardTemplate('system-reagent', {
      issue_short: issue.slice(0, 80),
      issue_full: issue,
    });

    cards.push({
      id: generateIssueCardId(),
      title: rendered.title,
      body: rendered.body,
      origin: 'system',
      evidenceCitations,
      suggestedChange: rendered.suggestedChange,
      generatedAt: new Date().toISOString(),
    });
  }

  // Budget issues
  for (const issue of diagnostics.budgetIssues) {
    const rendered = renderIssueCardTemplate('system-budget', {
      issue_short: issue.slice(0, 80),
      issue_full: issue,
    });

    cards.push({
      id: generateIssueCardId(),
      title: rendered.title,
      body: rendered.body,
      origin: 'system',
      evidenceCitations,
      suggestedChange: rendered.suggestedChange,
      generatedAt: new Date().toISOString(),
    });
  }

  return cards;
}

/**
 * Generate mixed-origin issue cards from the rolling summary + diagnostics.
 *
 * When both user feedback and system diagnostics exist, we create mixed
 * cards that combine the rolling summary with diagnostic findings.
 */
function generateMixedCards(
  rollingSummary: RollingIssueSummary,
  diagnostics: CompactDiagnostics,
): IssueCard[] {
  const cards: IssueCard[] = [];

  // Only generate mixed cards if there's both a summary and diagnostics
  if (!rollingSummary.summary || rollingSummary.summary.trim().length === 0) {
    return cards;
  }

  const allIssues = [
    ...diagnostics.deckIssues,
    ...diagnostics.toolIssues,
    ...diagnostics.reagentIssues,
    ...diagnostics.budgetIssues,
  ];

  if (allIssues.length === 0) {
    return cards;
  }

  const summaryHead = `Rolling feedback + system diagnostics (${allIssues.length} issue(s))`;
  const summaryFull = `Rolling summary (${rollingSummary.commentCount} comment(s)): ${rollingSummary.summary}\n\nSystem diagnostics:\n${allIssues.map((i) => `- ${i}`).join('\n')}`;
  const evidenceCitations = buildEvidenceCitationsFromDiagnostics(diagnostics);

  const rendered = renderIssueCardTemplate('mixed-rolling-summary', {
    summary_head: summaryHead,
    summary_full: summaryFull,
  });

  cards.push({
    id: generateIssueCardId(),
    title: rendered.title,
    body: rendered.body,
    origin: 'mixed',
    evidenceCitations,
    suggestedChange: rendered.suggestedChange,
    generatedAt: new Date().toISOString(),
  });

  return cards;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProtocolIdeIssueCardService {
  constructor(private store: RecordStore) {}

  /**
   * Generate issue cards from the latest session state.
   *
   * This method:
   * 1. Reads feedback comments, rolling summary, and overlay summaries
   * 2. Derives compact diagnostics from the overlay summaries
   * 3. Generates user, system, and mixed-origin cards
   * 4. Replaces the current card set on the session (no accumulation)
   *
   * @param sessionId — the Protocol IDE session ID
   * @returns the generated issue cards
   */
  async generateIssueCards(
    sessionId: string,
  ): Promise<GenerateIssueCardsResponse> {
    // Fetch the current session
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    // Extract session state
    const comments = extractCommentsFromEnvelope(envelope);
    const rollingSummary = extractRollingSummaryFromEnvelope(envelope);
    const { deck, tools, reagents, budget } =
      extractOverlaySummariesFromEnvelope(envelope);

    // Derive compact diagnostics from overlay summaries
    const diagnostics = deriveCompactDiagnostics(deck, tools, reagents, budget);

    // Generate cards from each source
    const userCards = generateUserCards(comments);
    const systemCards = generateSystemCards(diagnostics);
    const mixedCards = generateMixedCards(
      rollingSummary ?? { summary: '', updatedAt: '', commentCount: 0 },
      diagnostics,
    );

    // Combine all cards — latest-state oriented (no historical accumulation)
    const allCards = [...userCards, ...systemCards, ...mixedCards];

    // Replace the current card set on the session
    const updatedPayload = {
      ...envelope.payload,
      issueCards: allCards,
    };

    const updatedEnvelope: RecordEnvelope = {
      ...envelope,
      payload: updatedPayload,
    };

    const result = await this.store.update({
      envelope: updatedEnvelope,
      message: `Generate ${allCards.length} issue card(s) for session ${sessionId}`,
      skipLint: true,
    });

    if (!result.success) {
      throw new Error(
        `Failed to persist issue cards for session ${sessionId}: ${result.error ?? 'unknown error'}`,
      );
    }

    return {
      success: true,
      cards: allCards,
      cardCount: allCards.length,
    };
  }

  /**
   * Retrieve the current issue-card set for a session.
   *
   * @param sessionId — the Protocol IDE session ID
   * @returns the current issue cards
   */
  async getIssueCards(
    sessionId: string,
  ): Promise<GetIssueCardsResponse> {
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    const payload = envelope.payload as Record<string, unknown>;
    const raw = payload.issueCards;
    const cards = Array.isArray(raw)
      ? (raw as IssueCard[])
      : [];

    return {
      success: true,
      cards,
      cardCount: cards.length,
    };
  }

  /**
   * Replace the current issue-card set for a session.
   *
   * This is used internally by generateIssueCards, but is also exposed
   * for direct replacement (e.g., from a UI action).
   *
   * @param sessionId — the Protocol IDE session ID
   * @param cards — the new set of issue cards (replaces all existing)
   * @returns the replaced card set
   */
  async replaceIssueCards(
    sessionId: string,
    cards: IssueCard[],
  ): Promise<ReplaceIssueCardsResponse> {
    const envelope = await this.store.get(sessionId);
    if (!envelope) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    const updatedPayload = {
      ...envelope.payload,
      issueCards: cards,
    };

    const updatedEnvelope: RecordEnvelope = {
      ...envelope,
      payload: updatedPayload,
    };

    const result = await this.store.update({
      envelope: updatedEnvelope,
      message: `Replace issue cards for session ${sessionId} (${cards.length} card(s))`,
      skipLint: true,
    });

    if (!result.success) {
      throw new Error(
        `Failed to replace issue cards for session ${sessionId}: ${result.error ?? 'unknown error'}`,
      );
    }

    return {
      success: true,
      cards,
      cardCount: cards.length,
    };
  }
}
