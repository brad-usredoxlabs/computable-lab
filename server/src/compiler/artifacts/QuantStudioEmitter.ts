/**
 * QuantStudioEmitter — registers an instrument emitter for QuantStudio-5.
 *
 * This side-effect module registers an emitter that produces a well-by-well
 * run plan from read events targeting a QuantStudio instrument.
 */

import { registerInstrumentEmitter, type InstrumentEmitter } from './InstrumentRunFile.js';

const quantStudioEmitter: InstrumentEmitter = (events, resolvedRefs) => {
  const wells = events
    .filter(
      e =>
        e.event_type === 'read' &&
        /QuantStudio|QS5/i.test(
          String((e.details as { instrument?: string }).instrument ?? ''),
        ),
    )
    .map(e => {
      const d = e.details as {
        well?: string;
        channelMap?: Record<string, string>;
        target?: string;
      };
      return {
        well: d.well ?? '?',
        channelMap: d.channelMap,
        target: d.target,
      };
    });

  const assayRef = resolvedRefs.find(r => r.kind === 'assay');
  return {
    instrument: 'QuantStudio-5',
    wells,
    analysisRules: assayRef ? [] : undefined,
  };
};

registerInstrumentEmitter('QuantStudio-5', quantStudioEmitter);
registerInstrumentEmitter('QuantStudio', quantStudioEmitter);
registerInstrumentEmitter('QS5', quantStudioEmitter);
