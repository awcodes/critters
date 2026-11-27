import { beforeEach, describe, expect, it } from 'vitest'
import { PanelEnvironment } from '../../resources/js/environments/PanelEnvironment.js'
import { createRandom } from '../../resources/js/runtime/random.js'
import { setViewport } from './helpers.js'

const size = { width: 20, height: 20 }

describe('PanelEnvironment (viewport floor)', () => {
    beforeEach(() => setViewport(400, 300))

    it('places creatures on the floor inside the viewport', () => {
        const env = new PanelEnvironment()

        for (let seed = 0; seed < 50; seed++) {
            const { x, y } = env.place(size, createRandom(seed))

            expect(x).toBeGreaterThanOrEqual(0)
            expect(x).toBeLessThanOrEqual(380)
            expect(y).toBe(300 - 4 - 20)
        }
    })

    it('moves with elapsed time only while walking', () => {
        const env = new PanelEnvironment()
        const start = { x: 100, y: 276 }

        expect(env.step(start, { action: 'walk', direction: 1 }, 50, 0.5, size).position.x).toBe(125)
        expect(env.step(start, { action: 'walk', direction: -1 }, 50, 0.5, size).position.x).toBe(75)
        expect(env.step(start, { action: 'idle', direction: 1 }, 50, 0.5, size).position.x).toBe(100)
    })

    it('stops at the edges and reports which side blocked', () => {
        const env = new PanelEnvironment()

        expect(env.step({ x: 375, y: 0 }, { action: 'walk', direction: 1 }, 50, 1, size)).toEqual({
            position: { x: 380, y: 276 },
            blocked: 'right',
        })
        expect(env.step({ x: 5, y: 0 }, { action: 'walk', direction: -1 }, 50, 1, size).blocked).toBe('left')
        expect(env.step({ x: 0, y: 0 }, { action: 'walk', direction: 1 }, 50, 0.1, size).blocked).toBeNull()
    })

    it('measures only when invalidated', () => {
        const env = new PanelEnvironment()

        for (let i = 0; i < 100; i++) {
            env.step({ x: 100, y: 0 }, { action: 'walk', direction: 1 }, 50, 0.016, size)
        }

        expect(env.measurements).toBe(1)

        env.invalidate()
        env.step({ x: 100, y: 0 }, { action: 'walk', direction: 1 }, 50, 0.016, size)

        expect(env.measurements).toBe(2)
    })

    it('keeps creatures visible after the viewport shrinks', () => {
        const env = new PanelEnvironment()

        env.measure()
        setViewport(200, 150)
        env.invalidate()

        expect(env.constrain({ x: 350, y: 276 }, size)).toEqual({ x: 180, y: 126 })
    })
})
