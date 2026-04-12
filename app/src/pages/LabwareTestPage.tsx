/**
 * Labware Test Page - For testing LabwarePicker component
 * This page is used for browser verification of spec-008
 */

import { LabwareList } from '../graph/labware/LabwareList'
import { LabwareEditorProvider } from '../graph/context/LabwareEditorContext'

export default function LabwareTestPage() {
  return (
    <div style={{ padding: '1rem' }}>
      <h1>Labware Test Page</h1>
      <p>This page is for testing the LabwarePicker component.</p>
      <LabwareEditorProvider>
        <LabwareList />
      </LabwareEditorProvider>
    </div>
  )
}
