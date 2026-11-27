import { CrittersRuntime } from '../../resources/js/runtime/CrittersRuntime.js'
import { Registry } from '../../resources/js/runtime/Registry.js'
import { WanderBehavior } from '../../resources/js/behaviors/WanderBehavior.js'
import { AnimationScheduler } from '../../resources/js/runtime/AnimationScheduler.js'

export function fakeFrames() {
    let queue = []
    let id = 0
    let time = 0

    return {
        raf: (cb) => {
            queue.push({ id: ++id, cb })

            return id
        },
        caf: (cancelled) => {
            queue = queue.filter((entry) => entry.id !== cancelled)
        },
        get pending() {
            return queue.length
        },
        /** Runs `count` frames, `ms` apart. */
        step(ms = 16, count = 1) {
            for (let i = 0; i < count; i++) {
                time += ms
                const due = queue
                queue = []
                due.forEach((entry) => entry.cb(time))
            }
        },
    }
}

export const testSkin = {
    src: 'data:image/png;base64,',
    frameWidth: 10,
    frameHeight: 10,
    frameCount: 6,
    animations: {
        walk: { frames: [0, 1, 2, 3], fps: 8 },
        idle: { frames: [4], fps: 4 },
        sleep: { frames: [5], fps: 2 },
    },
}

export function makeRuntime({ frames = fakeFrames(), seed = 1 } = {}) {
    const registry = new Registry()
        .registerCreature('cat', { width: 20, height: 20, speed: 100, skin: testSkin })
        .registerBehavior('wander', WanderBehavior)
    const scheduler = new AnimationScheduler({ raf: frames.raf, caf: frames.caf })

    return { runtime: new CrittersRuntime({ registry, scheduler, seed }), frames, scheduler, registry }
}

export const config = { panel: 'admin', creature: 'cat', environment: 'panel', behavior: 'wander' }

export function setViewport(width, height) {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width })
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: height })
}

export function setReducedMotion(matches) {
    const listeners = new Set()
    const query = {
        matches,
        addEventListener: (_, fn) => listeners.add(fn),
        removeEventListener: (_, fn) => listeners.delete(fn),
        listeners,
        change(value) {
            query.matches = value
            listeners.forEach((fn) => fn())
        },
    }

    window.matchMedia = () => query

    return query
}
