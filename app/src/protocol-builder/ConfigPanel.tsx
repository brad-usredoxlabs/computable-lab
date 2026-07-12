/**
 * ConfigPanel — unified configuration surface combining step toggles,
 * inline quantity overrides, and labware-to-deck-slot mapping.
 *
 * Renders two stacked sections:
 * 1. Step Configuration (ProtocolCandidatePreview with inline overrides)
 * 2. Labware Mapping (LabwareMappingPanel)
 *
 * State lives in ProtocolBuilderContext — this component is fully controlled.
 */

import type { AiProtocolCandidateSummary } from '../types/ai'
import { ProtocolCandidatePreview } from '../event-editor/protocol-builder/ProtocolCandidatePreview'
import type { StepOverride } from '../event-editor/protocol-builder/ProtocolCandidatePreview'
import { LabwareMappingPanel } from '../event-editor/protocol-builder/LabwareMappingPanel'
import type { LabwareMapping } from '../event-editor/protocol-builder/LabwareMappingPanel'

export interface ConfigPanelProps {
  candidate: AiProtocolCandidateSummary
  skippedSteps: Set<string>
  overrides: StepOverride[]
  mappings: LabwareMapping[]
  availableLabware: Array<{ id: string; label: string; type: string }>
  onToggleStep: (stepKey: string, enabled: boolean) => void
  onOverrideChange: (stepKey: string, field: keyof StepOverride, value: string | null) => void
  onMappingChange: (mapping: LabwareMapping) => void
}

export function ConfigPanel({
  candidate,
  skippedSteps,
  overrides,
  mappings,
  availableLabware,
  onToggleStep,
  onOverrideChange,
  onMappingChange,
}: ConfigPanelProps) {
  return (
    <div className="protocol-config-panel" data-testid="config-panel">
      {/* Step Configuration */}
      <section className="protocol-config-panel__section">
        <h3 className="protocol-config-panel__section-title">
          Step Configuration
        </h3>
        <ProtocolCandidatePreview
          candidate={candidate}
          skippedSteps={skippedSteps}
          overrides={overrides}
          onToggleStep={onToggleStep}
          onOverrideChange={onOverrideChange}
        />
      </section>

      {/* Labware Mapping */}
      <section className="protocol-config-panel__section">
        <h3 className="protocol-config-panel__section-title">
          Labware Mapping
        </h3>
        <LabwareMappingPanel
          candidate={candidate}
          availableLabware={availableLabware}
          mappings={mappings}
          onMappingChange={onMappingChange}
        />
      </section>
    </div>
  )
}
