import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config, makeRuntime, pointer, setRect, setReducedMotion, setViewport, stubPointerCapture, element } from './helpers.js'

let runtime
let frames

function mount(overrides = {}) {
    ;({ runtime, frames } = makeRuntime())
    runtime.mount({ ...config, interactive: true, ...overrides }).start()
    runtime.creature.placement = { ...runtime.creature.placement, offset: 100 }
    runtime.creature.behavior.transition('idle', { duration: 100 })
    frames.step(16, 2)

    const hit = runtime.creature.renderer.hit
    const captured = stubPointerCapture(hit)

    return { hit, captured }
}

const center = () => ({ x: runtime.creature.position.x + 10, y: runtime.creature.position.y + 10 })

describe('InteractionController', () => {
    beforeEach(() => {
        setViewport(400, 300)
        setReducedMotion(false)
        localStorage.clear()
    })

    afterEach(() => {
        runtime?.destroy()
        document.body.innerHTML = ''
    })

    it('enables the hit target only while interactive', () => {
        const { hit } = mount()

        expect(hit.style.pointerEvents).toBe('auto')

        runtime.destroy()
        const disabled = mount({ interactive: false })

        expect(disabled.hit.style.pointerEvents).toBe('none')
    })

    it('pets on a short press and plays the pet reaction', () => {
        const { hit, captured } = mount()
        const onPet = vi.fn()
        runtime.interactions.onPet = onPet

        pointer(hit, 'pointerdown', center())
        expect(captured.has(1)).toBe(true)
        pointer(hit, 'pointermove', { x: center().x + 3, y: center().y })
        pointer(hit, 'pointerup', center())

        expect(runtime.interactions.state).toBe('reacting')
        expect(runtime.creature.action).toBe('pet')
        expect(onPet).toHaveBeenCalledOnce()
        expect(captured.size).toBe(0)
        expect(document.querySelector('.critters-heart')).not.toBeNull()

        const x = runtime.creature.position.x

        frames.step(100, 5)

        expect(runtime.creature.position.x).toBe(x)

        frames.step(100, 10)

        expect(runtime.interactions.state).toBe('idle')
        expect(runtime.creature.mode).toBe('auto')
    })

    it('drags past the threshold, follows the pointer, and never pets afterwards', () => {
        const { hit } = mount()
        const start = center()

        pointer(hit, 'pointerdown', start)
        pointer(hit, 'pointermove', { x: start.x + 50, y: start.y - 100 })

        expect(runtime.interactions.state).toBe('carried')
        expect(runtime.creature.action).toBe('carried')
        expect(runtime.creature.position).toEqual({ x: 150, y: 176 })
        expect(runtime.creature.renderer.el.style.transform).toContain('translate3d(150px, 176px')

        pointer(hit, 'pointerup', { x: start.x + 50, y: start.y - 100 })

        expect(runtime.interactions.state).toBe('settling')
        expect(runtime.interactions.stats).toMatchObject({ pets: 0, drags: 1, drops: 1 })
    })

    it('drops to the ledge below and stays put for the settle interval', () => {
        const { hit } = mount()
        const start = center()

        pointer(hit, 'pointerdown', start)
        pointer(hit, 'pointermove', { x: start.x + 100, y: start.y - 150 })
        pointer(hit, 'pointerup', { x: start.x + 100, y: start.y - 150 })

        frames.step(16, 90)

        const landed = runtime.creature.placement

        expect(landed).toMatchObject({ surfaceId: 'floor', hop: null, y: 276 })
        expect(['idle', 'sleep']).toContain(runtime.creature.action)

        // Settling lasts at least 10 seconds: no wandering off in the meantime.
        frames.step(100, 80)

        expect(runtime.creature.placement.x).toBe(landed.x)
    })

    it('keeps the creature inside the viewport while carried', () => {
        const { hit } = mount()

        pointer(hit, 'pointerdown', center())
        pointer(hit, 'pointermove', { x: -500, y: -500 })

        expect(runtime.creature.position).toEqual({ x: 0, y: 0 })
    })

    it.each(['pointercancel', 'lostpointercapture'])('recovers from %s mid-drag', (type) => {
        const { hit, captured } = mount()

        pointer(hit, 'pointerdown', center())
        pointer(hit, 'pointermove', { x: 200, y: 100 })
        pointer(hit, type, { x: 200, y: 100 })

        expect(runtime.interactions.state).toBe('settling')
        expect(runtime.creature.mode).toBe('auto')
        expect(captured.size).toBe(0)

        frames.step(16, 90)

        expect(runtime.creature.placement).toMatchObject({ surfaceId: 'floor', hop: null })
    })

    it.each([
        ['navigation', () => runtime.cancelInteractions('navigation')],
        ['a hidden tab', () => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
            document.dispatchEvent(new Event('visibilitychange'))
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        }],
        ['teardown', () => runtime.destroy()],
    ])('releases a carried creature on %s', (_, interrupt) => {
        const { hit, captured } = mount()
        const interactions = runtime.interactions

        pointer(hit, 'pointerdown', center())
        pointer(hit, 'pointermove', { x: 200, y: 100 })
        interrupt()

        expect(interactions.state).not.toBe('carried')
        expect(interactions.press).toBeNull()
        expect(captured.size).toBe(0)
    })

    it('swallows the click that follows a press', () => {
        const { hit } = mount()
        const pageClick = vi.fn()

        document.addEventListener('click', pageClick)
        hit.click()

        expect(pageClick).not.toHaveBeenCalled()
        document.removeEventListener('click', pageClick)
    })

    it('ignores non-primary buttons', () => {
        const { hit } = mount()

        pointer(hit, 'pointerdown', { ...center(), button: 2 })

        expect(runtime.interactions.state).toBe('idle')
    })

    it('disables the hit target while the creature overlaps a control', () => {
        setRect(element('<button>Save</button>'), { left: 90, top: 270, width: 40, height: 20 })
        const { hit } = mount()

        runtime.creature.placement = { ...runtime.creature.placement, offset: 100 }
        runtime.creature.behavior.transition('walk', { duration: 100 })
        frames.step(16, 10)

        expect(hit.style.pointerEvents).toBe('none')
    })

    it('hesitates when the pointer arrives while walking', () => {
        const { hit } = mount()

        runtime.creature.behavior.transition('walk', { duration: 100 })
        runtime.creature.intent = runtime.creature.behavior.intent
        pointer(hit, 'pointerenter', center())

        expect(runtime.creature.intent.action).toBe('idle')
    })
})

describe('runtime safety controls', () => {
    beforeEach(() => {
        setViewport(400, 300)
        setReducedMotion(false)
        localStorage.clear()
    })

    afterEach(() => {
        runtime?.destroy()
        document.body.innerHTML = ''
    })

    it('hides on request, persists per panel, and stays hidden after remounting', () => {
        mount()
        runtime.toggleHidden()

        expect(runtime.state).toBe('paused')
        expect(runtime.overlay.classList.contains('critters-overlay--hidden')).toBe(true)
        expect(runtime.creature.renderer.hit.style.pointerEvents).toBe('none')
        expect(localStorage.getItem('critters:admin:hidden')).toBe('1')

        runtime.destroy()
        mount()

        expect(runtime.hidden).toBe(true)

        runtime.toggleHidden()

        expect(runtime.state).toBe('running')
        expect(localStorage.getItem('critters:admin:hidden')).toBeNull()
    })

    it('announces hide and pet changes in a status region outside the hidden stage', async () => {
        vi.useFakeTimers()
        mount()
        runtime.toggleHidden()
        vi.advanceTimersByTime(100)

        const status = document.querySelector('[role="status"]')

        expect(status.textContent).toBe('Critters hidden.')
        expect(status.closest('[aria-hidden="true"]')).toBeNull()

        runtime.toggleHidden()
        runtime.pet()
        vi.advanceTimersByTime(100)

        expect(status.textContent).toBe('You petted the cat.')
        vi.useRealTimers()
    })

    it('hides behind open overlays, cancelling any drag, and pets once they close', () => {
        const { hit } = mount()

        pointer(hit, 'pointerdown', center())
        pointer(hit, 'pointermove', { x: 200, y: 100 })

        const dialog = element('<dialog open></dialog>')

        runtime.checkObstructions()

        expect(runtime.obstructed).toBe(true)
        expect(runtime.interactions.state).toBe('settling')
        expect(runtime.overlay.classList.contains('critters-overlay--obstructed')).toBe(true)

        runtime.pet()

        expect(runtime.interactions.stats.pets).toBe(0)

        dialog.removeAttribute('open')
        runtime.checkObstructions()

        expect(runtime.state).toBe('running')
        expect(runtime.interactions.stats.pets).toBe(1)
    })

    it('moves away when a control it covers receives focus', () => {
        mount()

        const input = setRect(element('<input>'), { left: 105, top: 270, width: 100, height: 20 })

        input.focus()

        expect(runtime.creature.intent).toMatchObject({ action: 'walk', direction: -1 })
    })

    it('does not mount on touch-only devices unless enabled', () => {
        const touch = { matches: true, addEventListener() {}, removeEventListener() {} }
        const original = window.matchMedia

        window.matchMedia = (media) => (media.includes('pointer: coarse') ? touch : original(media))
        ;({ runtime } = makeRuntime())
        runtime.mount({ ...config, touch: false })

        expect(runtime.state).toBe('idle')
        expect(runtime.stats.skippedTouch).toBe(1)

        runtime.mount({ ...config, touch: true })

        expect(runtime.state).toBe('mounted')
        window.matchMedia = original
    })

    it('lets reduced-motion users pet and drag without starting a loop', () => {
        vi.useFakeTimers()
        setReducedMotion(true)
        const { hit } = mount()

        expect(runtime.state).toBe('static')

        pointer(hit, 'pointerdown', center())
        pointer(hit, 'pointerup', center())

        expect(runtime.creature.action).toBe('pet')
        expect(frames.pending).toBe(0)

        vi.advanceTimersByTime(1300)

        expect(runtime.creature.action).toBe('sleep')

        pointer(hit, 'pointerdown', center())
        pointer(hit, 'pointermove', { x: 200, y: 100 })
        pointer(hit, 'pointerup', { x: 200, y: 100 })

        expect(runtime.creature.placement).toMatchObject({ surfaceId: 'floor', hop: null, y: 276 })
        expect(frames.pending).toBe(0)
        vi.useRealTimers()
    })
})
