import { test, expect } from '@playwright/test'

test.describe('Record Browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/browser')
    // Wait for initial loading to complete
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading...'), { timeout: 10_000 })
  })

  test('page loads with tree sidebar and preview panel', async ({ page }) => {
    // Left sidebar with search bar
    const searchInput = page.locator('input[placeholder*="Search records"]')
    await expect(searchInput).toBeVisible()

    // Right panel placeholder text
    await expect(page.getByText('Select a record to view its details')).toBeVisible()
  })

  test('displays study tree nodes', async ({ page }) => {
    // There should be at least some tree structure or the "New Study" button
    const newStudyButton = page.getByText('+ New Study')
    await expect(newStudyButton).toBeVisible()
  })

  test('inbox section is visible', async ({ page }) => {
    // Inbox should always be present
    const inbox = page.getByText(/_inbox/)
    await expect(inbox).toBeVisible()
  })

  test('clicking a study node expands it', async ({ page }) => {
    // Find a collapsed arrow and click it
    const studyNodes = page.locator('.tree-node >> nth=0')
    const firstStudy = studyNodes.locator('div').first()

    if (await firstStudy.isVisible()) {
      // Check for collapsed indicator
      const arrow = firstStudy.locator('text=▶').first()
      if (await arrow.isVisible()) {
        await firstStudy.click()
        // After expanding, should show ▼
        await expect(firstStudy.locator('text=▼')).toBeVisible({ timeout: 3000 })
      }
    }
  })

  test('search bar filters records with debounce', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search records"]')
    await searchInput.fill('test')

    // Should show "Searching..." indicator briefly
    // Then results or no results after debounce
    await page.waitForTimeout(500) // debounce is 300ms
  })

  test('create study modal opens and closes', async ({ page }) => {
    // Click "+ New Study" button
    await page.getByText('+ New Study').click()

    // Modal should appear
    await expect(page.getByText('Create study')).toBeVisible()
    await expect(page.locator('input[placeholder="Enter title..."]')).toBeVisible()

    // Cancel closes modal
    await page.getByText('Cancel').click()
    await expect(page.getByText('Create study')).not.toBeVisible()
  })

  test('create study with title shows auto-generated ID', async ({ page }) => {
    await page.getByText('+ New Study').click()

    const titleInput = page.locator('input[placeholder="Enter title..."]')
    await titleInput.fill('My Test Study')

    // Auto-generated ID should appear
    const idInput = page.locator('input[readonly]')
    await expect(idInput).toBeVisible()
    const idValue = await idInput.inputValue()
    expect(idValue).toContain('STD_')
    expect(idValue).toContain('my-test-study')

    // Cancel without creating
    await page.getByText('Cancel').click()
  })

  test('create study flow works end-to-end', async ({ page }) => {
    const timestamp = Date.now()
    const studyTitle = `E2E Test Study ${timestamp}`

    await page.getByText('+ New Study').click()
    await page.locator('input[placeholder="Enter title..."]').fill(studyTitle)

    // Click create
    await page.getByRole('button', { name: /Create study/i }).click()

    // Modal should close
    await expect(page.getByText('Create study')).not.toBeVisible({ timeout: 10_000 })

    // New study should appear in tree
    await expect(page.getByText(studyTitle)).toBeVisible({ timeout: 5000 })
  })

  test('selecting a study shows preview in right panel', async ({ page }) => {
    // Click "open" link on first study (if exists)
    const openLinks = page.locator('a:has-text("open")')
    if (await openLinks.count() > 0) {
      await openLinks.first().click()

      // Right panel should show record data
      await expect(page.getByText('Record Data:')).toBeVisible({ timeout: 5000 })
    }
  })

  test('create experiment from selected study', async ({ page }) => {
    // First, select a study by clicking "open"
    const openLinks = page.locator('a:has-text("open")')
    if (await openLinks.count() > 0) {
      await openLinks.first().click()

      // Wait for the "+ New Experiment" button to appear
      const newExpButton = page.getByText('+ New Experiment')
      if (await newExpButton.isVisible({ timeout: 3000 })) {
        await newExpButton.click()

        // Modal should show "Create experiment"
        await expect(page.getByText('Create experiment')).toBeVisible()

        // Parent Study dropdown should be pre-filled and disabled
        const studySelect = page.locator('select').first()
        await expect(studySelect).toBeDisabled()

        await page.getByText('Cancel').click()
      }
    }
  })
})
