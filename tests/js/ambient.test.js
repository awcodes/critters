import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AmbientEnvironment } from '../../resources/js/environments/AmbientEnvironment.js'
import { AmbientBehavior } from '../../resources/js/behaviors/AmbientBehavior.js'
import { createRandom } from '../../resources/js/runtime/random.js'
import { resolveAnimation } from '../../resources/js/runtime/skin.js'
import { builtInCreatures } from '../../resources/js/creatures/builtins.js'
import { config, element, makeRuntime, setRect, setReducedMotion, setViewport, fixedClock } from './helpers.js'
import { Registry } from '../../resources/js/runtime/Registry.js'
import { CrittersRuntime } from '../../resources/js/runtime/CrittersRuntime.js'
import { AnimationScheduler } from '../../resources/js/runtime/AnimationScheduler.js'
import { fakeFrames } from './helpers.js'

const size = { width: 20, height: 20 }
const tank = () => setRect(element('<div data-critters-region="tank"></div>'), { left: 100, top: 50, width: 200, height: 120 })
const env = (options = {}) => new AmbientEnvironment({ now: fixedClock().now, inset: 0, ...options })
const swim = (direction = 1, vertical = 0) => ({ action: 'swim', direction, vertical })

describe('AmbientEnvironment', () => {
    beforeEach(() => setViewport(400, 300))
    afterEach(() => (document.body.innerHTML = ''))

    it('places creatures inside the marked region', () => {
        tank()
        const environment = env()

        for (let seed = 0; seed < 40; seed++) {
            const { x, y } = environment.place(size, createRandom(seed))

            expect(x).toBeGreaterThanOrEqual(100)
            expect(x).toBeLessThanOrEqual(280)
            expect(y).toBeGreaterThanOrEqual(50)
            expect(y).toBeLessThanOrEqual(150)
        }
    })

    it('swims in two dimensions and reports the wall it meets', () => {
        tank()
        const environment = env()
        const start = environment.anchor({ offset: 100, offsetY: 50, hop: null }, size)

        expect(environment.step(start, swim(1, 0.5), 40, 1, size).placement).toMatchObject({ x: 240, y: 120 })
        expect(environment.step(start, swim(1), 40, 10, size)).toMatchObject({ blocked: 'right', placement: { x: 280 } })
        expect(environment.step(start, swim(-1), 40, 10, size).blocked).toBe('left')
        expect(environment.step(start, swim(1, -1), 10, 6, size).blocked).toBe('top')
        expect(environment.step(start, swim(1, 1), 10, 6, size).blocked).toBe('bottom')
        expect(environment.step(start, { action: 'idle', direction: 1 }, 40, 1, size).placement).toMatchObject({ x: 200, y: 100 })
    })

    it('moves with the region when it scrolls', () => {
        const region = tank()
        const environment = env()
        const placement = environment.anchor({ offset: 30, offsetY: 30, hop: null }, size)

        setRect(region, { left: 100, top: -20, width: 200, height: 120 })
        environment.invalidate()

        expect(environment.step(placement, { action: 'idle', direction: 1 }, 40, 0.016, size).placement).toMatchObject({ x: 130, y: 10 })
    })

    it('never discovers panel surfaces', () => {
        tank()
        element('<section class="fi-section" data-critters-surface="shelf"></section>')
        const environment = env()

        environment.measure(size)

        expect(environment.describe().ledges).toEqual([])
        expect(environment.hopOptions()).toEqual([])
    })

    it('uses a configured selector, and hides creatures while that region is missing', () => {
        const environment = env({ region: '#aquarium' })
        const placement = environment.place(size, createRandom(1))

        expect(placement.hidden).toBe(true)

        setRect(element('<div id="aquarium"></div>'), { left: 0, top: 0, width: 100, height: 100 })
        environment.invalidate({ rediscover: true })

        expect(environment.step(placement, swim(), 10, 0.1, size).placement.hidden).toBe(false)
    })

    it('falls back to the viewport when nothing is configured or marked', () => {
        const environment = env()

        environment.measure(size)

        expect(environment.describe().region).toEqual({ left: 0, top: 0, right: 400, bottom: 300 })
    })

    it('glides a creature released outside the region back inside', () => {
        tank()
        const environment = env()
        let placement = environment.fall({ surfaceId: 'region', x: 380, y: 280, hop: null }, size)
        let result

        for (let i = 0; i < 120 && placement.hop; i++) {
            result = environment.step(placement, swim(), 40, 1 / 60, size)
            placement = result.placement
        }

        expect(result.landed).toBe(true)
        expect(placement).toMatchObject({ x: 280, y: 150, hop: null })
    })
})

describe('AmbientBehavior', () => {
    it('swims, hovers and dozes, bouncing off walls', () => {
        const behavior = new AmbientBehavior({ random: createRandom(5) })
        const seen = new Set([behavior.start().action])

        for (let i = 0; i < 5000; i++) seen.add(behavior.update(0.5).action)

        expect([...seen].sort()).toEqual(['idle', 'sleep', 'swim'])

        behavior.transition('swim')
        behavior.vertical = 0.3
        behavior.blocked('bottom')
        expect(behavior.intent.vertical).toBe(-0.3)
        behavior.blocked('top')
        expect(behavior.intent.vertical).toBe(0.3)
        behavior.blocked('right')
        expect(behavior.intent.direction).toBe(-1)
    })

    it('has no vertical drift unless swimming', () => {
        const behavior = new AmbientBehavior({ random: createRandom(5) })

        behavior.transition('idle')

        expect(behavior.intent.vertical).toBe(0)
    })
})

describe('fish skin', () => {
    it('falls back from walk and hop to swim, and has its own pet frames', () => {
        expect(resolveAnimation(builtInCreatures.fish.skin, 'walk').name).toBe('swim')
        expect(resolveAnimation(builtInCreatures.fish.skin, 'hop').name).toBe('swim')
        expect(resolveAnimation(builtInCreatures.fish.skin, 'pet').name).toBe('pet')
    })
})

describe('shared runtime', () => {
    beforeEach(() => {
        setViewport(400, 300)
        setReducedMotion(false)
    })
    afterEach(() => (document.body.innerHTML = ''))

    it('runs the ambient environment with the same scheduler, registry, renderer and interactions', () => {
        tank()
        const frames = fakeFrames()
        const registry = new Registry().registerCreature('fish', builtInCreatures.fish).registerBehavior('swim', AmbientBehavior)
        const runtime = new CrittersRuntime({ registry, scheduler: new AnimationScheduler(frames), seed: 3 })

        runtime.mount({ ...config, creature: 'fish', behavior: 'swim', environment: 'ambient' }).start()
        frames.step(16, 120)

        expect(runtime.environment).toBeInstanceOf(AmbientEnvironment)
        expect(runtime.interactions).not.toBeNull()

        const { x, y } = runtime.creature.position

        expect(x).toBeGreaterThanOrEqual(108)
        expect(y).toBeGreaterThanOrEqual(58)
        expect(document.querySelector('[data-critters-creature="fish"]')).not.toBeNull()
        runtime.destroy()
    })
})
