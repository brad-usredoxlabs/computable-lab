/**
 * Natural-language → GraphQuery planner (spec §16, §30 #11).
 *
 * The AI/LLM (when configured) is a *query planner*, not the graph executor:
 * it proposes a canonical GraphQuery and the deterministic GraphValidation
 * repairs/rejects it. This module also ships an offline deterministic
 * clause-mapper so the spike runs without an AI endpoint configured — it maps
 * the common Find phrasings ("wells treated with X", "measurements on
 * channel FITC", "runs performed by Alice last month") to structured queries.
 *
 * The offline path returns the SAME canonical GraphQuery the LLM path would, so
 * the engine and validation behave identically either way.
 */

import type { FindQuery } from './types.js';

export interface PlanResult {
  query: FindQuery;
  /** Human-readable interpretation (§18). */
  explain: string;
  /** true when produced by the offline deterministic mapper (no LLM). */
  deterministic: boolean;
}

export interface PlanDeps {
  /** Optional LLM planner. When absent, the deterministic mapper is used. */
  llmPlan?: (text: string) => Promise<{ query: FindQuery; explain: string }>;
}

const WELL_TREAT_RE = /(?:wells|well|samples|sample)?\s*(?:treated|incubated|treated)?\s*with\s+([a-z0-9 ._-]+)/i;
const FIND_OBJECT_RE = /\b(wells?|measurements?|samples?|runs?|materials?|instruments?|results?)\b/i;
const CHANNEL_RE = /\b(channel|readout)?\s*(FITC|CY5|GFP|ROS|OD\d{3}|abs\d{3}|mmp|fluorescence|absorbance|luminescence)\b/i;
const MATERIAL_RE = /(?:with|of|contains?|for)\s+([a-z][a-z0-9 ._-]{1,40})/i;

function stripPunctuation(text: string): string {
  return text.replace(/[?!.,;:]+$/g, '').trim();
}

export class NLPlanner {
  constructor(private readonly deps: PlanDeps = {}) {}

  /** Plan a natural-language Find request. */
  async plan(text: string): Promise<PlanResult> {
    const trimmed = stripPunctuation(text);
    const lower = trimmed.toLowerCase();
    if (this.deps.llmPlan) {
      try {
        const llm = await this.deps.llmPlan(trimmed);
        return { ...llm, deterministic: false };
      } catch {
        // fall through to the deterministic mapper
      }
    }
    return { ...this.deterministic(trimmed, lower), deterministic: true };
  }

  /** Offline clause-mapper — deterministic, testable, works without an LLM. */
  deterministic(text: string, lower: string): { query: FindQuery; explain: string } {
    // 1. "measurements on FITC" / "FITC measurements" → measurement channel.
    const channel = CHANNEL_RE.exec(text);
    if (lower.includes('measurement') || (channel && /measurement|read|channel|readout/.test(lower))) {
      const c = channel?.[2]?.toUpperCase();
      const query: FindQuery = {
        op: 'find',
        type: 'measurement',
        ...(c ? { where: [{ field: 'channel', operator: '=', value: c }] } : {}),
      };
      return {
        query,
        explain: channel
          ? `Find measurement objects with channel ${channel[2]}.`
          : 'Find measurement objects. ',
      };
    }

    // 2. "wells treated with X" → wells whose treatment name contains X.
    const treat = WELL_TREAT_RE.exec(text);
    if (treat) {
      const material = treat[1]!.trim();
      return {
        query: {
          op: 'find',
          type: 'well',
          where: [{ field: 'treatment.name', operator: 'contains', value: material }],
        },
        explain: `Find well objects treated with "${material}".`,
      };
    }

    // 3. "runs performed by X" / "runs by X last month" → run records.
    if (lower.includes('run')) {
      const person = /(?:by|performed by)\s+([a-z][a-z ]{1,30})/i.exec(text)?.[1];
      return {
        query: { op: 'find', type: 'run', ...(person ? { where: [{ field: 'name', operator: 'contains', value: person.trim() }] } : {}) },
        explain: person ? `Find run records associated with "${person.trim()}".` : 'Find run records. ',
      };
    }

    // 4. Generic typed find from a leading object noun.
    const obj = FIND_OBJECT_RE.exec(lower);
    if (obj) {
      const singular = obj[1]!.replace(/s$/, '');
      const type = singular === 'measurement' ? 'measurement' : singular === 'run' ? 'run' : singular;
      const material = MATERIAL_RE.exec(text)?.[1];
      return {
        query: {
          op: 'find',
          type,
          ...(material ? { where: [{ field: 'name', operator: 'contains', value: material.trim() }] } : {}),
        },
        explain: material
          ? `Find ${type} objects related to "${material.trim()}".`
          : `Find ${type} objects. `,
      };
    }

    // 5. Fallback: treat the whole text as a free-text find over wells.
    return {
      query: {
        op: 'find',
        type: 'well',
        where: [{ field: 'treatment.name', operator: 'contains', value: lower }],
      },
      explain: `Find well objects matching "${lower}".`,
    };
  }
}