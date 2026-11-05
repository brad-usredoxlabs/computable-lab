import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseSubmitSuggestionArgs,
  SUBMIT_SUGGESTION_TOOL_DEF,
  SUBMIT_SUGGESTION_TOOL_NAME,
} from './submitSuggestionTool.js';

/**
 * Anti-drift guard: place_tube details must follow the event contract
 * (schema/workflow/events/plate-event.place-tube.schema.yaml):
 * details.tube = { sizeLabel, maxVolume_uL, wellShape? } — NEVER the
 * labware-requirement vocabulary (tubeVolumeClass) leaking into event details.
 */

type Json = Record<string, unknown>;

function asJson(value: unknown): Json {
  expect(value).toBeTypeOf('object');
  return value as Json;
}

function eventItemProps(): Json {
  const params = asJson(SUBMIT_SUGGESTION_TOOL_DEF.function.parameters);
  const events = asJson(asJson(params.properties).events);
  const items = asJson(events.items);
  return asJson(items.properties);
}

const USAGE = { promptTokens: 0, completionTokens: 0 };

describe('submit_suggestion place_tube schema (event-contract shape)', () => {
  it('tool name is submit_suggestion', () => {
    expect(SUBMIT_SUGGESTION_TOOL_NAME).toBe('submit_suggestion');
  });

  it('details.properties.tube declares the event-contract tube descriptor', () => {
    const details = asJson(asJson(eventItemProps()).details);
    const tube = asJson(asJson(details.properties).tube);
    expect(tube.type).toBe('object');
    expect(tube.required).toEqual(['sizeLabel', 'maxVolume_uL']);
    const wellShape = asJson(asJson(tube.properties).wellShape);
    expect(wellShape.enum).toEqual(['round', 'square', 'v-bottom', 'conical']);
  });

  it('details.description explicitly forbids tubeVolumeClass drift', () => {
    const details = asJson(asJson(eventItemProps()).details);
    expect(typeof details.description).toBe('string');
    expect(details.description as string).toContain('tubeVolumeClass');
  });

  it('labwareRequirements.tubeVolumeClass remains (labware selection is untouched)', () => {
    const params = asJson(SUBMIT_SUGGESTION_TOOL_DEF.function.parameters);
    const reqs = asJson(asJson(params.properties).labwareRequirements);
    const props = asJson(asJson(reqs.items).properties);
    expect(props.tubeVolumeClass).toBeDefined();
  });

  it('parseSubmitSuggestionArgs passes the contract-shape tube through verbatim', () => {
    const r = parseSubmitSuggestionArgs(
      {
        events: [
          {
            verb: 'place_tube',
            event_type: 'place_tube',
            details: {
              labwareId: 'rack-1',
              wells: ['A1'],
              tube: { sizeLabel: '1.5 mL', maxVolume_uL: 1500 },
            },
          },
        ],
      },
      USAGE,
      1,
      1,
    );
    expect(r.events).toHaveLength(1);
    const details = asJson(r.events[0].details);
    const tube = asJson(details.tube);
    expect(tube.maxVolume_uL).toBe(1500);
  });

  it('the event-graph-agent prompt names details.tube and the forbidden tubeVolumeClass', () => {
    const promptPath = fileURLToPath(new URL('../../prompts/event-graph-agent.md', import.meta.url));
    const prompt = readFileSync(promptPath, 'utf8');
    const section = prompt.slice(prompt.indexOf('### place_tube'));
    const bounded = section.includes('### remove_tube') ? section.slice(0, section.indexOf('### remove_tube')) : section;
    expect(bounded).toContain('details.tube');
    expect(bounded).toContain('tubeVolumeClass');
  });
});
