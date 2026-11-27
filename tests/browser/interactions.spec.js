import { expect, test } from '@playwright/test'

const cat = (page) => page.locator('[data-critters-creature="cat"]')
const hit = (page) => page.locator('[data-critters-hit="cat"]')
const rt = (page, fn, arg) => page.evaluate(fn, arg)
const LOWER = 'section:Lower shelf'

async function visit(page, path = '/admin/surfaces') {
    await page.goto(path)
    await expect(cat(page)).toHaveCount(1)
    // Filament fades the main container in; surfaces are invisible until it settles.
    await expect(page.locator('.fi-main-ctn')).toHaveCSS('opacity', '1')
}

/** Parks the cat (asleep, far from controls) on a ledge so tests control movement. */
const placeOn = (page, id, offset, action = 'sleep') =>
    rt(
        page,
        ([id, offset, action]) => {
            const { creature } = window.Critters.runtime
            const env = creature.environment

            env.invalidate({ rediscover: true })
            env.ensureMeasured(creature.size)
            creature.placement = env.anchor({ surfaceId: id, offset, hop: null }, env.ledge(id), creature.size)
            creature.intent = creature.behavior.transition(action, { duration: 600 })
            // Draw now: the renderer otherwise catches up on the next frame, after the
            // test has already measured the hit target.
            creature.action = action
            creature.render(creature.intent.direction)
        },
        [id, offset, action],
    )

async function hitCenter(page) {
    await expect(hit(page)).toHaveAttribute('data-critters-hit-enabled', 'true')
    const box = await hit(page).boundingBox()

    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const interactionState = (page) => rt(page, () => window.Critters.runtime.interactions.state)
const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

test('clicking the cat pets it and the click never reaches the page', async ({ page }) => {
    await visit(page)
    await placeOn(page, 'floor', 700)
    await rt(page, () => {
        window.__pageClicks = 0
        document.addEventListener('click', () => window.__pageClicks++)
    })

    const { x, y } = await hitCenter(page)

    await page.mouse.click(x, y)

    await expect(cat(page)).toHaveAttribute('data-critters-action', 'pet')
    await expect(page.locator('.critters-heart')).toHaveCount(1)
    await expect(page.locator('.critters-status')).toHaveText('You petted the cat.')
    expect(await rt(page, () => window.__pageClicks)).toBe(0)
})

test('dragging carries the cat and releasing drops it onto a ledge where it stays', async ({ page }) => {
    await visit(page)
    await placeOn(page, 'floor', 700)

    const { x, y } = await hitCenter(page)
    const before = await cat(page).boundingBox()

    await page.mouse.move(x, y)
    await page.mouse.down()
    // Drop to the right of the action buttons so the landing spot is safe to rest on.
    await page.mouse.move(x + 300, y - 250, { steps: 8 })

    await expect(cat(page)).toHaveAttribute('data-critters-action', 'carried')
    const carried = await cat(page).boundingBox()

    // The cat moves exactly with the pointer, keeping the grab offset.
    expect(carried.x - before.x).toBeCloseTo(300, 0)
    expect(carried.y - before.y).toBeCloseTo(-250, 0)

    await page.mouse.up()

    await expect(cat(page)).toHaveAttribute('data-critters-surface-id', LOWER, { timeout: 3000 })
    expect(await interactionState(page)).toBe('settling')
    expect(await rt(page, () => window.Critters.runtime.interactions.stats.pets)).toBe(0)

    const landed = await cat(page).boundingBox()

    await page.waitForTimeout(2500)

    expect((await cat(page).boundingBox()).x).toBe(landed.x)
})

test('a tiny wobble still counts as a pet, not a drag', async ({ page }) => {
    await visit(page)
    await placeOn(page, 'floor', 700)

    const { x, y } = await hitCenter(page)

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 3, y + 2)
    await page.mouse.up()

    await expect(cat(page)).toHaveAttribute('data-critters-action', 'pet')
    expect(await rt(page, () => window.Critters.runtime.interactions.stats)).toMatchObject({ pets: 1, drags: 0 })
})

test('losing pointer capture mid-drag can never leave the cat stuck', async ({ page }) => {
    await visit(page)
    await placeOn(page, 'floor', 700)

    const { x, y } = await hitCenter(page)

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 50, y - 200, { steps: 5 })
    await expect(cat(page)).toHaveAttribute('data-critters-action', 'carried')

    const held = await rt(page, () => {
        const el = document.querySelector('[data-critters-hit]')
        const { id } = window.Critters.runtime.interactions.press
        const captured = el.hasPointerCapture(id)

        el.releasePointerCapture(id)

        return captured
    })

    expect(held).toBe(true)
    // Per the Pointer Events spec, a released capture is processed (and
    // lostpointercapture fired) on the next pointer event.
    await page.mouse.move(x - 60, y - 210)

    await expect.poll(() => interactionState(page)).toBe('settling')
    await expect(cat(page)).toHaveAttribute('data-critters-surface-id', /.+/, { timeout: 3000 })
    await page.mouse.up()
    expect(await rt(page, () => window.Critters.runtime.interactions.lastCancel)).toBe('lostpointercapture')
})

test('navigating mid-drag cancels the drag and the cat recovers', async ({ page }) => {
    await visit(page)
    await placeOn(page, 'floor', 700)

    const { x, y } = await hitCenter(page)

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x - 50, y - 200, { steps: 5 })
    await rt(page, () => window.Livewire.navigate('/admin'))
    await page.waitForURL(/\/admin$/)
    await page.mouse.up()

    await expect.poll(() => interactionState(page)).not.toBe('carried')
    await expect(cat(page)).toHaveAttribute('data-critters-surface-id', /.+/, { timeout: 3000 })
    expect(await rt(page, () => window.Critters.runtime.interactions.lastCancel)).toBe('navigation')
})

test('a cat walking over a button never blocks it', async ({ page }) => {
    await visit(page)

    const save = page.getByRole('button', { name: 'Save' })
    const box = await save.boundingBox()

    await rt(page, () => window.Critters.runtime.pause('test'))
    await placeOn(page, 'upper-shelf', 0, 'walk')
    await rt(page, () => {
        const { runtime } = window.Critters
        runtime.creature.render(1)
        runtime.interactions.updateHitTarget()
    })

    const catBox = await cat(page).boundingBox()

    expect(intersects(catBox, box)).toBe(true)
    await expect(hit(page)).toHaveAttribute('data-critters-hit-enabled', 'false')

    await save.click()
    await expect(page.getByText('Saved')).toBeVisible()
})

test('focusing a covered control sends the cat away', async ({ page }) => {
    await visit(page)

    const save = page.getByRole('button', { name: 'Save' })
    const box = await save.boundingBox()

    await placeOn(page, 'upper-shelf', 0, 'walk')
    await save.focus()

    await expect.poll(async () => intersects(await cat(page).boundingBox(), box), { timeout: 4000 }).toBe(false)
})

test('the user menu hides the critters by keyboard, persists, and shows them again', async ({ page }) => {
    await visit(page, '/admin')

    const toggle = async () => {
        await page.locator('.fi-user-menu-trigger').focus()
        await page.keyboard.press('Enter')
        await page.getByRole('menuitem', { name: 'Hide or show critters' }).focus()
        await page.keyboard.press('Enter')
    }

    await toggle()
    await expect(page.locator('[data-critters-overlay]')).toHaveClass(/critters-overlay--hidden/)
    await expect(cat(page)).toBeHidden()
    await expect(page.locator('.critters-status')).toHaveText('Critters hidden.')

    await page.reload()
    await expect(page.locator('[data-critters-overlay]')).toHaveClass(/critters-overlay--hidden/)

    await toggle()
    await expect(page.locator('[data-critters-overlay]')).not.toHaveClass(/critters-overlay--hidden/)
    await expect(cat(page)).toBeVisible()
    expect(await rt(page, () => localStorage.getItem('critters:admin:hidden'))).toBeNull()
})

test('the user menu pets the cat by keyboard', async ({ page }) => {
    await visit(page, '/admin')
    await placeOn(page, 'floor', 700)

    await page.locator('.fi-user-menu-trigger').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Pet the cat' }).focus()
    await page.keyboard.press('Enter')

    await expect(cat(page)).toHaveAttribute('data-critters-action', 'pet')
    await expect(page.locator('.critters-status')).toHaveText('You petted the cat.')
})

test('critters hide while a dropdown or modal is open and come back after', async ({ page }) => {
    await visit(page)
    const overlay = page.locator('[data-critters-overlay]')

    await page.locator('.fi-user-menu-trigger').click()
    await expect(overlay).toHaveClass(/critters-overlay--obstructed/)
    await page.keyboard.press('Escape')
    await expect(overlay).not.toHaveClass(/critters-overlay--obstructed/)

    await page.getByRole('button', { name: 'Open modal' }).click()
    await expect(page.getByRole('heading', { name: 'A modal' })).toBeVisible()
    await expect(overlay).toHaveClass(/critters-overlay--obstructed/)
    expect(await rt(page, () => window.Critters.runtime.state)).toBe('paused')

    await page.keyboard.press('Escape')
    await expect(overlay).not.toHaveClass(/critters-overlay--obstructed/)
    expect(await rt(page, () => window.Critters.runtime.state)).toBe('running')
})

test('with interactions disabled the cat is fully click-through', async ({ page }) => {
    await visit(page, '/classic')

    await expect(hit(page)).toHaveAttribute('data-critters-hit-enabled', 'false')
    await expect(page.getByRole('menuitem', { name: 'Pet the cat' })).toHaveCount(0)

    const box = await cat(page).boundingBox()
    const target = await rt(page, ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-critters-overlay]') !== null, {
        x: box.x + box.width / 2,
        y: box.y + box.height - 10,
    })

    expect(target).toBe(false)
})

test('touch-only devices get no critters by default', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'tests/browser/.auth/user.json', hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
    const page = await context.newPage()

    await page.goto('/admin')
    await expect(page.locator('script[data-critters-config]')).toHaveCount(1)

    expect(await rt(page, () => ({ state: window.Critters.runtime.state, skipped: window.Critters.runtime.stats.skippedTouch }))).toEqual({ state: 'idle', skipped: 1 })
    await expect(cat(page)).toHaveCount(0)
    await context.close()
})

test('reduced-motion users can still pet the cat without animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await visit(page)
    await placeOn(page, 'floor', 700)
    await rt(page, () => window.Critters.runtime.creature.still('sleep'))

    const { x, y } = await hitCenter(page)

    await page.mouse.click(x, y)

    await expect(cat(page)).toHaveAttribute('data-critters-action', 'pet')
    await expect(page.locator('.critters-heart--still')).toHaveCount(1)
    expect(await rt(page, () => window.Critters.runtime.state)).toBe('static')
})
