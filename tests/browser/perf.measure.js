// Manual measurement, not part of the suite: `node tests/browser/perf.measure.js [outDir]`.
// Compares Chrome performance counters over 10s on a Critters panel and the plain panel.
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'test-results'
const browser = await chromium.launch()
const context = await browser.newContext({ storageState: 'tests/browser/.auth/user.json', viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Performance.enable')

const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))

async function measure(path, action) {
    await page.goto(`http://127.0.0.1:8765${path}`)
    await page.waitForTimeout(1000)
    if (action) await page.evaluate((a) => window.Critters.runtime.creature.behavior.transition(a, { duration: 60 }), action)
    const a = await metrics()
    await page.waitForTimeout(10000)
    const b = await metrics()
    const d = (k) => b[k] - a[k]
    return {
        path,
        action,
        layouts: d('LayoutCount'),
        styleRecalcs: d('RecalcStyleCount'),
        layoutMs: +(d('LayoutDuration') * 1000).toFixed(1),
        styleMs: +(d('RecalcStyleDuration') * 1000).toFixed(1),
        scriptMs: +(d('ScriptDuration') * 1000).toFixed(1),
        taskMs: +(d('TaskDuration') * 1000).toFixed(1),
        heapMB: +(b.JSHeapUsedSize / 1048576).toFixed(1),
    }
}

console.table([await measure('/plain', null), await measure('/admin', 'walk'), await measure('/admin', 'sleep'), await measure('/aquarium', 'swim')])

// Scrolling re-measures surfaces every frame. Compare the Surfaces page with the runtime
// destroyed against a sleeping cat riding a shelf.
async function measureScroll(withCritters) {
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.goto('http://127.0.0.1:8765/admin/surfaces')
    await page.waitForTimeout(1000)
    await page.evaluate((keep) => {
        const { runtime } = window.Critters
        if (!keep) return runtime.destroy()
        const { creature } = runtime
        const env = creature.environment
        env.ensureMeasured(creature.size)
        creature.placement = env.anchor({ surfaceId: 'upper-shelf', offset: 600, hop: null }, env.ledge('upper-shelf'), creature.size)
        creature.behavior.transition('sleep', { duration: 600 })
    }, withCritters)
    const a = await metrics()
    for (let i = 0; i < 100; i++) {
        await page.mouse.wheel(0, i % 20 < 10 ? 12 : -12)
        await page.waitForTimeout(50)
    }
    const b = await metrics()
    const d = (k) => b[k] - a[k]
    const env = withCritters ? await page.evaluate(() => window.Critters.runtime.environment.describe()) : null
    return {
        scenario: withCritters ? 'scroll, cat on shelf' : 'scroll, no critters',
        layouts: d('LayoutCount'),
        styleRecalcs: d('RecalcStyleCount'),
        layoutMs: +(d('LayoutDuration') * 1000).toFixed(1),
        scriptMs: +(d('ScriptDuration') * 1000).toFixed(1),
        taskMs: +(d('TaskDuration') * 1000).toFixed(1),
        measurements: env?.measurements ?? 0,
    }
}

console.table([await measureScroll(false), await measureScroll(true)])
await page.setViewportSize({ width: 1280, height: 800 })

for (const dark of [false, true]) {
    await page.goto('http://127.0.0.1:8765/admin')
    await page.evaluate((d) => { localStorage.setItem('filament:theme:mode', d ? 'dark' : 'light') }, dark)
    await page.reload()
    await page.evaluate(() => {
        const { creature } = window.Critters.runtime
        creature.placement = { ...creature.placement, offset: 900 }
        creature.behavior.transition('idle', { duration: 60 })
    })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/cat-${dark ? 'dark' : 'light'}.png`, clip: { x: 760, y: 650, width: 400, height: 150 } })
}

await browser.close()
