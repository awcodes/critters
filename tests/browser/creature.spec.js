import { expect, test } from '@playwright/test'

const creature = (page) => page.locator('[data-critters-creature="cat"]')
const runtime = (page, fn, arg) => page.evaluate(fn, arg)

async function visit(page, path = '/admin') {
    await page.goto(path)
    await expect(creature(page)).toHaveCount(1)
}

const force = (page, action) =>
    runtime(page, (a) => window.Critters.runtime.creature.behavior.transition(a, { duration: 60 }), action)

const frame = async (page) => Number(await creature(page).getAttribute('data-critters-frame'))

test('one cat stands on the viewport floor', async ({ page }) => {
    await visit(page)

    const box = await creature(page).boundingBox()
    const viewport = page.viewportSize()

    expect(box.width).toBe(64)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(Math.round(box.y + box.height)).toBe(viewport.height - 4)
})

test('the cat walks, idles and sleeps with the matching sprite frames', async ({ page }) => {
    await visit(page)

    await force(page, 'walk')
    const start = (await creature(page).boundingBox()).x
    const walkFrames = new Set()

    for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(150)
        walkFrames.add(await frame(page))
    }

    await expect(creature(page)).toHaveAttribute('data-critters-action', 'walk')
    expect((await creature(page).boundingBox()).x).not.toBe(start)
    expect([...walkFrames].every((f) => f >= 0 && f <= 3)).toBe(true)
    expect(walkFrames.size).toBeGreaterThan(1)

    await force(page, 'idle')
    const idleAt = (await creature(page).boundingBox()).x
    await page.waitForTimeout(300)

    await expect(creature(page)).toHaveAttribute('data-critters-action', 'idle')
    expect(await frame(page)).toBeGreaterThanOrEqual(4)
    expect(await frame(page)).toBeLessThanOrEqual(6)
    expect((await creature(page).boundingBox()).x).toBe(idleAt)

    await force(page, 'sleep')
    await page.waitForTimeout(100)

    await expect(creature(page)).toHaveAttribute('data-critters-action', 'sleep')
    expect(await frame(page)).toBeGreaterThanOrEqual(7)
})

test('the cat turns around at the viewport edge instead of leaving it', async ({ page }) => {
    await visit(page)

    await runtime(page, () => {
        const { creature } = window.Critters.runtime
        creature.position = { ...creature.position, x: document.documentElement.clientWidth - 70 }
        creature.behavior.transition('walk', { duration: 60 })
        creature.behavior.direction = 1
    })
    await page.waitForTimeout(800)

    const box = await creature(page).boundingBox()
    const direction = await runtime(page, () => window.Critters.runtime.creature.intent.direction)

    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)
    expect(direction).toBe(-1)
})

test('the cat stays on screen when the viewport shrinks', async ({ page }) => {
    await visit(page)
    await runtime(page, () => {
        const { creature } = window.Critters.runtime
        creature.position = { ...creature.position, x: document.documentElement.clientWidth - 64 }
    })

    await page.setViewportSize({ width: 700, height: 500 })
    await page.waitForTimeout(100)

    const box = await creature(page).boundingBox()

    expect(box.x + box.width).toBeLessThanOrEqual(700)
    expect(Math.round(box.y + box.height)).toBe(496)
})

test('a hidden tab stops the animation loop', async ({ page }) => {
    await visit(page)
    await force(page, 'walk')

    await runtime(page, () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
    })

    const ticks = await runtime(page, () => window.Critters.runtime.scheduler.ticks)
    await page.waitForTimeout(300)

    expect(await runtime(page, () => window.Critters.runtime.state)).toBe('paused')
    expect(await runtime(page, () => window.Critters.runtime.scheduler.ticks)).toBe(ticks)
})

test('reduced motion shows a still, sleeping cat with no loop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visit(page)

    const ticks = await runtime(page, () => window.Critters.runtime.scheduler.ticks)
    const box = await creature(page).boundingBox()
    await page.waitForTimeout(400)

    expect(await runtime(page, () => window.Critters.runtime.state)).toBe('static')
    await expect(creature(page)).toHaveAttribute('data-critters-action', 'sleep')
    expect(await runtime(page, () => window.Critters.runtime.scheduler.ticks)).toBe(ticks)
    expect(await creature(page).boundingBox()).toEqual(box)
})

test('SPA navigation never doubles the animation loop', async ({ page }) => {
    await visit(page)

    for (let i = 0; i < 3; i++) {
        await page.getByRole('link', { name: 'Second page' }).first().click()
        await page.waitForURL('**/admin/second')
        await page.getByRole('link', { name: 'Dashboard' }).first().click()
        await page.waitForURL(/\/admin$/)
    }

    // Count real animation frames alongside the scheduler: one loop means one tick per frame.
    const { frames, ticks } = await runtime(
        page,
        () =>
            new Promise((resolve) => {
                const startTicks = window.Critters.runtime.scheduler.ticks
                let frames = 0
                const count = () => {
                    frames++
                    frames < 60 ? requestAnimationFrame(count) : resolve({ frames, ticks: window.Critters.runtime.scheduler.ticks - startTicks })
                }
                requestAnimationFrame(count)
            }),
    )

    expect(Math.abs(ticks - frames)).toBeLessThanOrEqual(2)
    await expect(creature(page)).toHaveCount(1)
})
