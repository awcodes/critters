import { expect, test } from '@playwright/test'

const fish = (page) => page.locator('[data-critters-creature="fish"]')
const tank = (page) => page.locator('[data-critters-region="tank"]')
const rt = (page, fn, arg) => page.evaluate(fn, arg)

async function visitAquarium(page) {
    await page.goto('/aquarium')
    await expect(fish(page)).toHaveCount(1)
    await expect(page.locator('.fi-main-ctn')).toHaveCSS('opacity', '1')
    await expect(fish(page)).toBeVisible()
}

const inside = (box, region, tolerance = 1) =>
    box.x >= region.x - tolerance &&
    box.y >= region.y - tolerance &&
    box.x + box.width <= region.x + region.width + tolerance &&
    box.y + box.height <= region.y + region.height + tolerance

test('the fish swims in two dimensions and never leaves its tank', async ({ page }) => {
    await visitAquarium(page)
    await rt(page, () => window.Critters.runtime.creature.behavior.transition('swim', { duration: 60 }))

    const positions = []

    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(150)
        const box = await fish(page).boundingBox()

        positions.push(box)
        expect(inside(box, await tank(page).boundingBox())).toBe(true)
    }

    const xs = new Set(positions.map((p) => Math.round(p.x)))
    const ys = new Set(positions.map((p) => Math.round(p.y)))

    expect(xs.size).toBeGreaterThan(3)
    expect(ys.size).toBeGreaterThan(1)
})

test('ambient mode ignores panel surfaces', async ({ page }) => {
    await visitAquarium(page)

    const described = await rt(page, () => window.Critters.runtime.environment.describe())

    expect(described.ledges).toEqual([])
    expect(described.region).not.toBeNull()
    await expect(fish(page)).not.toHaveAttribute('data-critters-surface-id', /section/)
})

test('the fish moves with its tank when the page scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 520 })
    await visitAquarium(page)
    await rt(page, () => window.Critters.runtime.creature.behavior.transition('idle', { duration: 60 }))

    const before = await fish(page).boundingBox()

    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(300)

    const after = await fish(page).boundingBox()

    expect(Math.round(before.y - after.y)).toBe(120)
    expect(inside(after, await tank(page).boundingBox())).toBe(true)
})

test('a fish dropped outside the tank glides back in', async ({ page }) => {
    await visitAquarium(page)
    await rt(page, () => {
        const { creature } = window.Critters.runtime
        creature.intent = creature.behavior.transition('sleep', { duration: 60 })
        creature.render(1)
    })

    const hit = page.locator('[data-critters-hit="fish"]')

    await expect(hit).toHaveAttribute('data-critters-hit-enabled', 'true')

    const box = await hit.boundingBox()
    const region = await tank(page).boundingBox()

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(region.x + region.width / 2, region.y + region.height + 150, { steps: 6 })
    await expect(fish(page)).toHaveAttribute('data-critters-action', 'carried')
    expect(inside(await fish(page).boundingBox(), region)).toBe(false)

    await page.mouse.up()

    await expect.poll(async () => inside(await fish(page).boundingBox(), await tank(page).boundingBox()), { timeout: 3000 }).toBe(true)
})

test('the same runtime switches from the cat to the fish across panels', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('[data-critters-creature="cat"]')).toHaveCount(1)
    await rt(page, () => (window.__runtime = window.Critters.runtime))

    await rt(page, () => window.Livewire.navigate('/aquarium'))
    await page.waitForURL(/\/aquarium$/)
    await expect(fish(page)).toHaveCount(1)

    expect(
        await rt(page, () => ({
            same: window.__runtime === window.Critters.runtime,
            overlays: document.querySelectorAll('[data-critters-overlay]').length,
            cats: document.querySelectorAll('[data-critters-creature="cat"]').length,
            reconfigurations: window.Critters.runtime.stats.reconfigurations,
        })),
    ).toEqual({ same: true, overlays: 1, cats: 0, reconfigurations: 1 })
})

test('a custom creature and behavior register from application code', async ({ page }) => {
    const sprite = []

    page.on('response', (r) => r.url().includes('/workbench/critters/tabby.png') && sprite.push(r.status()))
    await page.goto('/custom')

    const tabby = page.locator('[data-critters-creature="tabby"]')

    await expect(tabby).toHaveCount(1)
    await expect.poll(() => sprite).toContain(200)

    // The extension script loads before Critters, so it used the registration queue.
    const order = await rt(page, () =>
        [...document.querySelectorAll('script[src]')].map((s) => s.src).filter((src) => src.includes('critters')).map((src) => src.split('/').pop().split('?')[0]),
    )

    expect(order).toEqual(['critters-extensions.js', 'critters.js'])

    // Zoomies: fast bursts and never asleep.
    await rt(page, () => window.Critters.runtime.creature.behavior.transition('walk', { duration: 1 }))
    const start = (await tabby.boundingBox()).x
    await page.waitForTimeout(400)

    expect(Math.abs((await tabby.boundingBox()).x - start)).toBeGreaterThan(20)

    const actions = new Set()

    for (let i = 0; i < 15; i++) {
        actions.add(await tabby.getAttribute('data-critters-action'))
        await page.waitForTimeout(200)
    }

    expect(actions.has('sleep')).toBe(false)
})
