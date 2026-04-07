import type { ApprovalAuthority } from '../policy/types.js';

export type LabReviewDisposition = 'allowed' | 'needs-confirmation' | 'blocked';
export type LabReviewSuggestionKind = 'timing-adjustment' | 'equipment-binding' | 'manual-fallback' | 'authorization';

export interface LabProtocolReviewRequest {
  document: {
    title: string;
    equipment: string[];
    steps: Array<{
      id: string;
      title: string;
      instruction: string;
      duration?: string;
      notes?: string;
    }>;
  };
}

export interface LabProtocolReviewDiagnostic {
  id: string;
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  disposition: LabReviewDisposition;
  subject: 'step' | 'equipment' | 'policy' | 'backend';
  stepId?: string;
  equipmentId?: string;
}

export interface LabProtocolReviewSuggestion {
  id: string;
  targetKind: 'step' | 'equipment';
  targetId: string;
  kind: LabReviewSuggestionKind;
  disposition: LabReviewDisposition;
  title: string;
  summary: string;
  suggestedValue?: string;
  currentValue?: string;
  equipmentId?: string;
  equipmentLabel?: string;
  equipmentClass?: string;
  backendId?: string;
  authority?: ApprovalAuthority;
  diagnosticIds: string[];
}

export interface LabProtocolEquipmentReview {
  equipmentId: string;
  label: string;
  equipmentClass?: string;
  backendId?: string;
  suggestions: LabProtocolReviewSuggestion[];
  diagnostics: LabProtocolReviewDiagnostic[];
}

export interface LabProtocolStepReview {
  stepId: string;
  title: string;
  instruction: string;
  duration?: string;
  selectedBackendId?: string;
  executionMode: 'manual' | 'instrument';
  disposition: LabReviewDisposition;
  requiresConfirmation: boolean;
  equipmentId?: string;
  equipmentLabel?: string;
  suggestions: LabProtocolReviewSuggestion[];
  diagnostics: LabProtocolReviewDiagnostic[];
}

export interface LabProtocolPolicySummary {
  profileId: string;
  label: string;
  description: string;
  approvalAuthority: ApprovalAuthority;
  autoCreate: string[];
  reviewRequired: string[];
  blocked: string[];
  advisory: string[];
}

export interface LabProtocolReviewResponse {
  success: true;
  reviewId: string;
  status: 'ready' | 'blocked';
  policyProfile: LabProtocolPolicySummary;
  equipment: LabProtocolEquipmentReview[];
  steps: LabProtocolStepReview[];
  diagnostics: LabProtocolReviewDiagnostic[];
  generatedAt: string;
}

type EquipmentCapability = {
  classLabel: string;
  backendId: string;
  keywords: string[];
};

type StepRequirement = {
  role?: 'timer' | 'shaker' | 'pipette' | 'reader' | 'incubator';
  equipmentClass?: string;
  backendId?: string;
  timingSuggestion?: string;
  manualFallback?: boolean;
  authorization?: boolean;
};

const POLICY_SUMMARY: LabProtocolPolicySummary = {
  profileId: 'taptab-lab-review-default',
  label: 'TapTab Lab Review Default',
  description: 'Turns extracted protocol prose into draft lab bindings, review-required edits, and blocked capability diagnostics without creating execution records.',
  approvalAuthority: 'supervisor',
  autoCreate: [
    'Draft timer and manual fallback paths are created automatically when a safe placeholder exists.',
  ],
  reviewRequired: [
    'Equipment bindings, timing edits, and supervised-use hints require human confirmation before the draft is lab-ready.',
  ],
  blocked: [
    'Unsupported equipment classes, missing backend paths, and authorization limitations stay blocked until the protocol or lab context changes.',
  ],
  advisory: [
    'Manual fallback and operator notes can remain unresolved while you continue editing the draft protocol.',
  ],
};

const EQUIPMENT_CAPABILITIES: EquipmentCapability[] = [
  {
    classLabel: 'Orbital shaker',
    backendId: 'orbital_shaker',
    keywords: ['shaker', 'orbital shaker', 'plate shaker', 'mixer', 'agitator'],
  },
  {
    classLabel: 'Timer',
    backendId: 'manual-timer',
    keywords: ['timer', 'stopwatch', 'clock'],
  },
  {
    classLabel: 'Plate reader',
    backendId: 'plate_reader',
    keywords: ['reader', 'plate reader', 'spectrophotometer'],
  },
  {
    classLabel: 'Incubator',
    backendId: 'incubator',
    keywords: ['incubator', 'warming chamber', 'oven'],
  },
  {
    classLabel: 'Multichannel pipette',
    backendId: 'manual-pipette',
    keywords: ['pipette', 'multichannel', 'single channel'],
  },
];

function slugify(value: string, fallback: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function makeEquipmentId(label: string, index: number): string {
  return `equipment-${index + 1}-${slugify(label, `item-${index + 1}`)}`;
}

function makeDiagnosticId(prefix: string, code: string): string {
  return `${prefix}:${code.toLowerCase()}`;
}

function durationMinutes(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(min|mins|minutes|h|hr|hrs|hours)/i);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1] ?? '0');
  if (!Number.isFinite(amount)) return undefined;
  const unit = (match[2] ?? '').toLowerCase();
  return unit.startsWith('h') ? amount * 60 : amount;
}

function detectEquipmentCapability(label: string): EquipmentCapability | undefined {
  const normalized = label.toLowerCase();
  return EQUIPMENT_CAPABILITIES.find((capability) => capability.keywords.some((keyword) => normalized.includes(keyword)));
}

function inferStepRequirement(step: { title: string; instruction: string; duration?: string }): StepRequirement {
  const haystack = `${step.title} ${step.instruction}`.toLowerCase();
  if (/\b(read|measure|scan)\b/.test(haystack)) {
    return {
      role: 'reader',
      equipmentClass: 'Plate reader',
      backendId: 'plate_reader',
      manualFallback: false,
      authorization: true,
    };
  }
  if (/\b(shake|mix|agitat)\b/.test(haystack)) {
    return {
      role: 'shaker',
      equipmentClass: 'Orbital shaker',
      backendId: 'orbital_shaker',
      ...(durationMinutes(step.duration) && durationMinutes(step.duration)! >= 2 ? {} : { timingSuggestion: '2 min' }),
      manualFallback: true,
      authorization: true,
    };
  }
  if (/\b(warm|equilibrat|room temperature|incubat|rest)\b/.test(haystack)) {
    return {
      role: 'timer',
      equipmentClass: 'Timer',
      backendId: 'manual-timer',
      ...(durationMinutes(step.duration) && durationMinutes(step.duration)! >= 15 ? {} : { timingSuggestion: '15 min' }),
      manualFallback: true,
      authorization: false,
    };
  }
  if (/\b(add|dispense|transfer|pipett)\b/.test(haystack)) {
    return {
      role: 'pipette',
      equipmentClass: 'Multichannel pipette',
      backendId: 'manual-pipette',
      manualFallback: true,
      authorization: false,
    };
  }
  return {
    role: 'timer',
    equipmentClass: 'Timer',
    backendId: 'manual-timer',
    manualFallback: true,
    authorization: false,
  };
}

export function reviewProtocolForLab(input: LabProtocolReviewRequest): LabProtocolReviewResponse {
  const diagnostics: LabProtocolReviewDiagnostic[] = [];
  const equipment = input.document.equipment.map((label, index): LabProtocolEquipmentReview => {
    const equipmentId = makeEquipmentId(label, index);
    const capability = detectEquipmentCapability(label);
    const reviewDiagnostics: LabProtocolReviewDiagnostic[] = [];
    const suggestions: LabProtocolReviewSuggestion[] = [];

    if (!capability && label.trim()) {
      const diagnostic: LabProtocolReviewDiagnostic = {
        id: makeDiagnosticId(equipmentId, 'EQUIPMENT_UNSUPPORTED'),
        code: 'EQUIPMENT_UNSUPPORTED',
        severity: 'error',
        message: `Equipment "${label}" does not map to a supported equipment class.`,
        disposition: 'blocked',
        subject: 'equipment',
        equipmentId,
      };
      reviewDiagnostics.push(diagnostic);
      diagnostics.push(diagnostic);
    }

    if (capability) {
      suggestions.push({
        id: `${equipmentId}:bind`,
        targetKind: 'equipment',
        targetId: equipmentId,
        kind: 'equipment-binding',
        disposition: capability.classLabel === 'Timer' ? 'allowed' : 'needs-confirmation',
        title: `Bind ${label} to ${capability.classLabel}`,
        summary: capability.classLabel === 'Timer'
          ? 'Timer-only equipment can be auto-created as a draft binding.'
          : `Confirm the ${capability.classLabel} binding before lab protocol handoff.`,
        suggestedValue: capability.classLabel,
        currentValue: label,
        equipmentId,
        equipmentLabel: label,
        equipmentClass: capability.classLabel,
        backendId: capability.backendId,
        diagnosticIds: [],
      });
    }

    return {
      equipmentId,
      label,
      ...(capability ? { equipmentClass: capability.classLabel, backendId: capability.backendId } : {}),
      suggestions,
      diagnostics: reviewDiagnostics,
    };
  });

  const equipmentByRole = new Map<string, LabProtocolEquipmentReview>();
  for (const item of equipment) {
    if (!item.equipmentClass) continue;
    equipmentByRole.set(item.equipmentClass, item);
  }

  const steps = input.document.steps.map((step): LabProtocolStepReview => {
    const requirement = inferStepRequirement(step);
    const reviewDiagnostics: LabProtocolReviewDiagnostic[] = [];
    const suggestions: LabProtocolReviewSuggestion[] = [];
    const matchedEquipment = requirement.equipmentClass ? equipmentByRole.get(requirement.equipmentClass) : undefined;
    let disposition: LabReviewDisposition = 'allowed';
    let executionMode: 'manual' | 'instrument' = matchedEquipment && requirement.backendId !== 'manual-timer' && requirement.backendId !== 'manual-pipette'
      ? 'instrument'
      : 'manual';

    if (requirement.timingSuggestion && requirement.timingSuggestion !== step.duration) {
      suggestions.push({
        id: `${step.id}:timing`,
        targetKind: 'step',
        targetId: step.id,
        kind: 'timing-adjustment',
        disposition: 'needs-confirmation',
        title: `Adjust timing to ${requirement.timingSuggestion}`,
        summary: `The active policy profile marks timing edits as review-required for ${step.title}.`,
        suggestedValue: requirement.timingSuggestion,
        currentValue: step.duration || 'Unset',
        diagnosticIds: [],
      });
      disposition = 'needs-confirmation';
    }

    if (matchedEquipment) {
      const bindingSuggestion: LabProtocolReviewSuggestion = {
        id: `${step.id}:equipment`,
        targetKind: 'step',
        targetId: step.id,
        kind: 'equipment-binding',
        disposition: matchedEquipment.equipmentClass === 'Timer' ? 'allowed' : 'needs-confirmation',
        title: `Bind step to ${matchedEquipment.label}`,
        summary: matchedEquipment.equipmentClass === 'Timer'
          ? 'A timer placeholder can be carried automatically.'
          : `Use ${matchedEquipment.label} as the draft backend for this step.`,
        suggestedValue: matchedEquipment.label,
        ...(matchedEquipment.equipmentId ? { equipmentId: matchedEquipment.equipmentId } : {}),
        ...(matchedEquipment.label ? { equipmentLabel: matchedEquipment.label } : {}),
        ...(matchedEquipment.equipmentClass ? { equipmentClass: matchedEquipment.equipmentClass } : {}),
        ...(matchedEquipment.backendId ? { backendId: matchedEquipment.backendId } : {}),
        diagnosticIds: [],
      };
      suggestions.push(bindingSuggestion);
      if (bindingSuggestion.disposition === 'needs-confirmation') {
        disposition = 'needs-confirmation';
      }
    }

    if (!matchedEquipment && requirement.equipmentClass && requirement.role !== 'timer' && requirement.role !== 'pipette') {
      const diagnostic: LabProtocolReviewDiagnostic = {
        id: makeDiagnosticId(step.id, 'NO_ADMISSIBLE_BACKEND'),
        code: 'NO_ADMISSIBLE_BACKEND',
        severity: requirement.manualFallback ? 'warning' : 'error',
        message: `No ${requirement.equipmentClass.toLowerCase()} is available for step ${step.id}.`,
        disposition: requirement.manualFallback ? 'needs-confirmation' : 'blocked',
        subject: 'backend',
        stepId: step.id,
      };
      reviewDiagnostics.push(diagnostic);
      diagnostics.push(diagnostic);
      disposition = requirement.manualFallback ? 'needs-confirmation' : 'blocked';
    }

    if (!matchedEquipment && requirement.role === 'reader') {
      const diagnostic: LabProtocolReviewDiagnostic = {
        id: makeDiagnosticId(step.id, 'CAPABILITY_UNSUPPORTED'),
        code: 'CAPABILITY_UNSUPPORTED',
        severity: 'error',
        message: `No supported plate reader binding exists for step ${step.id}.`,
        disposition: 'blocked',
        subject: 'equipment',
        stepId: step.id,
      };
      reviewDiagnostics.push(diagnostic);
      diagnostics.push(diagnostic);
      disposition = 'blocked';
    }

    if (requirement.manualFallback) {
      suggestions.push({
        id: `${step.id}:manual`,
        targetKind: 'step',
        targetId: step.id,
        kind: 'manual-fallback',
        disposition: matchedEquipment ? 'allowed' : 'needs-confirmation',
        title: matchedEquipment ? 'Keep manual fallback ready' : 'Use manual fallback path',
        summary: matchedEquipment
          ? 'Manual fallback remains available if the instrument path is not approved.'
          : 'The policy profile allows a manual path while the equipment gap remains unresolved.',
        suggestedValue: 'manual',
        currentValue: executionMode,
        backendId: 'manual',
        diagnosticIds: reviewDiagnostics.map((entry) => entry.id),
      });
      if (!matchedEquipment && disposition !== 'blocked') {
        executionMode = 'manual';
      }
    }

    if (requirement.authorization && matchedEquipment) {
      const diagnostic: LabProtocolReviewDiagnostic = {
        id: makeDiagnosticId(step.id, 'AUTHORIZATION_REVIEW_REQUIRED'),
        code: 'AUTHORIZATION_REVIEW_REQUIRED',
        severity: 'warning',
        message: `Supervisor review is required before ${matchedEquipment.label} can be used for step ${step.id}.`,
        disposition: 'needs-confirmation',
        subject: 'policy',
        stepId: step.id,
        equipmentId: matchedEquipment.equipmentId,
      };
      reviewDiagnostics.push(diagnostic);
      diagnostics.push(diagnostic);
      suggestions.push({
        id: `${step.id}:authorization`,
        targetKind: 'step',
        targetId: step.id,
        kind: 'authorization',
        disposition: 'needs-confirmation',
        title: 'Request supervised use confirmation',
        summary: `The active policy requires ${POLICY_SUMMARY.approvalAuthority} approval for this equipment-backed step.`,
        ...(matchedEquipment.equipmentId ? { equipmentId: matchedEquipment.equipmentId } : {}),
        ...(matchedEquipment.label ? { equipmentLabel: matchedEquipment.label } : {}),
        ...(matchedEquipment.equipmentClass ? { equipmentClass: matchedEquipment.equipmentClass } : {}),
        authority: POLICY_SUMMARY.approvalAuthority,
        diagnosticIds: [diagnostic.id],
      });
      disposition = disposition === 'blocked' ? 'blocked' : 'needs-confirmation';
    }

    return {
      stepId: step.id,
      title: step.title,
      instruction: step.instruction,
      ...(step.duration ? { duration: step.duration } : {}),
      ...(matchedEquipment ? { selectedBackendId: matchedEquipment.backendId, equipmentId: matchedEquipment.equipmentId, equipmentLabel: matchedEquipment.label } : {}),
      executionMode,
      disposition,
      requiresConfirmation: disposition === 'needs-confirmation',
      suggestions,
      diagnostics: reviewDiagnostics,
    };
  });

  return {
    success: true,
    reviewId: `lab-review-${slugify(input.document.title || 'protocol', 'protocol')}`,
    status: diagnostics.some((entry) => entry.disposition === 'blocked') ? 'blocked' : 'ready',
    policyProfile: POLICY_SUMMARY,
    equipment,
    steps,
    diagnostics,
    generatedAt: new Date().toISOString(),
  };
}
