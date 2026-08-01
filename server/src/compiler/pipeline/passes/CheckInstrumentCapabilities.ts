/**
 * check_instrument_capabilities pass
 *
 * After events are produced, checks if registered instruments can satisfy
 * the operation requirements (e.g. orbital shaking at a given RPM, reading
 * at a specific wavelength). Emits warnings when no instrument supports
 * the operation's constraints.
 */

import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';

interface OperationRequirement {
  operation: string;
  constraints?: Record<string, unknown>;
}

function inferOperationRequirements(event: PlateEventPrimitive): OperationRequirement | null {
  const details = event.details as Record<string, unknown>;
  switch (event.event_type) {
    case 'mix':
      if (details.mode === 'orbital_shaking' || details.rpm !== undefined) {
        return {
          operation: 'orbital_shaking',
          constraints: {
            ...(typeof details.rpm === 'number' ? { rpm: details.rpm } : {}),
            ...(typeof details.duration === 'string' ? { duration: details.duration } : {}),
          },
        };
      }
      return { operation: 'mix' };

    case 'centrifuge':
      return {
        operation: 'centrifuge',
        constraints: {
          ...(typeof details.rpm === 'number' ? { rpm: details.rpm } : {}),
        },
      };

    case 'read':
      return {
        operation: 'read',
        constraints: {
          ...(typeof details.instrument === 'string' ? { instrument: details.instrument } : {}),
        },
      };

    case 'incubate':
      return {
        operation: 'incubate',
        constraints: {
          ...(typeof details.temperature === 'number' ? { temperature: details.temperature } : {}),
        },
      };

    default:
      return null;
  }
}

// Simple capability thresholds — will be replaced by real instrument registry data
const CAPABILITY_LIMITS: Record<string, { maxRpm?: number }> = {
  orbital_shaking: { maxRpm: 3000 },
  centrifuge: { maxRpm: 15000 },
};

function checkCapability(req: OperationRequirement): boolean {
  const limits = CAPABILITY_LIMITS[req.operation];
  if (!limits) return true; // No known limits → assume capable
  if (limits.maxRpm && req.constraints?.rpm) {
    return (req.constraints.rpm as number) <= limits.maxRpm;
  }
  return true;
}

export function createCheckInstrumentCapabilitiesPass(): Pass {
  return {
    id: 'check_instrument_capabilities',
    family: 'validate' as const,
    run({ state }: PassRunArgs): PassResult {
      // Collect events from all expansion passes
      const allEvents: PlateEventPrimitive[] = [];
      const passIds = ['mint_materials', 'expand_biology_verbs', 'expand_patterns', 'expand_protocol', 'lower_protocol_intent'];
      for (const passId of passIds) {
        const output = state.outputs.get(passId) as { events?: PlateEventPrimitive[] } | undefined;
        if (output?.events) {
          allEvents.push(...output.events);
        }
      }

      const diagnostics: PassDiagnostic[] = [];

      for (const event of allEvents) {
        const req = inferOperationRequirements(event);
        if (!req) continue;

        if (!checkCapability(req)) {
          const constraintsStr = req.constraints
            ? ` with constraints: ${JSON.stringify(req.constraints)}`
            : '';
          diagnostics.push({
            pass_id: 'check_instrument_capabilities',
            severity: 'warning' as const,
            code: 'no_instrument_capability',
            message: `No registered instrument can perform ${req.operation}${constraintsStr}`,
          });
        }
      }

      return {
        ok: true,
        output: {},
        ...(diagnostics.length > 0 ? { diagnostics } : {}),
      };
    },
  };
}
