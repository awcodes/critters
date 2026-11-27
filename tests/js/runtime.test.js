import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config, makeRuntime, setReducedMotion, setViewport } from './helpers.js'

const creature = () => document.querySelector('[data-critters-creature]')

describe('CrittersRuntime', () => {
    beforeEach(() => {
        setViewport(400, 300)
        setReducedMotion(false)
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('mounts one overlay and creature, idempotently', () => {
        const { runtime } = makeRuntime()

        runtime.mount(config).mount(config).start().start()

        expect(document.querySelectorAll('[data-critters-overlay]')).toHaveLength(1)
        expect(document.querySelectorAll('[data-critters-creature]')).toHaveLength(1)
        expect(runtime.state).toBe('running')
        expect(runtime.stats.mounts).toBe(1)
    })

    it('ignores unknown creatures without throwing', () => {
        const { runtime } = makeRuntime()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        runtime.mount({ ...config, creature: 'dragon' })

        expect(runtime.state).toBe('idle')
        expect(warn).toHaveBeenCalledWith('Critters: unknown creature "dragon".')
    })

    it('animates the creature from the scheduler', () => {
        const { runtime, frames } = makeRuntime()

        runtime.mount(config).start()
        runtime.creature.behavior.transition('walk', { duration: 100 })

        const before = runtime.creature.position.x

        frames.step(16, 30)

        expect(runtime.creature.position.x).not.toBe(before)
        expect(creature().dataset.crittersAction).toBe('walk')
        expect(creature().style.transform).toContain('translate3d(')
    })

    it('pauses for any reason and resumes only when all reasons clear', () => {
        const { runtime, frames } = makeRuntime()

        runtime.mount(config).start()
        runtime.pause('navigation').pause('user')

        expect(runtime.state).toBe('paused')
        expect(frames.pending).toBe(0)

        runtime.resume('navigation')

        expect(runtime.state).toBe('paused')

        runtime.resume('user')

        expect(runtime.state).toBe('running')
        expect(frames.pending).toBe(1)
    })

    it('pauses while the tab is hidden', () => {
        const { runtime, frames } = makeRuntime()
        const visibility = (state) => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
            document.dispatchEvent(new Event('visibilitychange'))
        }

        runtime.mount(config).start()
        visibility('hidden')

        expect(runtime.state).toBe('paused')
        expect(frames.pending).toBe(0)

        visibility('visible')

        expect(runtime.state).toBe('running')
    })

    it('shows a still, sleeping creature with no animation loop under reduced motion', () => {
        const motion = setReducedMotion(true)
        const { runtime, frames } = makeRuntime()

        runtime.mount(config).start()

        expect(runtime.state).toBe('static')
        expect(frames.pending).toBe(0)
        expect(creature().dataset.crittersAction).toBe('sleep')

        motion.change(false)

        expect(runtime.state).toBe('running')
        expect(frames.pending).toBe(1)
    })

    it('re-measures after a resize and keeps the creature in view', () => {
        const { runtime, frames } = makeRuntime()

        runtime.mount(config).start()
        runtime.creature.position = { x: 380, y: 276 }

        setViewport(100, 100)
        window.dispatchEvent(new Event('resize'))
        frames.step(16)

        expect(runtime.creature.position).toEqual({ x: 80, y: 76 })
    })

    it('releases every listener, frame and element on destroy', () => {
        const { runtime, frames } = makeRuntime()
        const added = vi.spyOn(window, 'addEventListener')
        const removed = vi.spyOn(window, 'removeEventListener')
        const docAdded = vi.spyOn(document, 'addEventListener')
        const docRemoved = vi.spyOn(document, 'removeEventListener')

        runtime.mount(config).start()
        runtime.destroy().destroy()

        expect(removed.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining(added.mock.calls.map((c) => c[1])))
        expect(docRemoved.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining(docAdded.mock.calls.map((c) => c[1])))
        expect(window.matchMedia().listeners.size).toBe(0)
        expect(frames.pending).toBe(0)
        expect(runtime.scheduler.callbacks.size).toBe(0)
        expect(document.querySelector('[data-critters-overlay]')).toBeNull()
        expect(runtime.state).toBe('idle')
        expect(runtime.stats.destroys).toBe(1)
    })

    describe('sync', () => {
        it('re-attaches the same overlay to a replaced body', () => {
            const { runtime } = makeRuntime()

            runtime.sync(config)
            const overlay = runtime.overlay

            document.body.replaceWith(document.createElement('body'))
            runtime.sync(config)

            expect(runtime.overlay).toBe(overlay)
            expect(overlay.isConnected).toBe(true)
            expect(runtime.stats).toMatchObject({ mounts: 1, reattachments: 1 })
        })

        it('remounts when config changes and destroys when it disappears', () => {
            const { runtime } = makeRuntime()

            runtime.sync(config)
            runtime.sync({ ...config, panel: 'other' })

            expect(runtime.stats).toMatchObject({ mounts: 2, reconfigurations: 1 })
            expect(document.querySelectorAll('[data-critters-overlay]')).toHaveLength(1)

            runtime.sync(null)

            expect(runtime.state).toBe('idle')
            expect(document.querySelector('[data-critters-overlay]')).toBeNull()
        })
    })
})
