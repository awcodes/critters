import { test as setup } from '@playwright/test'

export const STORAGE_STATE = 'tests/browser/.auth/user.json'

// Filament rate-limits logins to five a minute, so sign in once and share the session.
setup('authenticate', async ({ page }) => {
    await page.goto('/admin/login')
    await page.waitForFunction(() => window.Livewire?.all().length > 0)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/admin$/)
    await page.context().storageState({ path: STORAGE_STATE })
})
