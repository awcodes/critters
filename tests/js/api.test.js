import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCrittersApi } from '../../resources/js/runtime/api.js'
import { config, makeRuntime, setReducedMotion, setViewport, testSkin } from './helpers.js'

const tabby = { width: 20, height: 20, skin: testSkin }

class Zoomies {
    movingAction = 'walk'

    constructor({ random }) {
        this.random = random
        this.direction = 1
        this.action = 'walk'
    }

    get intent() {
        return { action: this.action, direction: this.direction }
    }

    start() {
        return this.intent
    }

    update() {
        return this.intent
    }

    transition(action) {
        this.action = action

        return this.intent
    }

    blocked(side) {
        this.direction = side === 'left' ? 1 : -1
    }
}

describe('window.Critters registration API', () => {
    let runtime
    let registry

    beforeEach(() => {
        setViewport(400, 300)
        setReducedMotion(false)
        delete window.Critters
        delete window.CrittersRegistrations
        ;({ runtime, registry } = makeRuntime())
    })

    afterEach(() => {
        runtime.destroy()
        document.body.innerHTML = ''
    })

    const tabbyConfig = { ...config, creature: 'tabby', behavior: 'zoomies' }

    it('runs registrations queued before Critters loaded', () => {
        window.CrittersRegistrations = []
        window.CrittersRegistrations.push((Critters) => Critters.registerCreature('tabby', tabby).registerBehavior('zoomies', Zoomies))

        createCrittersApi({ runtime, registry, sync: () => runtime.sync(tabbyConfig) })

        expect(registry.creature('tabby')).not.toBeNull()
        expect(registry.behavior('zoomies')).toBe(Zoomies)
    })

    it('runs registrations pushed afterwards immediately, and announces itself', () => {
        const onInit = vi.fn()

        document.addEventListener('critters:init', onInit, { once: true })
        createCrittersApi({ runtime, registry, sync: () => {} })
        window.CrittersRegistrations.push((Critters) => Critters.registerCreature('tabby', tabby))

        expect(registry.creature('tabby')).not.toBeNull()
        expect(onInit.mock.calls[0][0].detail).toBe(window.Critters)
    })

    it('mounts a creature the panel was waiting for once it is registered', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const api = createCrittersApi({ runtime, registry, sync: () => runtime.sync(tabbyConfig) })

        runtime.sync(tabbyConfig)

        expect(runtime.state).toBe('idle')

        api.registerBehavior('zoomies', Zoomies)

        expect(runtime.state).toBe('idle')

        api.registerCreature('tabby', tabby)

        expect(runtime.state).toBe('running')
        expect(document.querySelector('[data-critters-creature="tabby"]')).not.toBeNull()
        warn.mockRestore()
    })

    it('rejects invalid creature definitions with a useful message', () => {
        const api = createCrittersApi({ runtime, registry, sync: () => {} })

        expect(() => api.registerCreature('broken', { skin: { ...testSkin, animations: { walk: { frames: [0] } } } })).toThrow(
            'Critters: creature "broken" has an invalid skin. Skin must define an "idle" animation.',
        )
    })

    it('isolates failing registration callbacks', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        window.CrittersRegistrations = [
            () => {
                throw new Error('boom')
            },
            (Critters) => Critters.registerCreature('tabby', tabby),
        ]
        createCrittersApi({ runtime, registry, sync: () => {} })

        expect(registry.creature('tabby')).not.toBeNull()
        expect(error).toHaveBeenCalled()
        error.mockRestore()
    })
})
