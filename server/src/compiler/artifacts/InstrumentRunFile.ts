/**
 * InstrumentRunFile - Generic instrument run-file artifact types and emitter registry.
 *
 * This module defines the canonical shape for instrument run-file artifacts
 * and provides a registry for instrument-specific emitters.
 */

import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { ResolvedReference } from '../pipeline/CompileContracts.js';

// ---------------------------------------------------------------------------
// InstrumentRunFileWell — a single well entry in a run file
// ---------------------------------------------------------------------------

export interface InstrumentRunFileWell {
  well: string;
  channelMap?: Record<string, string>;
  sample?: string;
  target?: string;
}

// ---------------------------------------------------------------------------
// InstrumentRunFile — the complete run-file artifact for one instrument
// ---------------------------------------------------------------------------

export interface InstrumentRunFile {
  instrument: string;
  wells: InstrumentRunFileWell[];
  analysisRules?: unknown[];
}

// ---------------------------------------------------------------------------
// InstrumentEmitter — the function signature for instrument-specific emitters
// ---------------------------------------------------------------------------

export type InstrumentEmitter = (
  events: PlateEventPrimitive[],
  resolvedRefs: ResolvedReference[],
) => InstrumentRunFile;

// ---------------------------------------------------------------------------
// Emitter registry — side-effect registration for instrument emitters
// ---------------------------------------------------------------------------

const emitters = new Map<string, InstrumentEmitter>();

export function registerInstrumentEmitter(
  instrument: string,
  emitter: InstrumentEmitter,
): void {
  emitters.set(instrument, emitter);
  // Register aliases by lowercase and without punctuation
  emitters.set(instrument.toLowerCase(), emitter);
}

export function getInstrumentEmitter(
  instrument: string,
): InstrumentEmitter | undefined {
  return emitters.get(instrument) ?? emitters.get(instrument.toLowerCase());
}

/**
 * Test helper only — do NOT call from production.
 */
export function clearInstrumentEmitters(): void {
  emitters.clear();
}
