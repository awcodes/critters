import { expect, test } from '@playwright/test'

const creature = (page, name) => page.locator(`[data-critters-creature="${name}"]`)
const picker = (page) => page.getByRole('dialog', { name: 'Choose your critter' })

async function openPicker(page) {
    await page.locator('.fi-user-menu-trigger').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Change critter' }).focus()
    await page.keyboard.press('Enter')
    await expect(picker(page)).toBeVisible()
}

test('a person switches critters from the user menu by keyboard', async ({ page }) => {
    const sprites = []

    page.on('response', (r) => r.url().includes('critters-creature-sparky.css') && sprites.push(r.status()))
    await page.goto('/admin')
    await expect(creature(page, 'cat')).toHaveCount(1)

    await openPicker(page)

    const options = picker(page).locator('[data-critters-choice]')

    await expect(options).toHaveText(['Cat', 'Dog', 'Lizard', 'Sparky', 'Atlas', 'Barney'])

    // Centred on the page (Filament's CSS reset removes the browser's default centring).
    const box = await picker(page).boundingBox()
    const viewport = page.viewportSize()

    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2)
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2)
    await expect(picker(page).getByRole('button', { name: 'Cat' })).toHaveAttribute('aria-pressed', 'true')
    await expect(picker(page).getByRole('button', { name: 'Cat' })).toBeFocused()

    // Previews use the real sprites.
    expect(await picker(page).locator('[data-critters-choice="sparky"] .critters-picker-sprite').evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/^url\("data:image\/png/)

    await picker(page).getByRole('button', { name: 'Sparky' }).focus()
    await page.keyboard.press('Enter')

    await expect(picker(page)).toHaveCount(0)
    await expect(creature(page, 'sparky')).toHaveCount(1)
    await expect(creature(page, 'cat')).toHaveCount(0)
    await expect(page.locator('.critters-status')).toHaveText('Now showing Sparky.')
    expect(sprites).toContain(200)
    expect(await page.evaluate(() => localStorage.getItem('critters:admin:creature'))).toBe('sparky')
})

test('the choice survives reloads and SPA navigation, and stays per panel', async ({ page }) => {
    await page.goto('/admin')
    await page.evaluate(() => window.Critters.setCreature('barney'))
    await expect(creature(page, 'barney')).toHaveCount(1)

    await page.reload()
    await expect(creature(page, 'barney')).toHaveCount(1)
    await expect(page.locator('link[data-critters-sprite="barney"]')).toHaveCount(1)

    await page.getByRole('link', { name: 'Second page' }).first().click()
    await page.waitForURL('**/admin/second')
    await expect(creature(page, 'barney')).toHaveCount(1)
    expect(await page.evaluate(() => document.querySelectorAll('[data-critters-overlay]').length)).toBe(1)

    // Another panel keeps its own (default) critter.
    await page.goto('/classic')
    await expect(creature(page, 'cat')).toHaveCount(1)
})

test('closing the picker changes nothing', async ({ page }) => {
    await page.goto('/admin')
    await expect(creature(page, 'cat')).toHaveCount(1)
    await openPicker(page)
    await page.keyboard.press('Escape')

    await expect(picker(page)).toHaveCount(0)
    await expect(creature(page, 'cat')).toHaveCount(1)
    expect(await page.evaluate(() => localStorage.getItem('critters:admin:creature'))).toBeNull()
})

test('ambient panels offer no choice', async ({ page }) => {
    await page.goto('/aquarium')
    await expect(creature(page, 'fish')).toHaveCount(1)
    await page.locator('.fi-user-menu-trigger').click()
    await expect(page.getByRole('menuitem', { name: 'Hide or show critters' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Change critter' })).toHaveCount(0)
})
