import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PanelEnvironment } from '../../resources/js/environments/PanelEnvironment.js'
import { createRandom } from '../../resources/js/runtime/random.js'
import { element, fixedClock, setRect, setViewport } from './helpers.js'

const size = { width: 20, height: 20 }
const walk = (direction = 1) => ({ action: 'walk', direction })
const idle = { action: 'idle', direction: 1 }

function env(options = {}) {
    const clock = fixedClock()
    const environment = new PanelEnvironment({ now: clock.now, ...options })

    return { environment, clock }
}

const onFloor = (environment, x = 100) => environment.anchor({ surfaceId: 'floor', offset: x, hop: null }, environment.ledge('floor'), size)

function run(environment, placement, intent, seconds, step = 1 / 60) {
    let result = { placement }

    for (let t = 0; t < seconds; t += step) {
        result = environment.step(result.placement, intent, 50, step, size)
    }

    return result
}

describe('PanelEnvironment', () => {
    beforeEach(() => setViewport(400, 300))
    afterEach(() => (document.body.innerHTML = ''))

    describe('viewport floor', () => {
        it('places creatures on the floor inside the viewport', () => {
            const { environment } = env()

            for (let seed = 0; seed < 50; seed++) {
                const placement = environment.place(size, createRandom(seed))

                expect(placement.surfaceId).toBe('floor')
                expect(placement.x).toBeGreaterThanOrEqual(0)
                expect(placement.x).toBeLessThanOrEqual(380)
                expect(placement.y).toBe(300 - 4 - 20)
            }
        })

        it('moves with elapsed time only while walking', () => {
            const { environment } = env()
            environment.measure(size)
            const start = onFloor(environment)

            expect(environment.step(start, walk(1), 50, 0.5, size).placement.x).toBe(125)
            expect(environment.step(start, walk(-1), 50, 0.5, size).placement.x).toBe(75)
            expect(environment.step(start, idle, 50, 0.5, size).placement.x).toBe(100)
        })

        it('stops at the edges and reports which side blocked', () => {
            const { environment } = env()
            environment.measure(size)

            const right = environment.step(onFloor(environment, 375), walk(1), 50, 1, size)

            expect(right.placement.x).toBe(380)
            expect(right.blocked).toBe('right')
            expect(environment.step(onFloor(environment, 5), walk(-1), 50, 1, size).blocked).toBe('left')
            expect(environment.step(onFloor(environment, 0), walk(1), 50, 0.1, size).blocked).toBeNull()
        })

        it('measures only when invalidated', () => {
            const { environment } = env()
            let placement = environment.place(size, createRandom(1))

            for (let i = 0; i < 100; i++) {
                placement = environment.step(placement, walk(), 50, 0.016, size).placement
            }

            expect(environment.measurements).toBe(1)

            environment.invalidate()
            environment.step(placement, walk(), 50, 0.016, size)

            expect(environment.measurements).toBe(2)
        })

        it('keeps creatures visible after the viewport shrinks', () => {
            const { environment } = env()
            environment.measure(size)
            const placement = onFloor(environment, 350)

            setViewport(200, 150)
            environment.invalidate()

            expect(environment.constrain(placement, size)).toMatchObject({ x: 180, y: 126 })
        })
    })

    describe('ledges', () => {
        function withShelf(top = 200) {
            const shelf = setRect(element('<div data-critters-surface="shelf"></div>'), { left: 100, top, width: 200, height: 50 })
            const { environment, clock } = env()

            environment.measure(size)

            return { environment, shelf, clock }
        }

        it('rides along when its ledge moves without resizing (scrolling)', () => {
            const { environment, shelf } = withShelf()
            const placement = environment.anchor({ surfaceId: 'shelf', offset: 50, hop: null }, environment.ledge('shelf'), size)

            setRect(shelf, { left: 120, top: 150, width: 200, height: 50 })
            environment.invalidate()

            expect(environment.step(placement, idle, 50, 0.016, size).placement).toMatchObject({ surfaceId: 'shelf', x: 170, y: 130 })
        })

        it('walks only within its ledge', () => {
            const { environment } = withShelf()
            const placement = environment.anchor({ surfaceId: 'shelf', offset: 170, hop: null }, environment.ledge('shelf'), size)
            const result = environment.step(placement, walk(1), 50, 1, size)

            expect(result.placement.x).toBe(280)
            expect(result.blocked).toBe('right')
        })

        it('hops to a ledge in reach and lands on it', () => {
            const { environment } = withShelf(250)
            const start = onFloor(environment, 150)
            const options = environment.hopOptions(start, size, 1)

            expect(options).toEqual([{ surfaceId: 'shelf', x: 170, rise: -46 }])

            let placement = environment.startHop(start, options[0], size)
            const heights = []
            let result

            for (let i = 0; i < 120 && placement.hop; i++) {
                result = environment.step(placement, walk(), 50, 1 / 60, size)
                placement = result.placement
                heights.push(placement.y)
            }

            expect(result.landed).toBe(true)
            expect(placement).toMatchObject({ surfaceId: 'shelf', x: 170, y: 230, hop: null })
            // The arc rises above the landing height before settling.
            expect(Math.min(...heights)).toBeLessThan(230)
        })

        it('offers no hops beyond the rise limit', () => {
            const { environment } = withShelf(20)

            expect(environment.hopOptions(onFloor(environment, 150), size, 1)).toEqual([])
        })

        it('falls to the ledge below when its ledge disappears', () => {
            const { environment, shelf } = withShelf()
            const placement = environment.anchor({ surfaceId: 'shelf', offset: 50, hop: null }, environment.ledge('shelf'), size)

            shelf.remove()
            environment.invalidate({ rediscover: true })

            const first = environment.step(placement, idle, 50, 1 / 60, size)

            expect(first.action).toBe('fall')
            expect(first.placement.y).toBeLessThan(276)

            const landed = run(environment, first.placement, idle, 2)

            expect(landed.placement).toMatchObject({ surfaceId: 'floor', y: 276, hop: null })
            expect(landed.placement.x).toBeCloseTo(150)
        })

        it('cancels a hop whose target disappears and falls instead', () => {
            const { environment, shelf } = withShelf(250)
            const start = onFloor(environment, 150)
            let placement = environment.startHop(start, environment.hopOptions(start, size, 1)[0], size)

            placement = environment.step(placement, walk(), 50, 0.1, size).placement
            shelf.remove()
            environment.invalidate({ rediscover: true })

            const cancelled = environment.step(placement, walk(), 50, 1 / 60, size)

            expect(cancelled.action).toBe('fall')
            expect(cancelled.placement.hop.surfaceId).toBe('floor')
            expect(run(environment, cancelled.placement, walk(), 2).placement).toMatchObject({ surfaceId: 'floor', hop: null })
        })
    })

    describe('safe settling', () => {
        function withButtonAboveFloor() {
            const button = setRect(element('<button>Save</button>'), { left: 90, top: 270, width: 40, height: 20 })
            const { environment, clock } = env()

            environment.measure(size)

            return { environment, button, clock }
        }

        it('walks aside before resting on an interactive element', () => {
            const { environment } = withButtonAboveFloor()
            const result = environment.step(onFloor(environment, 100), idle, 50, 1 / 60, size)

            expect(result.action).toBe('walk')

            const settled = run(environment, onFloor(environment, 100), idle, 2)

            expect(settled.action).toBe('idle')
            // Clear of the button (90..130) plus margin: either ≤ 66 or ≥ 134.
            expect(settled.placement.x <= 66 || settled.placement.x >= 134).toBe(true)
        })

        it('keeps moving when a ledge has nowhere safe to rest', () => {
            setRect(element('<div data-critters-surface="narrow"></div>'), { left: 100, top: 200, width: 40, height: 50 })
            setRect(element('<a href="#">link</a>'), { left: 100, top: 185, width: 40, height: 10 })
            const { environment } = env()

            environment.measure(size)

            const placement = environment.anchor({ surfaceId: 'narrow', offset: 0, hop: null }, environment.ledge('narrow'), size)

            expect(environment.step(placement, idle, 50, 1 / 60, size).action).toBe('walk')
        })

        it('reuses unsafe measurements while invalidations keep arriving', () => {
            const { environment, button, clock } = withButtonAboveFloor()

            environment.unsafeRegions()
            setRect(button, { left: 300, top: 270, width: 40, height: 20 })
            clock.t = 10
            environment.invalidate()
            clock.t = 50

            expect(environment.unsafeRegions()[0].left).toBe(90)

            clock.t = 300

            expect(environment.unsafeRegions()[0].left).toBe(300)
        })
    })

    describe('observation', () => {
        it('invalidates on scroll and rediscovers after DOM changes, then disconnects', async () => {
            const { environment } = env()

            environment.connect()
            environment.measure(size)
            window.dispatchEvent(new Event('scroll'))

            expect(environment.dirty).toBe(true)
            expect(environment.needsDiscovery).toBe(false)

            environment.measure(size)
            document.body.appendChild(document.createElement('section'))
            await Promise.resolve()

            expect(environment.needsDiscovery).toBe(true)

            environment.measure(size)
            environment.destroy()
            window.dispatchEvent(new Event('scroll'))
            document.body.appendChild(document.createElement('section'))
            await Promise.resolve()

            expect(environment.dirty).toBe(false)
            expect(environment.needsDiscovery).toBe(false)
        })

        it('ignores mutations inside the critters overlay', async () => {
            const overlay = element('<div data-critters-overlay="admin"></div>')
            const { environment } = env()

            environment.connect()
            environment.measure(size)
            overlay.appendChild(document.createElement('div'))
            await Promise.resolve()

            expect(environment.needsDiscovery).toBe(false)
            environment.destroy()
        })
    })
})
