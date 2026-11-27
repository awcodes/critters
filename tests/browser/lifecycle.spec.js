import { expect, test } from '@playwright/test'

async function visit(page, panel) {
    await page.goto(`/${panel}`)
}

const snapshot = (page) =>
    page.evaluate(() => ({
        overlays: document.querySelectorAll('[data-critters-overlay]').length,
        configs: document.querySelectorAll('script[data-critters-config]').length,
        state: window.Critters?.runtime.state ?? null,
        stats: window.Critters?.runtime.stats ?? null,
        marker: window.__crittersMarker ?? null,
    }))

test('auth pages do not render critters', async ({ browser }) => {
    const page = await browser.newPage({ storageState: { cookies: [], origins: [] } })

    await page.goto('/admin/login')

    expect((await snapshot(page)).configs).toBe(0)
    expect((await snapshot(page)).overlays).toBe(0)
})

test('initial load produces exactly one runtime and one overlay', async ({ page }) => {
    await visit(page, 'admin')

    const state = await snapshot(page)

    expect(state.overlays).toBe(1)
    expect(state.configs).toBe(1)
    expect(state.state).toBe('running')
    expect(state.stats.mounts).toBe(1)
})

test('SPA navigation keeps one runtime and re-attaches the overlay', async ({ page }) => {
    await visit(page, 'admin')
    await page.evaluate(() => (window.__crittersMarker = window.Critters.runtime))

    for (let i = 0; i < 3; i++) {
        await page.getByRole('link', { name: 'Second page' }).first().click()
        await page.waitForURL('**/admin/second')
        await page.getByRole('link', { name: 'Dashboard' }).first().click()
        await page.waitForURL(/\/admin$/)
    }

    const state = await snapshot(page)
    const sameRuntime = await page.evaluate(() => window.__crittersMarker === window.Critters.runtime)

    expect(sameRuntime).toBe(true)
    expect(state.overlays).toBe(1)
    expect(state.state).toBe('running')
    expect(state.stats.mounts).toBe(1)
    expect(state.stats.reattachments).toBe(6)
})

test('classic panel mounts fresh on every full page load', async ({ page }) => {
    await visit(page, 'classic')
    await page.getByRole('link', { name: 'Second page' }).first().click()
    await page.waitForURL('**/classic/second')

    const state = await snapshot(page)

    expect(state.overlays).toBe(1)
    expect(state.stats.mounts).toBe(1)
})

test('navigating to a panel without critters destroys the runtime, returning remounts it', async ({ page }) => {
    await visit(page, 'admin')

    await page.evaluate(() => window.Livewire.navigate('/plain'))
    await page.waitForURL(/\/plain$/)

    let state = await snapshot(page)

    expect(state.overlays).toBe(0)
    expect(state.configs).toBe(0)
    expect(state.state).toBe('idle')
    expect(state.stats.destroys).toBe(1)

    await page.evaluate(() => window.Livewire.navigate('/admin'))
    await page.waitForURL(/\/admin$/)

    state = await snapshot(page)

    expect(state.overlays).toBe(1)
    expect(state.state).toBe('running')
    expect(state.stats.mounts).toBe(2)
})

test('the script asset is only evaluated once across SPA navigations', async ({ page }) => {
    const requests = []

    await visit(page, 'admin')
    page.on('request', (r) => r.url().includes('/js/awcodes/critters/critters.js') && requests.push(r.url()))
    await page.getByRole('link', { name: 'Second page' }).first().click()
    await page.waitForURL('**/admin/second')

    const scripts = await page.evaluate(
        () => document.querySelectorAll('script[src*="critters.js"][data-navigate-once]').length,
    )

    expect(scripts).toBe(1)
    expect(requests).toEqual([])
})

test('each panel downloads only the sprite of its own creature', async ({ page }) => {
    const sheets = (path) =>
        page.goto(path).then(() =>
            page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).filter((h) => h.includes('critters-creature')).map((h) => h.split('/').pop().split('?')[0])),
        )

    expect(await sheets('/admin')).toEqual(['critters-creature-cat.css'])
    expect(await sheets('/aquarium')).toEqual(['critters-creature-fish.css'])
    expect(await sheets('/custom')).toEqual([])
    expect(await sheets('/plain')).toEqual([])
})
