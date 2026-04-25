/**
 * PatternExpanders - Registry for stamp-pattern expanders.
 *
 * This module defines the contract for pattern expanders that lower
 * named stamp pattern invocations (from ai_precompile.patternEvents)
 * into primitive PlateEventPrimitive events.
 *
 * Actual expanders for specific patterns are registered in specs 026-027.
 */

import type { PatternEvent } from '../pipeline/passes/ChatbotCompilePasses.js';
import type { StampPatternSpec } from '../../registry/StampPatternRegistry.js';
import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { LabStateSnapshot } from '../state/LabState.js';

/**
 * Context passed to a pattern expander.
 */
export interface PatternExpanderContext {
  labState: LabStateSnapshot;
}

/**
 * A pattern expander lowers a named stamp pattern invocation into
 * primitive plate events.
 */
export interface PatternExpander {
  expand(
    event: PatternEvent,
    spec: StampPatternSpec,
    ctx: PatternExpanderContext,
  ): PlateEventPrimitive[];
}

const expanders = new Map<string, PatternExpander>();

/**
 * Register a pattern expander for a given pattern id.
 */
export function registerPatternExpander(
  patternId: string,
  expander: PatternExpander,
): void {
  expanders.set(patternId, expander);
}

/**
 * Get a registered pattern expander by id.
 */
export function getPatternExpander(
  patternId: string,
): PatternExpander | undefined {
  return expanders.get(patternId);
}

/**
 * Clear all registered pattern expanders. Test helper only.
 */
export function clearPatternExpanders(): void {
  expanders.clear();
}
