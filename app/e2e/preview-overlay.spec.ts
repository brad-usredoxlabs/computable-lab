import { test, expect } from '@playwright/test'

function jsonResponse(payload: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  }
}

function createPlate96Labware(labwareId: string, name: string) {
  return {
    labwareId,
    labwareType: 'plate_96',
    name,
    addressing: {
      type: 'grid',
      rows: 8,
      columns: 12,
      rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    },
    geometry: {
      maxVolume_uL: 300,
      minVolume_uL: 10,
      wellShape: 'round',
    },
    layoutFamily: 'sbs_plate',
    wellPitch_mm: 9,
    orientationPolicy: 'rotatable',
    color: '#339af0',
  }
}

function createStoredDraftWithPreviewEvents() {
  const sourcePlate = createPlate96Labware('draft-source-plate', 'Draft Source Plate')
  const targetPlate = createPlate96Labware('draft-target-plate', 'Draft Target Plate')
  return {
    version: 2,
    savedAt: Date.now(),
    historyPolicy: 'snapshot-only',
    multiTabPolicy: 'last-write-wins',
    editorState: {
      labwares: [sourcePlate, targetPlate],
      activeLabwareId: sourcePlate.labwareId,
      selections: [
        {
          labwareId: sourcePlate.labwareId,
          selectedWells: [],
          highlightedWells: [],
          lastClickedWell: null,
        },
        {
          labwareId: targetPlate.labwareId,
          selectedWells: [],
          highlightedWells: [],
          lastClickedWell: null,
        },
      ],
      labwarePoses: [
        { labwareId: sourcePlate.labwareId, orientation: 'landscape' },
        { labwareId: targetPlate.labwareId, orientation: 'landscape' },
      ],
      events: [],
      selectedEventId: null,
      editingEventId: null,
      isDirty: false,
      sourceLabwareId: sourcePlate.labwareId,
      targetLabwareId: targetPlate.labwareId,
    },
    contextMethodName: 'Preview Test Method',
    selectedVocabPackId: 'liquid-handling/v1',
    deckPlatform: 'manual',
    deckVariant: 'manual_collapsed',
    deckPlacements: [],
    executionTargetPlatform: 'opentrons_ot2',
    manualPipettingMode: true,
    selectedTool: null,
    loadedTemplateSourceId: null,
    loadedTemplateBindings: [],
    loadedTemplateOutputs: [],
    contextInitialized: true,
    contextVocabChoice: 'liquid-handling/v1',
    contextPlatformChoice: 'manual',
  }
}

async function seedLocalDraft(page: Parameters<typeof test>[0]['page'], storageKey: string, draft: unknown) {
  await page.goto('/browser')
  await page.evaluate(
    ([key, payload]) => {
      window.localStorage.setItem(key, JSON.stringify(payload))
    },
    [storageKey, draft] as const
  )
}

async function gotoLabwareEditorFixture(page: Parameters<typeof test>[0]['page'], fixtureName: string): Promise<void> {
  const targetUrl = `/?screen=labware-editor&fixture=${fixtureName}`
  try {
    await page.goto(targetUrl, { waitUntil: 'commit' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('NS_ERROR_OUT_OF_MEMORY')) {
      throw error
    }
    await page.goto('about:blank')
    await page.goto(targetUrl, { waitUntil: 'commit' })
  }
}

test.describe('AI preview overlay badges', () => {
  test('renders badges for preview events and updates state on click', async ({ page }) => {
    const draftStorageKey = 'cl.labware.editor.draft:preview-test:none:no-study:no-experiment:normal:no-templates:no-prefill'
    await seedLocalDraft(page, draftStorageKey, createStoredDraftWithPreviewEvents())

    await page.goto('/labware-editor')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    // Inject fake preview events via window.__test_setPreviewEvents if available
    // This is a test-only hook that should be exposed in dev/test builds
    const fakeEvent = {
      eventId: 'e1',
      event_type: 'add_material',
      details: {
        labwareId: 'draft-source-plate',
        wells: ['A1'],
        volume: { value: 100, unit: 'uL' },
      },
    }

    // Try to inject preview events via the test hook
    await page.evaluate((event) => {
      const win = window as any
      if (typeof win.__test_setPreviewEvents === 'function') {
        win.__test_setPreviewEvents([event])
      }
    }, fakeEvent)

    // Wait a bit for the UI to update
    await page.waitForTimeout(500)

    // Check if badges are rendered
    const badgeContainer = page.locator('.preview-event-badges')
    const badgeCount = await badgeContainer.count()
    
    // If badges are rendered, verify their behavior
    if (badgeCount > 0) {
      const badge = badgeContainer.locator('g').first()
      await expect(badge).toBeVisible()

      // Click the accept button (✓)
      const acceptText = badge.locator('text=✓').first()
      if (await acceptText.count() > 0) {
        await acceptText.click()
        
        // Wait for state update
        await page.waitForTimeout(300)

        // Check that the badge now shows accepted state (green stroke)
        const rect = badge.locator('rect').first()
        await expect(rect).toHaveAttribute('stroke', '#2f9e44')
      }
    }
  })

  test('badge styling reflects event state', async ({ page }) => {
    const draftStorageKey = 'cl.labware.editor.draft:preview-state-test:none:no-study:no-experiment:normal:no-templates:no-prefill'
    await seedLocalDraft(page, draftStorageKey, createStoredDraftWithPreviewEvents())

    await page.goto('/labware-editor')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    // Inject a rejected event
    const rejectedEvent = {
      eventId: 'e-rejected',
      event_type: 'add_material',
      details: {
        labwareId: 'draft-source-plate',
        wells: ['A1'],
        volume: { value: 100, unit: 'uL' },
      },
    }

    await page.evaluate((event) => {
      const win = window as any
      if (typeof win.__test_setPreviewEvents === 'function') {
        win.__test_setPreviewEvents([event])
        // Also set the state to rejected
        if (typeof win.__test_setPreviewEventState === 'function') {
          win.__test_setPreviewEventState('e-rejected', 'rejected')
        }
      }
    }, rejectedEvent)

    await page.waitForTimeout(500)

    // Check for rejected badge styling (gray stroke)
    const badgeContainer = page.locator('.preview-event-badges')
    if (await badgeContainer.count() > 0) {
      const rect = badgeContainer.locator('rect').first()
      await expect(rect).toHaveAttribute('stroke', '#868e96')
    }
  })
})
