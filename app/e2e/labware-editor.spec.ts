import { test, expect } from '@playwright/test'

function jsonResponse(payload: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  }
}

function buildDraftStorageKey(options?: {
  eventGraphId?: string | null
  runId?: string | null
  studyId?: string | null
  experimentId?: string | null
  forceNew?: boolean
  templateIds?: string[]
  prefillSegments?: string[]
}) {
  const editorKey = [
    options?.eventGraphId || 'new',
    options?.runId || 'none',
    options?.studyId || 'no-study',
    options?.experimentId || 'no-experiment',
    options?.forceNew ? 'force-new' : 'normal',
    options?.templateIds?.join(',') || 'no-templates',
    options?.prefillSegments?.join(',') || 'no-prefill',
  ].join(':')
  return `cl.labware-editor.draft:${editorKey}`
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

function createStoredDraft(overrides?: Record<string, unknown>) {
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
          selectedWells: ['A1'],
          highlightedWells: ['A1', 'A2'],
          lastClickedWell: 'A1',
        },
        {
          labwareId: targetPlate.labwareId,
          selectedWells: [],
          highlightedWells: ['B1'],
          lastClickedWell: null,
        },
      ],
      labwarePoses: [
        { labwareId: sourcePlate.labwareId, orientation: 'landscape' },
        { labwareId: targetPlate.labwareId, orientation: 'landscape' },
      ],
      events: [
        {
          eventId: 'draft-transfer',
          event_type: 'transfer',
          t_offset: 'PT5M',
          details: {
            source_labwareId: sourcePlate.labwareId,
            source_wells: ['A1', 'A2'],
            dest_labwareId: targetPlate.labwareId,
            dest_wells: ['B1', 'B2'],
            volume: { value: 20, unit: 'µL' },
            source: {
              labwareInstanceId: sourcePlate.labwareId,
              wells: ['A1', 'A2'],
            },
            target: {
              labwareInstanceId: targetPlate.labwareId,
              wells: ['B1', 'B2'],
            },
          },
        },
      ],
      selectedEventId: 'draft-transfer',
      editingEventId: null,
      isDirty: true,
      sourceLabwareId: sourcePlate.labwareId,
      targetLabwareId: targetPlate.labwareId,
    },
    contextMethodName: 'Recovered Draft Method',
    selectedVocabPackId: 'liquid-handling/v1',
    deckPlatform: 'integra_assist',
    deckVariant: 'assist_plus',
    deckPlacements: [],
    executionTargetPlatform: 'integra_assist',
    manualPipettingMode: false,
    selectedTool: {
      toolId: 'tool-draft',
      toolTypeId: 'pipette_assist_voyager_8ch_300',
      displayName: 'VOYAGER 8ch 300 uL (9-14 mm)',
      toolType: {
        toolTypeId: 'pipette_8ch_adjustable',
        displayName: '8-Channel Adjustable Pipette',
        icon: '🧬',
        capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
        channelCount: 8,
        groupingMode: 'channel',
        selectionConstraints: [
          { type: 'channelCount', count: 8, mode: 'exact' },
          { type: 'mapping', mode: 'one-to-one', countMustMatch: true },
        ],
        ontologyTerm: {
          iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
          label: 'multichannel pipette',
          ontology: 'obi',
        },
      },
      assistPipetteModel: {
        id: 'pipette_assist_voyager_8ch_300',
        family: 'voyager',
        channels: 8,
        volumeClassUl: 300,
        spacingMode: 'adjustable',
        spacingRangeMm: { min: 9, max: 14 },
        baseToolTypeId: 'pipette_8ch_adjustable',
        displayName: 'VOYAGER 8ch 300 uL (9-14 mm)',
      },
    },
    loadedTemplateSourceId: null,
    loadedTemplateBindings: [],
    loadedTemplateOutputs: [],
    contextInitialized: true,
    contextVocabChoice: 'liquid-handling/v1',
    contextPlatformChoice: 'integra_assist',
    ...overrides,
  }
}

function createSavedGraphPayload(overrides?: Record<string, unknown>) {
  const sourcePlate = createPlate96Labware('saved-source-plate', 'Saved Source Plate')
  const targetPlate = createPlate96Labware('saved-target-plate', 'Saved Target Plate')
  return {
    id: 'GRAPH-SAVED-VALUES',
    name: 'Saved Graph With Values',
    labwares: [sourcePlate, targetPlate],
    events: [
      {
        eventId: 'saved-transfer',
        event_type: 'transfer',
        t_offset: 'PT10M',
        details: {
          source_labwareId: sourcePlate.labwareId,
          source_wells: ['A1', 'A2'],
          dest_labwareId: targetPlate.labwareId,
          dest_wells: ['B1', 'B2'],
          volume: { value: 50, unit: 'µL' },
          source: {
            labwareInstanceId: sourcePlate.labwareId,
            wells: ['A1', 'A2'],
          },
          target: {
            labwareInstanceId: targetPlate.labwareId,
            wells: ['B1', 'B2'],
          },
        },
      },
    ],
    methodContext: {
      vocabId: 'liquid-handling/v1',
      platform: 'integra_assist',
      deckVariant: 'assist_plus',
      locked: false,
    },
    ...overrides,
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

async function waitForDraftPersistence(page: Parameters<typeof test>[0]['page'], storageKey: string) {
  await page.waitForFunction((key) => {
    const raw = window.localStorage.getItem(key)
    return Boolean(raw && JSON.parse(raw)?.version === 2)
  }, storageKey)
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

test.describe('Labware Event Editor', () => {
  test('blank entry opens directly with liquid-handling manual defaults', async ({ page }) => {
    await page.goto('/labware-editor')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('dialog', { name: 'Choose method context' })).toHaveCount(0)
    await expect(page.locator('.deck-panel')).toBeVisible()
    await expect(page.getByLabel('Robot')).toHaveValue('manual')
    await expect(page.locator('.vocab-pack-trigger')).toContainText('Liquid Handling')
  })

  test('toolbar vocab and platform controls remain editable after load', async ({ page }) => {
    await page.goto('/labware-editor')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    const robotSelect = page.getByLabel('Robot')
    await expect(robotSelect).toHaveValue('manual')

    await page.locator('.tool-selector-trigger').click()
    await expect(page.locator('.tool-selector-dropdown')).not.toContainText('VOYAGER')
    await page.locator('.tool-selector-trigger').click()

    await robotSelect.selectOption('integra_assist')
    await expect(robotSelect).toHaveValue('integra_assist')

    await page.locator('.tool-selector-trigger').click()
    await expect(page.locator('.tool-selector-dropdown')).toContainText('VOYAGER')
    await page.locator('.tool-selector-trigger').click()

    await page.locator('.vocab-pack-trigger').click()
    await page.getByRole('button', { name: /Cell\/Animal Handling/ }).click()
    await expect(page.locator('.vocab-pack-trigger')).toContainText('Cell/Animal Handling')
    await expect(robotSelect).toHaveValue('manual')
    await expect(robotSelect.locator('option')).toHaveCount(1)
    await expect(robotSelect.locator('option')).toContainText(['Manual'])
  })

  test('loaded graphs keep their persisted method context instead of defaulting to manual', async ({ page }) => {
    await page.route('**/api/records/GRAPH-SAVED-CONTEXT', async (route) => {
      await route.fulfill(jsonResponse({
        record: {
          payload: {
            id: 'GRAPH-SAVED-CONTEXT',
            name: 'Saved Graph',
            labwares: [],
            events: [],
            methodContext: {
              vocabId: 'liquid-handling/v1',
              platform: 'integra_assist',
              deckVariant: 'assist_plus',
              locked: false,
            },
          },
        },
      }))
    })

    await page.goto('/labware-editor?id=GRAPH-SAVED-CONTEXT')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Robot')).toHaveValue('integra_assist')
    await expect(page.locator('.vocab-pack-trigger')).toContainText('Liquid Handling')
    await expect(page.getByRole('dialog', { name: 'Choose method context' })).toHaveCount(0)
  })

  test('unsaved local session survives route navigation away and hard reload', async ({ page }) => {
    const draftStorageKey = buildDraftStorageKey()

    await page.goto('/labware-editor')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    const robotSelect = page.getByLabel('Robot')
    await robotSelect.selectOption('integra_assist')
    await expect(robotSelect).toHaveValue('integra_assist')

    await page.locator('.tool-selector-trigger').click()
    await page.locator('.tool-option').filter({ hasText: 'VOYAGER 8ch 300 uL' }).click()
    await expect(page.locator('.tool-selector-trigger')).toContainText('VOYAGER 8ch 300 uL')

    await waitForDraftPersistence(page, draftStorageKey)
    const persistedDraft = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, draftStorageKey)
    expect(persistedDraft?.historyPolicy).toBe('snapshot-only')
    expect(persistedDraft?.multiTabPolicy).toBe('last-write-wins')

    await page.goto('/settings')
    await page.goto('/labware-editor')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Robot')).toHaveValue('integra_assist')
    await expect(page.locator('.tool-selector-trigger')).toContainText('VOYAGER 8ch 300 uL')

    await page.reload()
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Robot')).toHaveValue('integra_assist')
    await expect(page.locator('.tool-selector-trigger')).toContainText('VOYAGER 8ch 300 uL')
  })

  test('restores full draft snapshot from local storage and records explicit restore policies', async ({ page }) => {
    const draftStorageKey = buildDraftStorageKey()
    await seedLocalDraft(page, draftStorageKey, createStoredDraft())

    await page.goto('/labware-editor')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Robot')).toHaveValue('integra_assist')
    await expect(page.locator('.vocab-pack-trigger')).toContainText('Liquid Handling')
    await expect(page.locator('.tool-selector-trigger')).toContainText('VOYAGER 8ch 300 uL')
    await expect(page.getByRole('button', { name: /Draft Source Plate/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Draft Target Plate/ })).toBeVisible()
    await expect(page.locator('.scrubber-focus')).toContainText('Transfer')
    await expect(page.locator('[data-pane-role="source"] [data-well-id="A1"][data-selected="true"]')).toBeVisible()
    await expect(page.locator('[data-pane-role="source"] [data-well-id="A2"][data-highlighted="true"]')).toBeVisible()
    await expect(page.locator('[data-pane-role="target"] [data-well-id="B1"][data-highlighted="true"]')).toBeVisible()
  })

  test('malformed local draft data is discarded and the editor falls back to deterministic defaults', async ({ page }) => {
    const draftStorageKey = buildDraftStorageKey()
    await page.goto('/browser')
    await page.evaluate((key) => {
      window.localStorage.setItem(key, '{bad json')
    }, draftStorageKey)

    await page.goto('/labware-editor')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Robot')).toHaveValue('manual')
    await expect(page.locator('.vocab-pack-trigger')).toContainText('Liquid Handling')
    await expect(page.getByRole('button', { name: '+ Add' })).toBeVisible()
  })

  test('stale local drafts are ignored and fall back to current entry defaults', async ({ page }) => {
    const draftStorageKey = buildDraftStorageKey()
    await seedLocalDraft(page, draftStorageKey, createStoredDraft({ savedAt: 1 }))

    await page.goto('/labware-editor')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Robot')).toHaveValue('manual')
    await expect(page.locator('.vocab-pack-trigger')).toContainText('Liquid Handling')
    await expect(page.getByRole('button', { name: '+ Add' })).toBeVisible()
  })

  test('incompatible local drafts are discarded and removed before fallback defaults load', async ({ page }) => {
    const draftStorageKey = buildDraftStorageKey()
    await seedLocalDraft(page, draftStorageKey, createStoredDraft({
      version: 1,
      historyPolicy: 'merge',
      multiTabPolicy: 'unknown',
    }))

    await page.goto('/labware-editor')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Robot')).toHaveValue('manual')
    await expect(page.locator('.vocab-pack-trigger')).toContainText('Liquid Handling')
    const clearedDraft = await page.evaluate((key) => window.localStorage.getItem(key), draftStorageKey)
    expect(clearedDraft).toBeNull()
  })

  test('existing saved graphs still load persisted labwares and events when no local draft exists', async ({ page }) => {
    await page.route('**/api/records/GRAPH-SAVED-VALUES', async (route) => {
      await route.fulfill(jsonResponse({
        record: {
          payload: createSavedGraphPayload(),
        },
      }))
    })

    await page.goto('/labware-editor?id=GRAPH-SAVED-VALUES')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Robot')).toHaveValue('integra_assist')
    await expect(page.getByRole('button', { name: /Saved Source Plate/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Saved Target Plate/ })).toBeVisible()
    await expect(page.locator('.scrubber-position')).toContainText('1/1')
    await expect(page.locator('.scrubber-current')).toContainText('Transfer')

    await page.locator('.scrubber-tick').first().click()
    await expect(page.locator('.scrubber-focus')).toContainText('Transfer')
    await expect(page.locator('[data-pane-role="source"] [data-well-id="A1"][data-highlighted="true"]')).toBeVisible()
    await expect(page.locator('[data-pane-role="target"] [data-well-id="B1"][data-highlighted="true"]')).toBeVisible()
  })

  test('route-scoped local drafts take precedence over server data for the same editor entry', async ({ page }) => {
    const draftStorageKey = buildDraftStorageKey({ eventGraphId: 'GRAPH-SAVED-CONTEXT' })
    await seedLocalDraft(page, draftStorageKey, createStoredDraft({
      contextMethodName: 'Local Override Draft',
      deckPlatform: 'manual',
      executionTargetPlatform: 'opentrons_ot2',
      manualPipettingMode: true,
      selectedTool: {
        toolId: 'tool-local',
        toolTypeId: 'pipette_8ch_fixed',
        displayName: '8-Channel Fixed Pipette',
        toolType: {
          toolTypeId: 'pipette_8ch_fixed',
          displayName: '8-Channel Fixed Pipette',
          icon: '🔬',
          capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
          channelCount: 8,
          groupingMode: 'channel',
          selectionConstraints: [
            { type: 'channelCount', count: 8, mode: 'exact' },
            {
              type: 'pattern',
              patterns: [{ name: 'column_8', description: 'Full column (A-H)', validatorRef: 'validators/column8' }],
            },
            { type: 'mapping', mode: 'one-to-one', countMustMatch: true },
          ],
          ontologyTerm: {
            iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
            label: 'multichannel pipette',
            ontology: 'obi',
          },
        },
      },
      contextPlatformChoice: 'manual',
    }))

    let graphRequestCount = 0
    await page.route('**/api/records/GRAPH-SAVED-CONTEXT', async (route) => {
      graphRequestCount += 1
      await route.fulfill(jsonResponse({
        record: {
          payload: {
            id: 'GRAPH-SAVED-CONTEXT',
            name: 'Saved Graph',
            labwares: [],
            events: [],
            methodContext: {
              vocabId: 'liquid-handling/v1',
              platform: 'integra_assist',
              deckVariant: 'assist_plus',
              locked: false,
            },
          },
        },
      }))
    })

    await page.goto('/labware-editor?id=GRAPH-SAVED-CONTEXT')

    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('Robot')).toHaveValue('manual')
    await expect(page.locator('.tool-selector-trigger')).toContainText('8-Channel Fixed Pipette')
    await expect(page.getByRole('button', { name: /Draft Source Plate/ })).toBeVisible()
    expect(graphRequestCount).toBe(0)
  })

  test('same-route drafts use explicit last-write-wins semantics across tabs', async ({ page, context }) => {
    const draftStorageKey = buildDraftStorageKey()
    await seedLocalDraft(page, draftStorageKey, createStoredDraft({ contextMethodName: 'First Tab Draft' }))

    await page.goto('/labware-editor')
    await expect(page.getByRole('button', { name: /Draft Source Plate/ })).toBeVisible()
    await expect(page.getByLabel('Robot')).toHaveValue('integra_assist')

    const secondPage = await context.newPage()
    await seedLocalDraft(secondPage, draftStorageKey, createStoredDraft({
      contextMethodName: 'Second Tab Draft',
      deckPlatform: 'manual',
      executionTargetPlatform: 'opentrons_ot2',
      manualPipettingMode: true,
      selectedTool: {
        toolId: 'tool-second-tab',
        toolTypeId: 'pipette_8ch_fixed',
        displayName: '8-Channel Fixed Pipette',
        toolType: {
          toolTypeId: 'pipette_8ch_fixed',
          displayName: '8-Channel Fixed Pipette',
          icon: '🔬',
          capabilities: ['aspirate', 'dispense', 'mix', 'transfer'],
          channelCount: 8,
          groupingMode: 'channel',
          selectionConstraints: [
            { type: 'channelCount', count: 8, mode: 'exact' },
            {
              type: 'pattern',
              patterns: [{ name: 'column_8', description: 'Full column (A-H)', validatorRef: 'validators/column8' }],
            },
            { type: 'mapping', mode: 'one-to-one', countMustMatch: true },
          ],
          ontologyTerm: {
            iri: 'http://purl.obolibrary.org/obo/OBI_0000426',
            label: 'multichannel pipette',
            ontology: 'obi',
          },
        },
      },
      contextPlatformChoice: 'manual',
    }))
    const secondTabStoredDraft = await secondPage.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, draftStorageKey)
    expect(secondTabStoredDraft?.deckPlatform).toBe('manual')
    expect(secondTabStoredDraft?.selectedTool?.toolTypeId).toBe('pipette_8ch_fixed')

    const restoredPage = await context.newPage()
    await restoredPage.goto('/labware-editor')
    await expect(restoredPage.getByRole('button', { name: /Draft Source Plate/ })).toBeVisible()
    await expect(restoredPage.getByLabel('Robot')).toHaveValue('manual')
    await expect(restoredPage.locator('.tool-selector-trigger')).toContainText('8-Channel Fixed Pipette')

    await restoredPage.close()
    await secondPage.close()
  })

  test('page loads with toolbar and panes', async ({ page }) => {
    await page.goto('/labware-editor')

    // Should show the editor
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    // Should have toolbar
    await expect(page.locator('.labware-event-editor-v2__toolbar')).toBeVisible()
  })

  test('toolbar shows tool selector and vocab pack', async ({ page }) => {
    await page.goto('/labware-editor')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    // Tool selector should be present
    const toolbar = page.locator('.labware-event-editor-v2__toolbar')
    await expect(toolbar).toBeVisible()

    // Should have save button
    const saveButton = page.locator('.save-button')
    await expect(saveButton).toBeVisible()
  })

  test('panes section is visible', async ({ page }) => {
    await page.goto('/labware-editor')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    // Panes container
    await expect(page.locator('.labware-event-editor-v2__panes')).toBeVisible()
  })

  test('event ribbon is visible', async ({ page }) => {
    await page.goto('/labware-editor')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    // Ribbon section
    await expect(page.locator('.labware-event-editor-v2__ribbon')).toBeVisible()
  })

  test('context panel is collapsible', async ({ page }) => {
    await page.goto('/labware-editor')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    const contextToggle = page.locator('.context-panel-toggle')
    if (await contextToggle.isVisible()) {
      await contextToggle.click()
      // Panel should toggle state
    }
  })

  test('semantic panel is collapsible', async ({ page }) => {
    await page.goto('/labware-editor')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    const semanticToggle = page.locator('.semantic-panel-toggle')
    if (await semanticToggle.isVisible()) {
      await semanticToggle.click()
      // Panel should toggle state
    }
  })

  test('navigating from browser with runId', async ({ page }) => {
    // First create or find a run via the browser
    await page.goto('/browser')
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 10_000 })

    // Look for a run in the tree - expand study first
    const openLinks = page.locator('a:has-text("open")')
    if (await openLinks.count() > 0) {
      // Click first study to select it
      await openLinks.first().click()

      // Check if "New Event Graph" button appears (only on runs)
      const eventGraphBtn = page.getByText('🧪 New Event Graph')
      if (await eventGraphBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await eventGraphBtn.click()
        await expect(page).toHaveURL(/\/labware-editor\?/)
        await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })
      }
    }
  })

  test('fixture focus demo highlights transfer source and target panes', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox headless intermittently fails fixture navigation with NS_ERROR_OUT_OF_MEMORY before app assertions run.'
    )
    await gotoLabwareEditorFixture(page, 'focus-demo')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    await expect(page.locator('.scrubber-focus')).toContainText('Transfer')
    await expect(page.locator('[data-pane-role="source"] .pane-focus-info')).toContainText('2 wells')
    await expect(page.locator('[data-pane-role="target"] .pane-focus-info')).toContainText('2 wells')

    await expect(page.locator('[data-pane-role="source"] [data-well-id="A1"][data-highlighted="true"]')).toBeVisible()
    await expect(page.locator('[data-pane-role="source"] [data-well-id="A2"][data-highlighted="true"]')).toBeVisible()
    await expect(page.locator('[data-pane-role="target"] [data-well-id="B1"][data-highlighted="true"]')).toBeVisible()
    await expect(page.locator('[data-pane-role="target"] [data-well-id="B2"][data-highlighted="true"]')).toBeVisible()

    await page.locator('.tool-selector-trigger').click()
    await page.locator('.tool-selector-dropdown .tool-option').filter({ hasText: '8 channel' }).first().click()

    await expect(page.locator('.toolbar-session-status')).toContainText('Aspirate phase active')
    await expect(page.getByTestId('tool-session-summary')).toContainText('aspirate')
    await expect(page.getByTestId('tool-session-summary')).toContainText('8 channels')
    await page.locator('[data-pane-role="target"] [data-well-id="B3"]').click()
    await expect(page.getByTestId('tool-session-summary')).toContainText('8 target wells')
    await expect(page.getByRole('button', { name: '3) Commit' })).toBeDisabled()

    await page.locator('[data-pane-role="source"] [data-well-id="A3"]').click()
    await expect(page.locator('.toolbar-session-status')).toContainText('Source wells captured')

    await page.getByRole('button', { name: '2) Dispense' }).click()
    await expect(page.locator('.toolbar-session-status')).toContainText('Dispense phase active')

    await page.locator('[data-pane-role="source"] [data-well-id="A4"]').click()
    await expect(page.getByTestId('tool-session-summary')).toContainText('8 source wells')

    await page.locator('[data-pane-role="target"] [data-well-id="B3"]').click()
    await expect(page.locator('.toolbar-session-status')).toContainText('Target wells captured')
    await expect(page.getByTestId('tool-session-summary')).toContainText('source wells')
    await expect(page.getByTestId('tool-session-summary')).toContainText('target wells')
    await expect(page.getByRole('button', { name: '3) Commit' })).toBeEnabled()
  })

  test('fixture focus demo updates focus when selecting macro event', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox headless intermittently fails fixture navigation with NS_ERROR_OUT_OF_MEMORY before app assertions run.'
    )
    await gotoLabwareEditorFixture(page, 'focus-demo')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    await page.locator('.scrubber-tick').nth(2).click()

    await expect(page.locator('.scrubber-focus')).toContainText('spacing transition transfer')
    await expect(page.locator('[data-pane-role="source"] [data-well-id="C1"][data-highlighted="true"]')).toBeVisible()
    await expect(page.locator('[data-pane-role="source"] [data-well-id="C2"][data-highlighted="true"]')).toBeVisible()
    await expect(page.locator('[data-pane-role="target"] [data-well-id="D1"][data-highlighted="true"]')).toBeVisible()
    await expect(page.locator('[data-pane-role="target"] [data-well-id="D2"][data-highlighted="true"]')).toBeVisible()
  })

  test('fixture focus demo separates focused event from manual well selection panels', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox headless intermittently fails fixture navigation with NS_ERROR_OUT_OF_MEMORY before app assertions run.'
    )
    await gotoLabwareEditorFixture(page, 'focus-demo')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    await expect(page.getByTestId('editor-state-banner')).toContainText('Focused Event')
    await expect(page.getByTestId('selection-workspace-hint')).toContainText('manual well selection')

    await page.locator('[data-pane-role="source"] [data-well-id="A4"]').click()

    await expect(page.getByTestId('editor-state-banner')).toContainText('Selected Wells')
    await expect(page.getByTestId('editor-state-banner')).toContainText('1 well')
    await expect(page.getByTestId('selection-workspace-hint')).toHaveCount(0)
    await expect(page.locator('.selection-actions-strip__summary')).toContainText('1 selected well')
    await expect(page.getByRole('button', { name: 'View State' })).toBeVisible()
  })

  test('fixture focus demo keeps focus separate from edit and create modes', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox headless intermittently fails fixture navigation with NS_ERROR_OUT_OF_MEMORY before app assertions run.'
    )
    await gotoLabwareEditorFixture(page, 'focus-demo')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    await expect(page.locator('.form-mode')).toContainText('Focused Event 2')
    await page.getByRole('button', { name: 'Edit Focused' }).click()
    await expect(page.locator('.form-mode')).toContainText('Editing Event 2')

    await page.locator('.ribbon-btn--cancel').click()
    await expect(page.locator('.form-mode')).toContainText('Focused Event 2')

    await page.getByRole('button', { name: 'New Event' }).click()
    await expect(page.locator('.form-mode')).toContainText('Create New Event')
    await expect(page.getByTestId('editor-state-banner')).toHaveCount(0)
  })

  test('reservoir linear fixture shows definition-driven axis and orientation diagnostics', async ({ page, browserName }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox headless intermittently fails fixture navigation with NS_ERROR_OUT_OF_MEMORY before app assertions run.'
    )
    await gotoLabwareEditorFixture(page, 'reservoir-linear')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    const diagnostics = page.locator('.labware-diagnostics')
    await expect(diagnostics).toBeVisible()
    await expect(diagnostics).toContainText('SOURCE')
    await expect(diagnostics).toContainText('TARGET')
    await expect(diagnostics).toContainText('axis:x')
    await expect(diagnostics).toContainText('axis:y')
    await expect(diagnostics).toContainText('orientation:landscape')
    await expect(diagnostics).toContainText('source:single_well')
    await expect(diagnostics).toContainText('source:per_channel')
  })
})
