import type { PolicyDecisionDisposition, PolicySettingOrigin, ResolvedPolicyProfile } from '../policy/types.js';
import type { RecordRef } from './ref.js';

export type PersonStatus = 'active' | 'inactive' | 'contractor' | 'suspended';
export type EquipmentStatus = 'active' | 'out_of_service' | 'retired' | 'maintenance';
export type TrainingRecordStatus = 'passed' | 'completed' | 'failed' | 'in_progress';
export type AuthorizationStatus = 'active' | 'suspended' | 'revoked';
export type CapabilityRecordStatus = 'active' | 'draft' | 'deprecated';
export type CalibrationStatus = 'pass' | 'fail' | 'adjusted' | 'limited_use';
export type QualificationStatus = 'pass' | 'fail' | 'limited_use';

export interface PersonRecordPayload {
  kind: 'person';
  id: string;
  displayName: string;
  status: PersonStatus;
  organizationId?: string;
  labIds?: string[];
  roleIds?: string[];
  supervisorRefs?: RecordRef[];
  notes?: string;
}

export interface TrainingMaterialScope {
  verbRefs?: RecordRef[];
  methodIds?: string[];
  equipmentRefs?: RecordRef[];
  equipmentClassRefs?: RecordRef[];
}

export interface TrainingMaterialPayload {
  kind: 'training-material';
  id: string;
  title: string;
  version?: string;
  materialType: string;
  effectiveAt?: string;
  scope?: TrainingMaterialScope;
  notes?: string;
}

export interface TrainingRecordPayload {
  kind: 'training-record';
  id: string;
  personRef: RecordRef;
  trainingMaterialRef: RecordRef;
  trainerRef?: RecordRef;
  status: TrainingRecordStatus;
  completedAt: string;
  expiresAt?: string;
  limitations?: string[];
  notes?: string;
}

export interface AuthorizationScope {
  verbRefs?: RecordRef[];
  methodIds?: string[];
  equipmentRefs?: RecordRef[];
  equipmentClassRefs?: RecordRef[];
}

export interface CompetencyAuthorizationPayload {
  kind: 'competency-authorization';
  id: string;
  personRef: RecordRef;
  status: AuthorizationStatus;
  scope?: AuthorizationScope;
  effectiveAt: string;
  expiresAt?: string;
  restrictions?: {
    supervisedOnly?: boolean;
    notes?: string;
  };
  notes?: string;
}

export interface EquipmentClassPayload {
  kind: 'equipment-class';
  id: string;
  name: string;
  manufacturer?: string;
  modelFamily?: string;
  executionBackends?: string[];
  readinessRequirements?: {
    calibrationRequired?: boolean;
    qualificationRequired?: boolean;
  };
  notes?: string;
}

export interface EquipmentPayload {
  kind: 'equipment';
  id: string;
  name: string;
  equipmentClassRef?: RecordRef;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  assetTag?: string;
  location?: string;
  status: EquipmentStatus;
  executionBackends?: string[];
  readiness?: {
    calibrationRequired?: boolean;
    qualificationRequired?: boolean;
  };
  notes?: string;
}

export interface VerbDefinitionPayload {
  kind: 'verb-definition';
  id: string;
  canonical: string;
  label: string;
  domain?: string;
  backendHints?: string[];
  notes?: string;
}

export interface EquipmentCapabilityItem {
  verbRef: RecordRef;
  methodIds?: string[];
  backendImplementations?: string[];
  constraints?: Record<string, unknown>;
  notes?: string;
}

export interface EquipmentCapabilityPayload {
  kind: 'equipment-capability';
  id: string;
  status: CapabilityRecordStatus;
  equipmentRef?: RecordRef;
  equipmentClassRef?: RecordRef;
  capabilities: EquipmentCapabilityItem[];
  notes?: string;
}

export interface EquipmentTrainingRequirementPayload {
  kind: 'equipment-training-requirement';
  id: string;
  equipmentRef?: RecordRef;
  equipmentClassRef?: RecordRef;
  verbRefs?: RecordRef[];
  methodIds?: string[];
  requiredTrainingMaterialRefs?: RecordRef[];
  supervisedUseAllowedBeforeQualification?: boolean;
  notes?: string;
}

export interface MethodTrainingRequirementPayload {
  kind: 'method-training-requirement';
  id: string;
  methodId: string;
  requiredTrainingMaterialRefs?: RecordRef[];
  requiresEquipmentQualification?: boolean;
  notes?: string;
}

export interface CalibrationRecordPayload {
  kind: 'calibration-record';
  id: string;
  equipmentRef: RecordRef;
  performedAt: string;
  dueAt?: string;
  status: CalibrationStatus;
  notes?: string;
}

export interface QualificationRecordPayload {
  kind: 'qualification-record';
  id: string;
  equipmentRef: RecordRef;
  qualificationType?: string;
  performedAt: string;
  dueAt?: string;
  status: QualificationStatus;
  notes?: string;
}

export interface CapabilityResolutionRequest {
  equipmentId: string;
  verbId: string;
  methodId?: string;
}

export interface ResolvedEquipmentCapability {
  capabilityRecordId: string;
  source: 'equipment' | 'equipment-class';
  verbId: string;
  methodIds: string[];
  backendImplementations: string[];
  constraints?: Record<string, unknown>;
  notes?: string;
}

export interface CapabilityResolutionResult {
  supported: boolean;
  equipment?: EquipmentPayload;
  equipmentClass?: EquipmentClassPayload;
  verb?: VerbDefinitionPayload;
  matches: ResolvedEquipmentCapability[];
}

export interface AdmissibilityRequest {
  policyProfiles: import('../policy/types.js').PolicyProfile[];
  scope: import('../policy/types.js').ActivePolicyScope;
  personId?: string;
  supervisorPersonId?: string;
  equipmentId?: string;
  verbId: string;
  methodId?: string;
  at?: string;
}

export interface AdmissibilityFinding {
  code: string;
  disposition: PolicyDecisionDisposition;
  message: string;
  subject: 'person' | 'equipment' | 'training' | 'authorization' | 'capability' | 'policy';
  recordIds?: string[];
  origin?: PolicySettingOrigin;
}

export interface AdmissibilityResult {
  admissible: boolean;
  disposition: PolicyDecisionDisposition;
  activeProfile: ResolvedPolicyProfile;
  findings: AdmissibilityFinding[];
  capability?: CapabilityResolutionResult;
}
