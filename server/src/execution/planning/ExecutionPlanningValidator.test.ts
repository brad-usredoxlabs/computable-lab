import { describe, expect, it } from 'vitest';
import { ExecutionPlanningValidator } from './ExecutionPlanningValidator.js';

function baseFixture() {
  return {
    eventGraph: {
      labwares: [{ labwareId: 'PLATE_SRC' }, { labwareId: 'PLATE_DST' }],
      events: [
        {
          eventId: 'EV-1',
          details: {
            volume_uL: 50,
            channels: 8,
          },
        },
      ],
    },
    executionEnvironment: {
      deck: {
        slots: [
          { slot_id: '1', slot_type: 'standard', compatible_footprints: ['sbs_plate'] },
          { slot_id: '2', slot_type: 'standard', compatible_footprints: ['sbs_plate'] },
          { slot_id: '3', slot_type: 'standard', compatible_footprints: ['tiprack_300'] },
          { slot_id: '12', slot_type: 'trash', compatible_footprints: ['trash'] },
        ],
      },
      tools: [
        {
          tool_id: 'p300_multi',
          channels: 8,
          mount: 'left',
          volume_min_ul: 20,
          volume_max_ul: 300,
          tip_types: ['opentrons_300'],
        },
      ],
      labware_registry: {
        definitions: [
          { labware_id: 'nest_96_wellplate_200ul_flat', footprint: 'sbs_plate' },
          { labware_id: 'opentrons_96_tiprack_300ul', footprint: 'tiprack_300' },
        ],
      },
      constraints: {
        max_labware_items: 4,
        max_tipracks: 2,
        requires_trash_slot: true,
        forbidden_slot_ids: ['11'],
      },
    },
    executionPlan: {
      placements: {
        labware: [
          { labware_ref: 'PLATE_SRC', labware_id: 'nest_96_wellplate_200ul_flat', slot_id: '1' },
          { labware_ref: 'PLATE_DST', labware_id: 'nest_96_wellplate_200ul_flat', slot_id: '2' },
        ],
        tipracks: [{ tiprack_id: 'TIP_1', slot_id: '3', tip_type: 'opentrons_300' }],
        waste: { slot_id: '12', labware_id: 'trash' },
      },
      tool_bindings: {
        primary_liquid_handler: {
          tool_id: 'p300_multi',
          mount: 'left',
          default_tip_type: 'opentrons_300',
        },
      },
      strategy: {
        tip_policy: 'new_tip_each_source',
        channelization: 'multi_channel_prefer',
        batching: 'group_by_source',
      },
    },
  };
}

describe('ExecutionPlanningValidator', () => {
  it('returns valid for a compatible plan/environment pair', () => {
    const validator = new ExecutionPlanningValidator();
    const result = validator.validate(baseFixture());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('detects unknown and forbidden slots plus footprint incompatibility', () => {
    const fixture = baseFixture();
    fixture.executionPlan.placements.labware[0]!.slot_id = '99';
    fixture.executionPlan.placements.labware[1]!.slot_id = '2';
    fixture.executionPlan.placements.labware[1]!.labware_id = 'opentrons_96_tiprack_300ul';
    fixture.executionEnvironment.constraints.forbidden_slot_ids = ['2'];

    const validator = new ExecutionPlanningValidator();
    const result = validator.validate(fixture);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'UNKNOWN_SLOT')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'FORBIDDEN_SLOT')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'INCOMPATIBLE_FOOTPRINT')).toBe(true);
  });

  it('detects unknown labware references and missing placements', () => {
    const fixture = baseFixture();
    fixture.executionPlan.placements.labware = [
      { labware_ref: 'PLATE_NOT_IN_EVG', labware_id: 'missing_labware_id', slot_id: '1' },
    ];

    const validator = new ExecutionPlanningValidator();
    const result = validator.validate(fixture);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'UNKNOWN_EVENT_GRAPH_LABWARE_REF')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'UNKNOWN_LABWARE_ID')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'MISSING_LABWARE_PLACEMENT')).toBe(true);
  });

  it('detects tool, channel, and volume capability mismatches', () => {
    const fixture = baseFixture();
    fixture.executionPlan.tool_bindings.primary_liquid_handler.tool_id = 'missing_tool';
    fixture.executionPlan.strategy.channelization = 'multi_channel_force';
    fixture.eventGraph.events[0]!.details = {
      volume_uL: 999,
      channels: 16,
    };
    fixture.executionEnvironment.tools[0]!.channels = 1;

    const validator = new ExecutionPlanningValidator();
    const result = validator.validate(fixture);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'UNKNOWN_PRIMARY_TOOL')).toBe(true);

    fixture.executionPlan.tool_bindings.primary_liquid_handler.tool_id = 'p300_multi';
    const result2 = validator.validate(fixture);
    expect(result2.issues.some((issue) => issue.code === 'CHANNELIZATION_UNSATISFIED')).toBe(true);
    expect(result2.issues.some((issue) => issue.code === 'CHANNEL_REQUIREMENT_UNSATISFIED')).toBe(true);
    expect(result2.issues.some((issue) => issue.code === 'VOLUME_ABOVE_MAX')).toBe(true);
  });

  it('enforces tiprack and trash constraints', () => {
    const fixture = baseFixture();
    fixture.executionEnvironment.constraints.max_tipracks = 0;
    fixture.executionPlan.placements.waste = undefined;
    fixture.executionPlan.placements.tipracks = [
      { tiprack_id: 'TIP_1', slot_id: '3', tip_type: 'unsupported_tip' },
    ];

    const validator = new ExecutionPlanningValidator();
    const result = validator.validate(fixture);

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'MAX_TIPRACKS_EXCEEDED')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'MISSING_TRASH_SLOT')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'TIP_TYPE_UNSUPPORTED')).toBe(true);
  });

  it('validates tip management rack references and pause actions', () => {
    const fixture = baseFixture();
    fixture.executionPlan.tip_management = {
      mode: 'robot',
      pause_on_depletion: true,
      replacement_policy: 'full_rack_default',
      racks: [
        { tiprack_id: 'TIP_UNKNOWN', next_tip_well: 'A1', consumed_count: 4, depleted: false },
      ],
      runtime_actions: [],
    };

    const validator = new ExecutionPlanningValidator();
    const result = validator.validate(fixture);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'TIP_MANAGEMENT_UNKNOWN_RACK')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'TIP_RELOAD_ACTION_MISSING')).toBe(true);
  });

  it('allows manual tip mode with no tipracks', () => {
    const fixture = baseFixture();
    fixture.executionPlan.placements.tipracks = [];
    fixture.executionPlan.tip_management = {
      mode: 'manual',
      pause_on_depletion: false,
      replacement_policy: 'full_rack_default',
    };

    const validator = new ExecutionPlanningValidator();
    const result = validator.validate(fixture);
    expect(result.issues.some((issue) => issue.code === 'MISSING_TIPRACKS')).toBe(false);
  });

  it('requires tipracks in robot mode when handling liquid events', () => {
    const fixture = baseFixture();
    fixture.executionPlan.placements.tipracks = [];
    fixture.executionPlan.tip_management = {
      mode: 'robot',
      pause_on_depletion: false,
      replacement_policy: 'full_rack_default',
    };

    const validator = new ExecutionPlanningValidator();
    const result = validator.validate(fixture);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'MISSING_TIPRACKS')).toBe(true);
  });
});
