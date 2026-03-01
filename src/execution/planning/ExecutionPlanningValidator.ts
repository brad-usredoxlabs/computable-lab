export type PlanningIssueSeverity = 'error' | 'warning';

export interface PlanningIssue {
  severity: PlanningIssueSeverity;
  code: string;
  path: string;
  message: string;
}

export interface PlanningValidationResult {
  valid: boolean;
  issues: PlanningIssue[];
}

type EventGraphLike = {
  labwares?: Array<{ labwareId?: string }>;
  events?: Array<{ eventId?: string; details?: unknown }>;
};

type ExecutionEnvironmentLike = {
  deck?: {
    slots?: Array<{
      slot_id?: string;
      slot_type?: string;
      compatible_footprints?: string[];
    }>;
  };
  tools?: Array<{
    tool_id?: string;
    channels?: number;
    mount?: string;
    volume_min_ul?: number;
    volume_max_ul?: number;
    tip_types?: string[];
  }>;
  labware_registry?: {
    definitions?: Array<{
      labware_id?: string;
      footprint?: string;
    }>;
  };
  constraints?: {
    max_labware_items?: number;
    max_tipracks?: number;
    requires_trash_slot?: boolean;
    forbidden_slot_ids?: string[];
  };
};

type ExecutionPlanLike = {
  placements?: {
    labware?: Array<{
      labware_ref?: string;
      labware_id?: string;
      slot_id?: string;
    }>;
    tipracks?: Array<{
      tiprack_id?: string;
      slot_id?: string;
      tip_type?: string;
      starting_tip?: string;
      next_tip_well?: string;
      consumed_count?: number;
      depleted?: boolean;
    }>;
    waste?: {
      slot_id?: string;
      labware_id?: string;
    };
  };
  tool_bindings?: {
    primary_liquid_handler?: {
      tool_id?: string;
      mount?: string;
      default_tip_type?: string;
    };
  };
  strategy?: {
    channelization?: string;
  };
  tip_management?: {
    mode?: 'robot' | 'manual';
    replacement_policy?: 'full_rack_default' | 'partial_override';
    pause_on_depletion?: boolean;
    racks?: Array<{
      tiprack_id?: string;
      next_tip_well?: string;
      consumed_count?: number;
      depleted?: boolean;
    }>;
    runtime_actions?: Array<{
      action_id?: string;
      kind?: 'pause_for_tip_reload' | 'operator_prompt' | 'note';
      message?: string;
      target_tiprack_id?: string;
    }>;
  };
};

function sortIssues(issues: PlanningIssue[]): PlanningIssue[] {
  return [...issues].sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'error' ? -1 : 1;
    }
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.message.localeCompare(b.message);
  });
}

function collectVolumeHints(details: unknown): number[] {
  const values: number[] = [];
  const seen = new Set<unknown>();

  function visit(node: unknown, keyHint?: string): void {
    if (node === null || node === undefined) return;

    if (typeof node === 'number') {
      if (keyHint && keyHint.toLowerCase().includes('volume')) {
        values.push(node);
      }
      return;
    }

    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const entry of node) visit(entry, keyHint);
      return;
    }

    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      visit(value, key);
    }
  }

  visit(details);
  return values.filter((v) => Number.isFinite(v) && v >= 0);
}

function collectChannelHints(details: unknown): number[] {
  if (!details || typeof details !== 'object') return [];
  const obj = details as Record<string, unknown>;
  const hints: number[] = [];

  const numericCandidateKeys = ['channels', 'channel_count', 'channelCount', 'n_channels'];
  for (const key of numericCandidateKeys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      hints.push(Math.floor(value));
    }
  }

  const active = obj['activeChannels'];
  if (Array.isArray(active) && active.length > 0) {
    hints.push(active.length);
  }

  return hints;
}

function isWellAddress(value: string): boolean {
  return /^[A-Z]+[0-9]+$/.test(value);
}

export class ExecutionPlanningValidator {
  validate(input: {
    eventGraph: EventGraphLike;
    executionEnvironment: ExecutionEnvironmentLike;
    executionPlan: ExecutionPlanLike;
  }): PlanningValidationResult {
    const issues: PlanningIssue[] = [];
    const { eventGraph, executionEnvironment, executionPlan } = input;

    const slots = executionEnvironment.deck?.slots ?? [];
    const slotById = new Map(
      slots
        .filter((slot): slot is { slot_id: string; slot_type?: string; compatible_footprints?: string[] } => typeof slot.slot_id === 'string')
        .map((slot) => [slot.slot_id, slot]),
    );

    const tools = executionEnvironment.tools ?? [];
    const toolById = new Map(
      tools
        .filter((tool): tool is { tool_id: string; channels?: number; mount?: string; volume_min_ul?: number; volume_max_ul?: number; tip_types?: string[] } => typeof tool.tool_id === 'string')
        .map((tool) => [tool.tool_id, tool]),
    );

    const definitions = executionEnvironment.labware_registry?.definitions ?? [];
    const definitionById = new Map(
      definitions
        .filter((d): d is { labware_id: string; footprint?: string } => typeof d.labware_id === 'string')
        .map((d) => [d.labware_id, d]),
    );

    const evgLabwareIds = new Set(
      (eventGraph.labwares ?? [])
        .map((lw) => lw.labwareId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );

    const labwarePlacements = executionPlan.placements?.labware ?? [];
    const tipracks = executionPlan.placements?.tipracks ?? [];
    const waste = executionPlan.placements?.waste;
    const forbiddenSlots = new Set(executionEnvironment.constraints?.forbidden_slot_ids ?? []);
    const tipManagementMode = executionPlan.tip_management?.mode ?? 'robot';

    const usedSlots = new Map<string, string>();
    const seenLabwareRefs = new Set<string>();

    for (let i = 0; i < labwarePlacements.length; i += 1) {
      const p = labwarePlacements[i] ?? {};
      const pPath = `placements.labware[${i}]`;

      if (typeof p.labware_ref === 'string') {
        if (seenLabwareRefs.has(p.labware_ref)) {
          issues.push({
            severity: 'error',
            code: 'DUPLICATE_LABWARE_REF',
            path: `${pPath}.labware_ref`,
            message: `Duplicate labware_ref "${p.labware_ref}".`,
          });
        }
        seenLabwareRefs.add(p.labware_ref);

        if (!evgLabwareIds.has(p.labware_ref)) {
          issues.push({
            severity: 'error',
            code: 'UNKNOWN_EVENT_GRAPH_LABWARE_REF',
            path: `${pPath}.labware_ref`,
            message: `labware_ref "${p.labware_ref}" was not found in event_graph.labwares.`,
          });
        }
      }

      if (typeof p.labware_id !== 'string' || !definitionById.has(p.labware_id)) {
        issues.push({
          severity: 'error',
          code: 'UNKNOWN_LABWARE_ID',
          path: `${pPath}.labware_id`,
          message: `labware_id "${String(p.labware_id)}" was not found in execution environment registry.`,
        });
      }

      if (typeof p.slot_id !== 'string' || !slotById.has(p.slot_id)) {
        issues.push({
          severity: 'error',
          code: 'UNKNOWN_SLOT',
          path: `${pPath}.slot_id`,
          message: `slot_id "${String(p.slot_id)}" was not found in execution environment deck.`,
        });
      } else {
        const slot = slotById.get(p.slot_id)!;
        if (forbiddenSlots.has(p.slot_id)) {
          issues.push({
            severity: 'error',
            code: 'FORBIDDEN_SLOT',
            path: `${pPath}.slot_id`,
            message: `slot_id "${p.slot_id}" is forbidden by environment constraints.`,
          });
        }
        if (usedSlots.has(p.slot_id)) {
          issues.push({
            severity: 'error',
            code: 'SLOT_COLLISION',
            path: `${pPath}.slot_id`,
            message: `slot_id "${p.slot_id}" already assigned to ${usedSlots.get(p.slot_id)}.`,
          });
        } else {
          usedSlots.set(p.slot_id, `labware ${p.labware_ref ?? '(unknown)'}`);
        }

        const def = typeof p.labware_id === 'string' ? definitionById.get(p.labware_id) : undefined;
        if (def?.footprint && Array.isArray(slot.compatible_footprints) && slot.compatible_footprints.length > 0) {
          if (!slot.compatible_footprints.includes(def.footprint)) {
            issues.push({
              severity: 'warning',
              code: 'INCOMPATIBLE_FOOTPRINT',
              path: `${pPath}.slot_id`,
              message: `Footprint "${def.footprint}" is not compatible with slot "${p.slot_id}".`,
            });
          }
        }
      }
    }

    for (const labwareId of [...evgLabwareIds].sort()) {
      if (!labwarePlacements.some((p) => p?.labware_ref === labwareId)) {
        issues.push({
          severity: 'error',
          code: 'MISSING_LABWARE_PLACEMENT',
          path: 'placements.labware',
          message: `Missing placement for event graph labware "${labwareId}".`,
        });
      }
    }

    for (let i = 0; i < tipracks.length; i += 1) {
      const t = tipracks[i] ?? {};
      const tPath = `placements.tipracks[${i}]`;
      if (typeof t.slot_id !== 'string' || !slotById.has(t.slot_id)) {
        issues.push({
          severity: 'error',
          code: 'UNKNOWN_SLOT',
          path: `${tPath}.slot_id`,
          message: `slot_id "${String(t.slot_id)}" was not found in execution environment deck.`,
        });
      } else {
        if (forbiddenSlots.has(t.slot_id)) {
          issues.push({
            severity: 'error',
            code: 'FORBIDDEN_SLOT',
            path: `${tPath}.slot_id`,
            message: `slot_id "${t.slot_id}" is forbidden by environment constraints.`,
          });
        }
        if (usedSlots.has(t.slot_id)) {
          issues.push({
            severity: 'error',
            code: 'SLOT_COLLISION',
            path: `${tPath}.slot_id`,
            message: `slot_id "${t.slot_id}" already assigned to ${usedSlots.get(t.slot_id)}.`,
          });
        } else {
          usedSlots.set(t.slot_id, `tiprack ${t.tiprack_id ?? '(unknown)'}`);
        }
      }
      if (typeof t.starting_tip === 'string' && !isWellAddress(t.starting_tip)) {
        issues.push({
          severity: 'warning',
          code: 'TIP_WELL_FORMAT',
          path: `${tPath}.starting_tip`,
          message: `starting_tip "${t.starting_tip}" is not in A1-style format.`,
        });
      }
      if (typeof t.next_tip_well === 'string' && !isWellAddress(t.next_tip_well)) {
        issues.push({
          severity: 'warning',
          code: 'TIP_WELL_FORMAT',
          path: `${tPath}.next_tip_well`,
          message: `next_tip_well "${t.next_tip_well}" is not in A1-style format.`,
        });
      }
      if (typeof t.consumed_count === 'number' && t.consumed_count < 0) {
        issues.push({
          severity: 'error',
          code: 'TIP_CONSUMED_INVALID',
          path: `${tPath}.consumed_count`,
          message: 'consumed_count must be >= 0.',
        });
      }
    }

    const events = eventGraph.events ?? [];
    const hasLiquidSteps = events.some((ev) => {
      const id = (ev.details ?? {}) as Record<string, unknown>;
      return ev.eventId !== undefined && (id['volume_uL'] !== undefined || id['volume_ul'] !== undefined || id['sourceWell'] !== undefined || id['targetWell'] !== undefined);
    });
    if (tipManagementMode === 'robot' && hasLiquidSteps && tipracks.length === 0) {
      issues.push({
        severity: 'error',
        code: 'MISSING_TIPRACKS',
        path: 'placements.tipracks',
        message: 'Robot mode requires at least one tiprack for liquid-handling events.',
      });
    }

    if (waste?.slot_id) {
      if (!slotById.has(waste.slot_id)) {
        issues.push({
          severity: 'error',
          code: 'UNKNOWN_SLOT',
          path: 'placements.waste.slot_id',
          message: `slot_id "${waste.slot_id}" was not found in execution environment deck.`,
        });
      } else {
        const slot = slotById.get(waste.slot_id)!;
        if (forbiddenSlots.has(waste.slot_id)) {
          issues.push({
            severity: 'error',
            code: 'FORBIDDEN_SLOT',
            path: 'placements.waste.slot_id',
            message: `slot_id "${waste.slot_id}" is forbidden by environment constraints.`,
          });
        }
        if (usedSlots.has(waste.slot_id)) {
          issues.push({
            severity: 'error',
            code: 'SLOT_COLLISION',
            path: 'placements.waste.slot_id',
            message: `slot_id "${waste.slot_id}" already assigned to ${usedSlots.get(waste.slot_id)}.`,
          });
        }
        if (slot.slot_type !== 'trash') {
          issues.push({
            severity: 'warning',
            code: 'WASTE_SLOT_NOT_TRASH',
            path: 'placements.waste.slot_id',
            message: `Waste slot "${waste.slot_id}" is not typed as trash.`,
          });
        }
      }
    } else if (executionEnvironment.constraints?.requires_trash_slot) {
      issues.push({
        severity: 'error',
        code: 'MISSING_TRASH_SLOT',
        path: 'placements.waste',
        message: 'Environment requires a waste/trash slot but execution plan did not provide one.',
      });
    }

    const primaryToolBinding = executionPlan.tool_bindings?.primary_liquid_handler;
    const primaryToolId = primaryToolBinding?.tool_id;
    const primaryTool = typeof primaryToolId === 'string' ? toolById.get(primaryToolId) : undefined;
    if (!primaryTool) {
      issues.push({
        severity: 'error',
        code: 'UNKNOWN_PRIMARY_TOOL',
        path: 'tool_bindings.primary_liquid_handler.tool_id',
        message: `Primary tool "${String(primaryToolId)}" was not found in execution environment.`,
      });
    } else {
      if (primaryToolBinding?.mount && primaryTool.mount && primaryTool.mount !== 'na' && primaryToolBinding.mount !== primaryTool.mount) {
        issues.push({
          severity: 'warning',
          code: 'TOOL_MOUNT_MISMATCH',
          path: 'tool_bindings.primary_liquid_handler.mount',
          message: `Primary tool mount "${primaryToolBinding.mount}" does not match environment tool mount "${primaryTool.mount}".`,
        });
      }

      if (executionPlan.strategy?.channelization === 'multi_channel_force' && (primaryTool.channels ?? 1) <= 1) {
        issues.push({
          severity: 'error',
          code: 'CHANNELIZATION_UNSATISFIED',
          path: 'strategy.channelization',
          message: 'multi_channel_force requires a primary tool with channels > 1.',
        });
      }

      if (primaryToolBinding?.default_tip_type && !(primaryTool.tip_types ?? []).includes(primaryToolBinding.default_tip_type)) {
        issues.push({
          severity: 'warning',
          code: 'TIP_TYPE_UNSUPPORTED',
          path: 'tool_bindings.primary_liquid_handler.default_tip_type',
          message: `Tool "${primaryToolId}" does not support tip type "${primaryToolBinding.default_tip_type}".`,
        });
      }

      for (let i = 0; i < tipracks.length; i += 1) {
        const tipType = tipracks[i]?.tip_type;
        if (typeof tipType === 'string' && !(primaryTool.tip_types ?? []).includes(tipType)) {
          issues.push({
            severity: 'warning',
            code: 'TIP_TYPE_UNSUPPORTED',
            path: `placements.tipracks[${i}].tip_type`,
            message: `Tool "${primaryToolId}" does not support tip type "${tipType}".`,
          });
        }
      }

      const minVol = primaryTool.volume_min_ul;
      const maxVol = primaryTool.volume_max_ul;
      const maxChannels = primaryTool.channels ?? 1;
      for (let i = 0; i < events.length; i += 1) {
        const ev = events[i] ?? {};
        const eventPath = `eventGraph.events[${i}]`;
        const eventId = ev.eventId ? ` (${ev.eventId})` : '';
        const volumes = collectVolumeHints(ev.details);
        for (const vol of volumes) {
          if (typeof minVol === 'number' && vol < minVol) {
            issues.push({
              severity: 'warning',
              code: 'VOLUME_BELOW_MIN',
              path: eventPath,
              message: `Event${eventId} requires ${vol} uL, below primary tool minimum ${minVol} uL.`,
            });
          }
          if (typeof maxVol === 'number' && vol > maxVol) {
            issues.push({
              severity: 'warning',
              code: 'VOLUME_ABOVE_MAX',
              path: eventPath,
              message: `Event${eventId} requires ${vol} uL, above primary tool maximum ${maxVol} uL.`,
            });
          }
        }

        const channelHints = collectChannelHints(ev.details);
        for (const requested of channelHints) {
          if (requested > maxChannels) {
            issues.push({
              severity: 'warning',
              code: 'CHANNEL_REQUIREMENT_UNSATISFIED',
              path: eventPath,
              message: `Event${eventId} requests ${requested} channels, but primary tool supports ${maxChannels}.`,
            });
          }
        }
      }
    }

    const tipManagement = executionPlan.tip_management;
    if (tipManagement?.racks) {
      const placementTiprackIds = new Set(
        tipracks
          .map((rack) => rack.tiprack_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      );
      for (let i = 0; i < tipManagement.racks.length; i += 1) {
        const rack = tipManagement.racks[i] ?? {};
        const rackPath = `tip_management.racks[${i}]`;
        if (!rack.tiprack_id || !placementTiprackIds.has(rack.tiprack_id)) {
          issues.push({
            severity: 'error',
            code: 'TIP_MANAGEMENT_UNKNOWN_RACK',
            path: `${rackPath}.tiprack_id`,
            message: `tip_management rack "${String(rack.tiprack_id)}" does not exist in placements.tipracks.`,
          });
        }
        if (typeof rack.next_tip_well === 'string' && !isWellAddress(rack.next_tip_well)) {
          issues.push({
            severity: 'warning',
            code: 'TIP_WELL_FORMAT',
            path: `${rackPath}.next_tip_well`,
            message: `next_tip_well "${rack.next_tip_well}" is not in A1-style format.`,
          });
        }
      }
    }

    if (tipManagement?.pause_on_depletion) {
      const hasPauseAction = (tipManagement.runtime_actions ?? []).some((action) => action?.kind === 'pause_for_tip_reload');
      if (!hasPauseAction) {
        issues.push({
          severity: 'warning',
          code: 'TIP_RELOAD_ACTION_MISSING',
          path: 'tip_management.runtime_actions',
          message: 'pause_on_depletion is enabled but no pause_for_tip_reload runtime action is defined.',
        });
      }
    }

    if (typeof executionEnvironment.constraints?.max_labware_items === 'number' && labwarePlacements.length > executionEnvironment.constraints.max_labware_items) {
      issues.push({
        severity: 'error',
        code: 'MAX_LABWARE_EXCEEDED',
        path: 'placements.labware',
        message: `Plan uses ${labwarePlacements.length} labware placements; max is ${executionEnvironment.constraints.max_labware_items}.`,
      });
    }

    if (typeof executionEnvironment.constraints?.max_tipracks === 'number' && tipracks.length > executionEnvironment.constraints.max_tipracks) {
      issues.push({
        severity: 'error',
        code: 'MAX_TIPRACKS_EXCEEDED',
        path: 'placements.tipracks',
        message: `Plan uses ${tipracks.length} tipracks; max is ${executionEnvironment.constraints.max_tipracks}.`,
      });
    }

    const sorted = sortIssues(issues);
    return {
      valid: sorted.every((issue) => issue.severity !== 'error'),
      issues: sorted,
    };
  }
}
