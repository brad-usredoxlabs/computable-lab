/**
 * GeminiEmEmitter — registers a conservative run-file emitter for Gemini EM.
 *
 * The Gemini EM plate reader typically reads a plate-level region. When the
 * read event does not name explicit wells, this emitter emits a full 96-well
 * plate run plan so the appliance has an explicit well list to execute/review.
 */

import { registerInstrumentEmitter, type InstrumentEmitter } from './InstrumentRunFile.js';

const DEFAULT_96_WELL_PLATE = expand96WellPlate();

const geminiEmEmitter: InstrumentEmitter = (events) => {
  const runParameters = collectGeminiReadParameters(events);
  const wells = events
    .filter((event) => event.event_type === 'read')
    .flatMap((event) => {
      const details = event.details as {
        well?: string;
        wells?: string[];
        sample?: string;
        target?: string;
      };
      const wellIds = details.wells && details.wells.length > 0
        ? details.wells
        : details.well
          ? [details.well]
          : DEFAULT_96_WELL_PLATE;

      return wellIds.map((well) => ({
        well,
        ...(details.sample ? { sample: details.sample } : {}),
        ...(details.target ? { target: details.target } : {}),
      }));
    });

  return {
    instrument: 'Gemini EM plate reader',
    wells,
    ...(Object.keys(runParameters).length > 0 ? { runParameters } : {}),
  };
};

function collectGeminiReadParameters(events: Parameters<InstrumentEmitter>[0]): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const event of events) {
    if (event.event_type !== 'read') continue;
    const details = event.details as {
      mode?: unknown;
      wavelengthNm?: unknown;
      integrationMs?: unknown;
      simulate?: unknown;
    };
    if (parameters.mode === undefined && isGeminiMode(details.mode)) {
      parameters.mode = details.mode;
    }
    if (parameters.wavelengthNm === undefined && typeof details.wavelengthNm === 'number') {
      parameters.wavelengthNm = details.wavelengthNm;
    }
    if (parameters.integrationMs === undefined && typeof details.integrationMs === 'number') {
      parameters.integrationMs = details.integrationMs;
    }
    if (parameters.simulate === undefined && typeof details.simulate === 'boolean') {
      parameters.simulate = details.simulate;
    }
  }
  return parameters;
}

function isGeminiMode(value: unknown): value is 'fluorescence' | 'absorbance' | 'luminescence' {
  return value === 'fluorescence' || value === 'absorbance' || value === 'luminescence';
}

function expand96WellPlate(): string[] {
  const wells: string[] = [];
  for (const row of 'ABCDEFGH') {
    for (let column = 1; column <= 12; column++) {
      wells.push(`${row}${column}`);
    }
  }
  return wells;
}

registerInstrumentEmitter('Gemini EM plate reader', geminiEmEmitter);
registerInstrumentEmitter('Gemini EM', geminiEmEmitter);
registerInstrumentEmitter('Molecular Devices Gemini EM', geminiEmEmitter);
