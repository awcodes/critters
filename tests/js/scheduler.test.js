import { describe, expect, it, vi } from 'vitest'
import { AnimationScheduler } from '../../resources/js/runtime/AnimationScheduler.js'
import { fakeFrames } from './helpers.js'

describe('AnimationScheduler', () => {
    it('passes elapsed seconds, starting from zero', () => {
        const frames = fakeFrames()
        const scheduler = new AnimationScheduler(frames)
        const deltas = []

        scheduler.add((delta) => deltas.push(delta))
        scheduler.start()
        frames.step(16, 3)

        expect(deltas[0]).toBe(0)
        expect(deltas[1]).toBeCloseTo(0.016)
        expect(deltas[2]).toBeCloseTo(0.016)
    })

    it('clamps large gaps such as a suspended tab', () => {
        const frames = fakeFrames()
        const scheduler = new AnimationScheduler(frames)
        const deltas = []

        scheduler.add((delta) => deltas.push(delta))
        scheduler.start()
        frames.step(16)
        frames.step(5000)

        expect(deltas[1]).toBe(0.1)
    })

    it('never runs more than one loop', () => {
        const frames = fakeFrames()
        const scheduler = new AnimationScheduler(frames)
        const callback = vi.fn()

        scheduler.add(callback)
        scheduler.start()
        scheduler.start()
        scheduler.start()

        expect(frames.pending).toBe(1)

        frames.step(16, 5)

        expect(callback).toHaveBeenCalledTimes(5)
    })

    it('stops scheduling frames when stopped and restarts without a jump', () => {
        const frames = fakeFrames()
        const scheduler = new AnimationScheduler(frames)
        const deltas = []

        scheduler.add((delta) => deltas.push(delta))
        scheduler.start()
        frames.step(16, 2)
        scheduler.stop()

        expect(frames.pending).toBe(0)

        scheduler.start()
        frames.step(16)

        expect(deltas.at(-1)).toBe(0)
    })

    it('removes callbacks', () => {
        const frames = fakeFrames()
        const scheduler = new AnimationScheduler(frames)
        const callback = vi.fn()
        const remove = scheduler.add(callback)

        remove()
        scheduler.start()
        frames.step(16)

        expect(callback).not.toHaveBeenCalled()
    })
})
