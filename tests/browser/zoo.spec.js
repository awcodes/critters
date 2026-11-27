import { expect, test } from '@playwright/test'

const LAND = ['cat', 'dog', 'lizard', 'sparky', 'atlas', 'barney']
const rt = (page, fn, arg) => page.evaluate(fn, arg)

for (const name of LAND) {
    test(`${name} walks, pets and is carried with its own frames`, async ({ page }) => {
        const sprite = []

        page.on('response', (r) => r.url().includes(`critters-creature-${name}.css`) && sprite.push(r.status()))
        await page.goto(`/zoo?critter=${name}`)

        const creature = page.locator(`[data-critters-creature="${name}"]`)

        await expect(creature).toHaveCount(1)
        await expect(page.locator('.fi-main-ctn')).toHaveCSS('opacity', '1')
        expect(sprite).toEqual([200])
        expect(await creature.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/^url\("data:image\/png/)

        const frame = async () => Number(await creature.getAttribute('data-critters-frame'))

        // Walk: frames 0-3.
        await rt(page, () => window.Critters.runtime.creature.behavior.transition('walk', { duration: 60 }))
        const walk = new Set()
        for (let i = 0; i < 6; i++) {
            await page.waitForTimeout(130)
            walk.add(await frame())
        }
        expect([...walk].every((f) => f >= 0 && f <= 3)).toBe(true)

        // Park it on the floor away from controls, asleep, then pet it: frames 10-11.
        await rt(page, () => {
            const { creature } = window.Critters.runtime
            const env = creature.environment
            env.ensureMeasured(creature.size)
            creature.placement = env.anchor({ surfaceId: 'floor', offset: 900, hop: null }, env.ledge('floor'), creature.size)
            creature.intent = creature.behavior.transition('sleep', { duration: 60 })
            creature.action = 'sleep'
            creature.render(1)
        })

        const hit = page.locator(`[data-critters-hit="${name}"]`)

        await expect(hit).toHaveAttribute('data-critters-hit-enabled', 'true')
        let box = await hit.boundingBox()
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await expect(creature).toHaveAttribute('data-critters-action', 'pet')
        expect([10, 11]).toContain(await frame())

        // Carry it: frames 12-13.
        await page.waitForTimeout(1400)
        box = await hit.boundingBox()
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x - 40, box.y - 200, { steps: 6 })
        await expect(creature).toHaveAttribute('data-critters-action', 'carried')
        await page.waitForTimeout(300)
        expect([12, 13]).toContain(await frame())
        await page.mouse.up()
    })
}

test('the zoo remembers the chosen creature across SPA navigation', async ({ page }) => {
    await page.goto('/zoo?critter=barney')
    await expect(page.locator('[data-critters-creature="barney"]')).toHaveCount(1)
    await page.locator('.fi-user-menu-trigger').click()
    await expect(page.getByRole('menuitem', { name: 'Pet Barney' })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: 'Second page' }).first().click()
    await page.waitForURL('**/zoo/second')
    await expect(page.locator('[data-critters-creature="barney"]')).toHaveCount(1)
})
