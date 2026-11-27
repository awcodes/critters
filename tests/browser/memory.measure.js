// Manual measurement, not part of the suite:
//   node tests/browser/memory.measure.js [--headed]
// Starts the Workbench on :8765 if it isn't already running. Reports DOM/listener/heap counters across many SPA
// navigations (re-attach and destroy/remount paths) and frame-interval statistics.
import { chromium } from '@playwright/test'
import { BASE_URL, ensureSession, ensureWorkbench, STORAGE_STATE } from './support/workbench.js'

const headed = process.argv.includes('--headed')
const stopWorkbench = await ensureWorkbench()
const browser = await chromium.launch({ headless: !headed })
await ensureSession(browser)

const context = await browser.newContext({ storageState: STORAGE_STATE, viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
const base = BASE_URL

async function counters() {
    await cdp.send('HeapProfiler.collectGarbage')
    await cdp.send('HeapProfiler.collectGarbage')
    const dom = await cdp.send('Memory.getDOMCounters')
    const { usedSize } = await cdp.send('Runtime.getHeapUsage')

    return {
        nodes: dom.nodes,
        listeners: dom.jsEventListeners,
        documents: dom.documents,
        heapMB: +(usedSize / 1048576).toFixed(2),
        ...(await page.evaluate(() => ({
            overlays: document.querySelectorAll('[data-critters-overlay]').length,
            mounts: window.Critters?.runtime.stats.mounts,
            destroys: window.Critters?.runtime.stats.destroys,
        }))),
    }
}

async function navigate(path) {
    await page.evaluate((p) => window.Livewire.navigate(p), path)
    await page.waitForURL(`**${path}`)
    await page.waitForTimeout(150)
}

await page.goto(`${base}/admin`)
await page.waitForTimeout(1500)

// Warm up both paths once so lazily created caches don't count as growth.
await navigate('/admin/second')
await navigate('/plain')
await navigate('/admin')

const rows = [{ phase: 'start', ...(await counters()) }]

for (let i = 0; i < 25; i++) {
    await navigate('/admin/second')
    await navigate('/admin')
}

rows.push({ phase: 'after 50 re-attaching navigations', ...(await counters()) })

for (let i = 0; i < 25; i++) {
    await navigate('/plain')
    await navigate('/admin')
}

rows.push({ phase: 'after 50 destroy/remount navigations', ...(await counters()) })
console.table(rows)

async function frameStats(path, setup) {
    await page.goto(`${base}${path}`)
    await page.waitForTimeout(1500)
    await page.evaluate(setup)

    return page.evaluate(
        () =>
            new Promise((resolve) => {
                const intervals = []
                let last = null
                const tick = (t) => {
                    if (last !== null) intervals.push(t - last)
                    last = t
                    intervals.length < 600 ? requestAnimationFrame(tick) : resolve(intervals)
                }
                requestAnimationFrame(tick)
            }),
    )
}

const summarize = (label, intervals) => {
    const sorted = [...intervals].sort((a, b) => a - b)
    const pick = (q) => +sorted[Math.floor(q * (sorted.length - 1))].toFixed(2)

    return { scenario: label, frames: intervals.length, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: pick(1), over20ms: intervals.filter((i) => i > 20).length }
}

console.table([
    summarize('plain panel (no critters)', await frameStats('/plain', () => {})),
    summarize('cat walking', await frameStats('/admin', () => window.Critters.runtime.creature.behavior.transition('walk', { duration: 60 }))),
    summarize('fish swimming', await frameStats('/aquarium', () => window.Critters.runtime.creature.behavior.transition('swim', { duration: 60 }))),
])

await browser.close()
stopWorkbench()
