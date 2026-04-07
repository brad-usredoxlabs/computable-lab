import { PolicyProfileService } from '../policy/PolicyProfileService.js';
import type { PolicyDecisionDisposition, PolicyDisposition, PolicyProfile } from '../policy/types.js';
import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type {
  AdmissibilityFinding,
  AdmissibilityRequest,
  AdmissibilityResult,
  CalibrationRecordPayload,
  CompetencyAuthorizationPayload,
  EquipmentTrainingRequirementPayload,
  MethodTrainingRequirementPayload,
  PersonRecordPayload,
  QualificationRecordPayload,
  TrainingRecordPayload,
} from '../types/capabilityAuthorization.js';
import { EquipmentCapabilityService } from '../capabilities/EquipmentCapabilityService.js';

function asPayload<T>(envelope: RecordEnvelope): T | null {
  return envelope.payload as T;
}

function compareDisposition(left: PolicyDecisionDisposition, right: PolicyDecisionDisposition): number {
  const rank: Record<PolicyDecisionDisposition, number> = {
    blocked: 3,
    'needs-confirmation': 2,
    allowed: 1,
  };
  return rank[left] - rank[right];
}

function maxDisposition(values: PolicyDecisionDisposition[]): PolicyDecisionDisposition {
  return values.reduce((current, value) => (compareDisposition(value, current) > 0 ? value : current), 'allowed');
}

function policyToDecision(disposition: PolicyDisposition): PolicyDecisionDisposition {
  switch (disposition) {
    case 'allow':
      return 'allowed';
    case 'confirm':
      return 'needs-confirmation';
    case 'deny':
      return 'blocked';
  }
}

function isExpired(timestamp: string | undefined, at: string): boolean {
  if (!timestamp) return false;
  return new Date(timestamp).getTime() < new Date(at).getTime();
}

function isEffective(effectiveAt: string | undefined, at: string): boolean {
  if (!effectiveAt) return true;
  return new Date(effectiveAt).getTime() <= new Date(at).getTime();
}

function refIds(refs: Array<{ id: string }> | undefined): string[] {
  return (refs ?? []).map((ref) => ref.id);
}

function matchesOptionalScope(allowed: string[] | undefined, requested?: string): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!requested) return false;
  return allowed.includes(requested);
}

function latestByDate<T extends { performedAt?: string; completedAt?: string; effectiveAt?: string }>(records: T[]): T | undefined {
  return [...records].sort((left, right) => {
    const leftDate = left.performedAt ?? left.completedAt ?? left.effectiveAt ?? '';
    const rightDate = right.performedAt ?? right.completedAt ?? right.effectiveAt ?? '';
    return rightDate.localeCompare(leftDate);
  })[0];
}

export class OperationalAdmissibilityService {
  private readonly policyProfiles = new PolicyProfileService();
  private readonly capabilityService: EquipmentCapabilityService;

  constructor(private readonly store: Pick<RecordStore, 'list'>) {
    this.capabilityService = new EquipmentCapabilityService(store);
  }

  private async listPayloads<T>(kind: string): Promise<T[]> {
    const envelopes = await this.store.list({ kind });
    return envelopes.map((envelope) => asPayload<T>(envelope)).filter((payload): payload is T => payload !== null);
  }

  private addPolicyFinding(
    findings: AdmissibilityFinding[],
    input: {
      code: string;
      message: string;
      subject: AdmissibilityFinding['subject'];
      recordIds?: string[];
      disposition: PolicyDisposition;
      origin: import('../policy/types.js').PolicySettingOrigin;
    },
  ): void {
    findings.push({
      code: input.code,
      disposition: policyToDecision(input.disposition),
      message: input.message,
      subject: input.subject,
      ...(input.recordIds ? { recordIds: input.recordIds } : {}),
      origin: input.origin,
    });
  }

  private authorizationMatches(
    authorization: CompetencyAuthorizationPayload,
    input: AdmissibilityRequest,
    equipmentClassId?: string,
  ): boolean {
    const scope = authorization.scope;
    if (!scope) return true;
    if (!matchesOptionalScope(refIds(scope.verbRefs), input.verbId)) return false;
    if (!matchesOptionalScope(scope.methodIds, input.methodId)) return false;
    if (!matchesOptionalScope(refIds(scope.equipmentRefs), input.equipmentId)) return false;
    if (!matchesOptionalScope(refIds(scope.equipmentClassRefs), equipmentClassId)) return false;
    return true;
  }

  private requirementMatches(
    requirement: EquipmentTrainingRequirementPayload | MethodTrainingRequirementPayload,
    input: AdmissibilityRequest,
    equipmentClassId?: string,
  ): boolean {
    if (requirement.kind === 'method-training-requirement') {
      return input.methodId !== undefined && requirement.methodId === input.methodId;
    }

    const equipmentMatch =
      (!requirement.equipmentRef && !requirement.equipmentClassRef) ||
      requirement.equipmentRef?.id === input.equipmentId ||
      requirement.equipmentClassRef?.id === equipmentClassId;
    if (!equipmentMatch) return false;
    if (!matchesOptionalScope(refIds(requirement.verbRefs), input.verbId)) return false;
    if (!matchesOptionalScope(requirement.methodIds, input.methodId)) return false;
    return true;
  }

  async evaluate(input: AdmissibilityRequest): Promise<AdmissibilityResult> {
    const at = input.at ?? new Date().toISOString();
    const activeProfile = this.policyProfiles.resolveActiveProfile(input.policyProfiles as PolicyProfile[], input.scope);
    const findings: AdmissibilityFinding[] = [];

    const capability =
      input.equipmentId !== undefined
        ? await this.capabilityService.resolveEquipmentSupport({
            equipmentId: input.equipmentId,
            verbId: input.verbId,
            ...(input.methodId ? { methodId: input.methodId } : {}),
          })
        : undefined;

    const equipment = capability?.equipment;
    const equipmentClassId = equipment?.equipmentClassRef?.id;

    if (input.equipmentId && !equipment) {
      findings.push({
        code: 'EQUIPMENT_NOT_FOUND',
        disposition: 'blocked',
        message: `Equipment ${input.equipmentId} was not found.`,
        subject: 'equipment',
        recordIds: [input.equipmentId],
      });
    }

    if (equipment && equipment.status !== 'active') {
      findings.push({
        code: 'EQUIPMENT_NOT_ACTIVE',
        disposition: 'blocked',
        message: `Equipment ${equipment.id} is ${equipment.status}.`,
        subject: 'equipment',
        recordIds: [equipment.id],
      });
    }

    if (capability && !capability.supported) {
      findings.push({
        code: 'CAPABILITY_UNSUPPORTED',
        disposition: 'blocked',
        message: `Equipment ${input.equipmentId} does not support verb ${input.verbId}${input.methodId ? ` for method ${input.methodId}` : ''}.`,
        subject: 'capability',
        ...(input.equipmentId ? { recordIds: [input.equipmentId] } : {}),
      });
    }

    if (input.personId) {
      const [people, authorizations, trainingRecords, equipmentRequirements, methodRequirements] = await Promise.all([
        this.listPayloads<PersonRecordPayload>('person'),
        this.listPayloads<CompetencyAuthorizationPayload>('competency-authorization'),
        this.listPayloads<TrainingRecordPayload>('training-record'),
        this.listPayloads<EquipmentTrainingRequirementPayload>('equipment-training-requirement'),
        this.listPayloads<MethodTrainingRequirementPayload>('method-training-requirement'),
      ]);

      const person = people.find((candidate) => candidate.id === input.personId);
      if (!person) {
        findings.push({
          code: 'PERSON_NOT_FOUND',
          disposition: 'blocked',
          message: `Person ${input.personId} was not found.`,
          subject: 'person',
          recordIds: [input.personId],
        });
      } else if (person.status !== 'active' && person.status !== 'contractor') {
        findings.push({
          code: 'PERSON_NOT_ACTIVE',
          disposition: 'blocked',
          message: `Person ${person.id} is ${person.status}.`,
          subject: 'person',
          recordIds: [person.id],
        });
      }

      const matchingAuthorizations = authorizations
        .filter((authorization) => authorization.personRef.id === input.personId)
        .filter((authorization) => authorization.status === 'active')
        .filter((authorization) => isEffective(authorization.effectiveAt, at))
        .filter((authorization) => this.authorizationMatches(authorization, input, equipmentClassId));

      const activeAuthorization = matchingAuthorizations.find((authorization) => !isExpired(authorization.expiresAt, at));
      const expiredAuthorization = matchingAuthorizations.find((authorization) => isExpired(authorization.expiresAt, at));

      if (!activeAuthorization && expiredAuthorization) {
        this.addPolicyFinding(findings, {
          code: 'AUTHORIZATION_EXPIRED',
          disposition: activeProfile.settings.allowExpiredAuthorization,
          origin: activeProfile.origins.allowExpiredAuthorization,
          message: `Authorization ${expiredAuthorization.id} is expired for ${input.personId}.`,
          subject: 'authorization',
          recordIds: [expiredAuthorization.id],
        });
      }

      if (!activeAuthorization && !expiredAuthorization) {
        findings.push({
          code: 'AUTHORIZATION_MISSING',
          disposition: 'blocked',
          message: `No active authorization matches ${input.personId} for ${input.verbId}${input.methodId ? ` / ${input.methodId}` : ''}.`,
          subject: 'authorization',
          ...(input.personId ? { recordIds: [input.personId] } : {}),
        });
      }

      if (activeAuthorization?.restrictions?.supervisedOnly) {
        const supervisorAuthorized = input.supervisorPersonId
          ? authorizations
              .filter((authorization) => authorization.personRef.id === input.supervisorPersonId)
              .filter((authorization) => authorization.status === 'active')
              .filter((authorization) => isEffective(authorization.effectiveAt, at) && !isExpired(authorization.expiresAt, at))
              .some((authorization) => this.authorizationMatches(authorization, input, equipmentClassId) && !authorization.restrictions?.supervisedOnly)
          : false;

        if (!supervisorAuthorized) {
          this.addPolicyFinding(findings, {
            code: 'SUPERVISION_REQUIRED',
            disposition: activeProfile.settings.allowSupervisedUse,
            origin: activeProfile.origins.allowSupervisedUse,
            message: `Authorization ${activeAuthorization.id} only permits supervised use.`,
            subject: 'authorization',
            recordIds: [activeAuthorization.id],
          });
        }
      }

      const applicableRequirements = [
        ...equipmentRequirements.filter((requirement) => this.requirementMatches(requirement, input, equipmentClassId)),
        ...methodRequirements.filter((requirement) => this.requirementMatches(requirement, input, equipmentClassId)),
      ];

      for (const requirement of applicableRequirements) {
        const trainingMaterialIds =
          requirement.kind === 'method-training-requirement'
            ? refIds(requirement.requiredTrainingMaterialRefs)
            : refIds(requirement.requiredTrainingMaterialRefs);

        for (const trainingMaterialId of trainingMaterialIds) {
          const personTraining = latestByDate(
            trainingRecords.filter(
              (record) =>
                record.personRef.id === input.personId &&
                record.trainingMaterialRef.id === trainingMaterialId &&
                (record.status === 'passed' || record.status === 'completed'),
            ),
          );

          if (!personTraining) {
            const supervisedAllowed =
              requirement.kind === 'equipment-training-requirement' && requirement.supervisedUseAllowedBeforeQualification;

            if (supervisedAllowed) {
              this.addPolicyFinding(findings, {
                code: 'TRAINING_SUPERVISED_ONLY',
                disposition: activeProfile.settings.allowSupervisedUse,
                origin: activeProfile.origins.allowSupervisedUse,
                message: `Training ${trainingMaterialId} is required before unsupervised use.`,
                subject: 'training',
                recordIds: [trainingMaterialId],
              });
            } else {
              findings.push({
                code: 'TRAINING_MISSING',
                disposition: 'blocked',
                message: `Training ${trainingMaterialId} is missing for ${input.personId}.`,
                subject: 'training',
                recordIds: [trainingMaterialId],
              });
            }
            continue;
          }

          if (isExpired(personTraining.expiresAt, at)) {
            this.addPolicyFinding(findings, {
              code: 'TRAINING_EXPIRED',
              disposition: activeProfile.settings.allowExpiredTraining,
              origin: activeProfile.origins.allowExpiredTraining,
              message: `Training record ${personTraining.id} is expired.`,
              subject: 'training',
              recordIds: [personTraining.id],
            });
          }
        }
      }
    }

    if (input.equipmentId && equipment) {
      const [calibrations, qualifications] = await Promise.all([
        this.listPayloads<CalibrationRecordPayload>('calibration-record'),
        this.listPayloads<QualificationRecordPayload>('qualification-record'),
      ]);

      const latestCalibration = latestByDate(
        calibrations.filter((record) => record.equipmentRef.id === equipment.id),
      );
      if (latestCalibration && (latestCalibration.status === 'fail' || isExpired(latestCalibration.dueAt, at))) {
        this.addPolicyFinding(findings, {
          code: 'CALIBRATION_NOT_CURRENT',
          disposition: activeProfile.settings.allowOutOfCalibrationEquipment,
          origin: activeProfile.origins.allowOutOfCalibrationEquipment,
          message: `Calibration record ${latestCalibration.id} is not current.`,
          subject: 'equipment',
          recordIds: [latestCalibration.id],
        });
      }

      const latestQualification = latestByDate(
        qualifications.filter((record) => record.equipmentRef.id === equipment.id),
      );
      if (latestQualification && (latestQualification.status === 'fail' || isExpired(latestQualification.dueAt, at))) {
        this.addPolicyFinding(findings, {
          code: 'QUALIFICATION_NOT_CURRENT',
          disposition: activeProfile.settings.allowUnqualifiedEquipment,
          origin: activeProfile.origins.allowUnqualifiedEquipment,
          message: `Qualification record ${latestQualification.id} is not current.`,
          subject: 'equipment',
          recordIds: [latestQualification.id],
        });
      }
    }

    const disposition = maxDisposition(findings.map((finding) => finding.disposition));

    return {
      admissible: disposition !== 'blocked',
      disposition,
      activeProfile,
      findings,
      ...(capability ? { capability } : {}),
    };
  }
}
