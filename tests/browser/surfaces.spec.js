import { expect, test } from '@playwright/test'

const LOWER = 'section:Lower shelf'
const cat = (page) => page.locator('[data-critters-creature="cat"]')
const describe = (page) => page.evaluate(() => window.Critters.runtime.environment.describe())

async function visit(page) {
    await page.goto('/admin/surfaces')
    await expect(cat(page)).toHaveCount(1)
}

/** Puts the cat on a ledge and keeps it there (asleep) so the test controls movement. */
const placeOn = (page, id, offset, action = 'sleep') =>
    page.evaluate(
        ([id, offset, action]) => {
            const { creature } = window.Critters.runtime
            const env = creature.environment

            env.invalidate({ rediscover: true })
            env.ensureMeasured(creature.size)
            creature.placement = env.anchor({ surfaceId: id, offset, hop: null }, env.ledge(id), creature.size)
            creature.behavior.transition(action, { duration: 600 })
        },
        [id, offset, action],
    )

const ledgeTop = async (page, id) => (await describe(page)).ledges.find((l) => l.id === id)?.top

async function expectStandingOn(page, id) {
    await expect(cat(page)).toHaveAttribute('data-critters-surface-id', id)

    const box = await cat(page).boundingBox()

    expect(Math.round(box.y + box.height)).toBe(Math.round(await ledgeTop(page, id)))
}

const rectsIntersect = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

test('discovers markers and Filament sections, never interactive elements', async ({ page }) => {
    await visit(page)

    const { ledges, rejected } = await describe(page)

    expect(ledges.map((l) => l.id)).toEqual(['floor', 'upper-shelf', 'removable-shelf', LOWER])
    expect(ledges.find((l) => l.id === LOWER).source).toBe('adapter')
    expect(rejected).toContainEqual({ id: 'not-a-surface', reason: 'interactive' })
})

test('the cat hops from the floor onto a section and stands on it', async ({ page }) => {
    await visit(page)
    await placeOn(page, 'floor', 600)

    const started = await page.evaluate((id) => window.Critters.runtime.creature.hopTo(id), LOWER)

    expect(started).toBe(true)
    await expect(cat(page)).toHaveAttribute('data-critters-action', 'hop')
    await expectStandingOn(page, LOWER)
})

test('the cat rides its ledge while scrolling and falls when it scrolls under the top bar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 })
    await visit(page)
    await placeOn(page, 'upper-shelf', 600)
    await expectStandingOn(page, 'upper-shelf')

    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(200)
    await expectStandingOn(page, 'upper-shelf')

    await page.mouse.wheel(0, 150)
    await expect(cat(page)).not.toHaveAttribute('data-critters-surface-id', 'upper-shelf')
    await expect(cat(page)).toHaveAttribute('data-critters-surface-id', /.+/)

    const topbar = await page.locator('.fi-topbar').boundingBox()
    const box = await cat(page).boundingBox()

    expect(box.y).toBeGreaterThanOrEqual(topbar.y + topbar.height)
})

test('removing the ledge under the cat makes it fall to the next one, not teleport', async ({ page }) => {
    await visit(page)
    await page.evaluate(() => (window.__overlay = document.querySelector('[data-critters-overlay]')))
    await placeOn(page, 'removable-shelf', 700)
    await expectStandingOn(page, 'removable-shelf')

    await page.getByRole('button', { name: 'Toggle removable shelf' }).click()

    await expect(cat(page)).toHaveAttribute('data-critters-action', 'fall')
    await expect(cat(page)).toHaveAttribute('data-critters-surface-id', /.+/, { timeout: 3000 })

    const id = await cat(page).getAttribute('data-critters-surface-id')

    expect(id).not.toBe('removable-shelf')
    await expectStandingOn(page, id)
    expect(await page.evaluate(() => window.__overlay === document.querySelector('[data-critters-overlay]'))).toBe(true)
})

test('a hop whose target disappears is cancelled into a fall', async ({ page }) => {
    await visit(page)
    await placeOn(page, 'upper-shelf', 700)

    expect(await page.evaluate(() => window.Critters.runtime.creature.hopTo('removable-shelf'))).toBe(true)
    // Freeze the cat mid-flight (the hop lasts ~0.6s), below the shelf it left.
    await page.waitForTimeout(250)
    await page.evaluate(() => window.Critters.runtime.pause('test'))
    expect(await page.evaluate(() => window.Critters.runtime.creature.placement.hop?.surfaceId)).toBe('removable-shelf')
    await page.getByRole('button', { name: 'Toggle removable shelf' }).click()
    await expect(page.getByText('Removed and restored by a Livewire action.')).toHaveCount(0)

    const actions = []
    await page.exposeFunction('recordAction', (a) => actions.push(a))
    await page.evaluate(() => {
        const el = document.querySelector('[data-critters-creature]')
        new MutationObserver(() => window.recordAction(el.dataset.crittersAction)).observe(el, { attributeFilter: ['data-critters-action'] })
        window.Critters.runtime.resume('test')
    })

    await expect(cat(page)).toHaveAttribute('data-critters-surface-id', LOWER, { timeout: 3000 })
    expect(actions[0]).toBe('fall')
    await expectStandingOn(page, LOWER)
})

test('collapsing the sidebar moves the cat with its ledge', async ({ page }) => {
    await visit(page)
    await placeOn(page, 'upper-shelf', 400)

    const before = (await describe(page)).ledges.find((l) => l.id === 'upper-shelf')

    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect.poll(async () => (await describe(page)).ledges.find((l) => l.id === 'upper-shelf').left).toBeLessThan(before.left - 50)
    await page.waitForTimeout(600)

    const after = (await describe(page)).ledges.find((l) => l.id === 'upper-shelf')
    const box = await cat(page).boundingBox()

    expect(box.x - after.left).toBeCloseTo(400, 0)
    await expectStandingOn(page, 'upper-shelf')
})

test('the cat walks aside instead of resting in front of a button', async ({ page }) => {
    await visit(page)

    const save = await page.getByRole('button', { name: 'Save' }).boundingBox()

    await page.evaluate(() => window.Critters.runtime.pause('test'))
    await placeOn(page, 'upper-shelf', 0, 'idle')

    const start = await page.evaluate(() => window.Critters.runtime.creature.position)

    expect(rectsIntersect({ ...start, width: 64, height: 64 }, save)).toBe(true)

    await page.evaluate(() => window.Critters.runtime.resume('test'))

    // The cat may already show `idle` from page load, so wait for both conditions together.
    await expect
        .poll(
            async () => ({
                action: await cat(page).getAttribute('data-critters-action'),
                covering: rectsIntersect(await cat(page).boundingBox(), save),
            }),
            { timeout: 5000 },
        )
        .toEqual({ action: 'idle', covering: false })
})

test('a Livewire form submission keeps the runtime and rediscovers surfaces', async ({ page }) => {
    await visit(page)
    await page.evaluate(() => (window.__overlay = document.querySelector('[data-critters-overlay]')))
    const discoveries = (await describe(page)).discoveries

    await page.getByLabel('Name').fill('Whiskers')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    const state = await page.evaluate(() => ({
        sameOverlay: window.__overlay === document.querySelector('[data-critters-overlay]'),
        overlays: document.querySelectorAll('[data-critters-overlay]').length,
        mounts: window.Critters.runtime.stats.mounts,
    }))

    expect(state).toEqual({ sameOverlay: true, overlays: 1, mounts: 1 })
    expect((await describe(page)).discoveries).toBeGreaterThan(discoveries)
    expect((await describe(page)).ledges.map((l) => l.id)).toContain('upper-shelf')
})

test('back and forward navigation keep a single runtime', async ({ page }) => {
    await page.goto('/admin')
    await page.getByRole('link', { name: 'Surfaces' }).first().click()
    await page.waitForURL('**/admin/surfaces')
    await page.goBack()
    await page.waitForURL(/\/admin$/)
    await page.goForward()
    await page.waitForURL('**/admin/surfaces')
    await expect.poll(async () => (await describe(page)).ledges.length).toBe(4)

    const state = await page.evaluate(() => ({
        overlays: document.querySelectorAll('[data-critters-overlay]').length,
        creatures: document.querySelectorAll('[data-critters-creature]').length,
        mounts: window.Critters.runtime.stats.mounts,
    }))

    expect(state).toEqual({ overlays: 1, creatures: 1, mounts: 1 })
    // Livewire restores back/forward pages from an HTML snapshot that includes the overlay.
    expect(await page.evaluate(() => window.Critters.runtime.stats.strays)).toBeGreaterThan(0)
})
