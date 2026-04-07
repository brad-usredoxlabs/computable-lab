import { test, expect } from '@playwright/test'

test.describe('Schema List', () => {
  test('loads and displays schemas', async ({ page }) => {
    await page.goto('/schemas')

    // Wait for loading to finish
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    // Should show heading
    await expect(page.locator('h1', { hasText: 'Schemas' })).toBeVisible()

    // Should show schema items or empty state
    const schemaItems = page.locator('.schema-item')
    const emptyState = page.locator('.empty-state')

    const hasSchemas = await schemaItems.count() > 0
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    expect(hasSchemas || hasEmptyState).toBe(true)
  })

  test('schema items show title and ID', async ({ page }) => {
    await page.goto('/schemas')
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstSchema = page.locator('.schema-item').first()
    if (await firstSchema.isVisible()) {
      // Should have a title
      await expect(firstSchema.locator('.schema-title')).toBeVisible()
      // Should have a schema ID
      await expect(firstSchema.locator('.schema-id')).toBeVisible()
    }
  })

  test('clicking a schema navigates to records list', async ({ page }) => {
    await page.goto('/schemas')
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstSchemaLink = page.locator('.schema-link').first()
    if (await firstSchemaLink.isVisible()) {
      await firstSchemaLink.click()
      await expect(page).toHaveURL(/\/schemas\/.*\/records/)
    }
  })
})

test.describe('Record List', () => {
  test('navigating from schema shows records', async ({ page }) => {
    await page.goto('/schemas')
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstSchemaLink = page.locator('.schema-link').first()
    if (await firstSchemaLink.isVisible()) {
      await firstSchemaLink.click()
      await expect(page).toHaveURL(/\/schemas\/.*\/records/)

      // Wait for records to load
      await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

      // Should have breadcrumb back to schemas
      await expect(page.locator('.breadcrumb a', { hasText: 'Schemas' })).toBeVisible()

      // Should show "New Record" button or record items or empty state
      const newRecordBtn = page.locator('.btn-primary', { hasText: 'New Record' })
      const recordItems = page.locator('.record-item')
      const emptyState = page.locator('.empty-state')

      const hasContent = (await newRecordBtn.isVisible().catch(() => false)) ||
                         (await recordItems.count() > 0) ||
                         (await emptyState.isVisible().catch(() => false))
      expect(hasContent).toBe(true)
    }
  })

  test('record items show ID and navigate to viewer', async ({ page }) => {
    await page.goto('/schemas')
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstSchemaLink = page.locator('.schema-link').first()
    if (await firstSchemaLink.isVisible()) {
      await firstSchemaLink.click()
      await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

      const firstRecord = page.locator('.record-link').first()
      if (await firstRecord.isVisible()) {
        await firstRecord.click()
        await expect(page).toHaveURL(/\/records\//)
      }
    }
  })
})

test.describe('Record Viewer', () => {
  test('displays record details with metadata', async ({ page }) => {
    // Navigate to a record through the schema list flow
    await page.goto('/schemas')
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstSchemaLink = page.locator('.schema-link').first()
    if (!(await firstSchemaLink.isVisible())) {
      test.skip()
      return
    }

    await firstSchemaLink.click()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstRecord = page.locator('.record-link').first()
    if (!(await firstRecord.isVisible())) {
      test.skip()
      return
    }

    await firstRecord.click()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    // Should show Record Detail heading
    await expect(page.locator('h1', { hasText: 'Record Detail' })).toBeVisible()

    // Should show metadata section
    await expect(page.locator('h2', { hasText: 'Metadata' })).toBeVisible()

    // Should show Payload section
    await expect(page.locator('h2', { hasText: 'Payload' })).toBeVisible()

    // Should have Edit button
    await expect(page.locator('.btn-primary', { hasText: 'Edit' })).toBeVisible()

    // Should have breadcrumb navigation
    await expect(page.locator('.breadcrumb')).toBeVisible()
  })

  test('edit button navigates to editor', async ({ page }) => {
    await page.goto('/schemas')
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstSchemaLink = page.locator('.schema-link').first()
    if (!(await firstSchemaLink.isVisible())) {
      test.skip()
      return
    }

    await firstSchemaLink.click()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstRecord = page.locator('.record-link').first()
    if (!(await firstRecord.isVisible())) {
      test.skip()
      return
    }

    await firstRecord.click()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    // Click Edit
    await page.locator('.btn-primary', { hasText: 'Edit' }).click()
    await expect(page).toHaveURL(/\/records\/.*\/edit/)
  })
})

test.describe('Record Editor', () => {
  test('edit mode loads with CodeMirror and controls', async ({ page }) => {
    // Navigate to an editable record
    await page.goto('/schemas')
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstSchemaLink = page.locator('.schema-link').first()
    if (!(await firstSchemaLink.isVisible())) {
      test.skip()
      return
    }

    await firstSchemaLink.click()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstRecord = page.locator('.record-link').first()
    if (!(await firstRecord.isVisible())) {
      test.skip()
      return
    }

    await firstRecord.click()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    await page.locator('.btn-primary', { hasText: 'Edit' }).click()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    // Should show "Edit Record" heading
    await expect(page.locator('h1', { hasText: 'Edit Record' })).toBeVisible()

    // Should have Save and Cancel buttons
    await expect(page.locator('.btn-primary', { hasText: 'Save' })).toBeVisible()
    await expect(page.locator('.btn-secondary', { hasText: 'Cancel' })).toBeVisible()

    // Should have either schema form mode or YAML CodeMirror mode
    const hasCodeMirror = await page.locator('.codemirror-wrapper .cm-editor').isVisible().catch(() => false)
    const hasSchemaForm = await page.locator('.schema-record-form').isVisible().catch(() => false)
    expect(hasCodeMirror || hasSchemaForm).toBe(true)

    // Should have Diagnostics section
    await expect(page.locator('h2', { hasText: 'Diagnostics' })).toBeVisible()
  })

  test('cancel button returns to record viewer', async ({ page }) => {
    await page.goto('/schemas')
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstSchemaLink = page.locator('.schema-link').first()
    if (!(await firstSchemaLink.isVisible())) {
      test.skip()
      return
    }

    await firstSchemaLink.click()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstRecord = page.locator('.record-link').first()
    if (!(await firstRecord.isVisible())) {
      test.skip()
      return
    }

    await firstRecord.click()
    const viewerUrl = page.url()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    await page.locator('.btn-primary', { hasText: 'Edit' }).click()
    await expect(page).toHaveURL(/\/edit/)

    // Cancel should go back to viewer
    await page.locator('.btn-secondary', { hasText: 'Cancel' }).click()
    await expect(page).toHaveURL(viewerUrl)
  })

  test('new record page requires schemaId', async ({ page }) => {
    // Going to /new without schemaId should show error
    await page.goto('/new')

    await expect(page.getByText('Missing schema')).toBeVisible()
    await expect(page.getByText('Browse Schemas')).toBeVisible()
  })

  test('new record page loads with schema template', async ({ page }) => {
    await page.goto('/schemas')
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    const firstSchemaLink = page.locator('.schema-link').first()
    if (!(await firstSchemaLink.isVisible())) {
      test.skip()
      return
    }

    await firstSchemaLink.click()
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    // Click "New Record" button
    const newRecordBtn = page.locator('.btn-primary', { hasText: 'New Record' })
    if (!(await newRecordBtn.isVisible())) {
      test.skip()
      return
    }

    await newRecordBtn.click()
    await expect(page).toHaveURL(/\/new\?schemaId=/)
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 10_000 })

    // Should show "New Record" heading
    await expect(page.locator('h1', { hasText: 'New Record' })).toBeVisible()

    // Should have CodeMirror editor with content
    await expect(page.locator('.codemirror-wrapper .cm-editor')).toBeVisible()
  })
})
