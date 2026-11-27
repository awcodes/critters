import { describe, expect, it } from 'vitest'
import { FrameClock, MAX_FPS, resolveAnimation, validateSkin } from '../../resources/js/runtime/skin.js'
import { placeholderCat } from '../../resources/js/creatures/placeholderCat.js'
import { testSkin } from './helpers.js'

describe('validateSkin', () => {
    it('accepts the placeholder cat', () => {
        expect(validateSkin(placeholderCat.skin)).toEqual([])
    })

    it('requires an idle animation', () => {
        const skin = { ...testSkin, animations: { walk: testSkin.animations.walk } }

        expect(validateSkin(skin)).toContain('Skin must define an "idle" animation.')
    })

    it('reports frames outside the strip', () => {
        const skin = { ...testSkin, animations: { idle: { frames: [0, 6, -1] } } }

        expect(validateSkin(skin)).toContain('Animation "idle" references missing frames: 6, -1.')
    })

    it('needs either an image URL or a stylesheet class', () => {
        const { src, ...withoutSrc } = testSkin

        expect(validateSkin(withoutSrc)).toContain('Skin needs a "src" image URL or a "className" that provides the image.')
        expect(validateSkin({ ...withoutSrc, className: 'critters-skin-cat' })).toEqual([])
    })

    it('reports missing dimensions', () => {
        expect(validateSkin({ animations: { idle: { frames: [0] } } })).toContain('Skin is missing "frameWidth".')
    })
})

describe('resolveAnimation', () => {
    it('returns the requested animation when present', () => {
        expect(resolveAnimation(testSkin, 'walk')).toMatchObject({ name: 'walk', frames: [0, 1, 2, 3], fps: 8 })
    })

    it('falls back to idle for missing optional animations', () => {
        expect(resolveAnimation(testSkin, 'pet')).toMatchObject({ name: 'idle', requested: 'pet' })
        expect(resolveAnimation(testSkin, 'carried').name).toBe('idle')
    })

    it('falls back through chains (swim -> walk)', () => {
        expect(resolveAnimation(testSkin, 'swim').name).toBe('walk')
    })

    it('falls back to idle for unknown names', () => {
        expect(resolveAnimation(testSkin, 'moonwalk').name).toBe('idle')
    })

    it('caps frame rate', () => {
        const skin = { ...testSkin, animations: { idle: { frames: [0], fps: 60 } } }

        expect(resolveAnimation(skin, 'idle').fps).toBe(MAX_FPS)
    })
})

describe('FrameClock', () => {
    it('advances at the animation cadence regardless of display refresh', () => {
        const clock = new FrameClock()

        clock.play(resolveAnimation(testSkin, 'walk'))

        // 8 fps over 1.3 seconds of 120 Hz display frames is 10 sprite frames: index 2.
        for (let i = 0; i < 156; i++) {
            clock.advance(1 / 120)
        }

        expect(clock.index).toBe(2)

        // The same time in 60 Hz frames lands on the same sprite frame.
        const slow = new FrameClock()

        slow.play(resolveAnimation(testSkin, 'walk'))

        for (let i = 0; i < 78; i++) {
            slow.advance(1 / 60)
        }

        expect(slow.index).toBe(2)
    })

    it('restarts when the animation changes but not when replayed', () => {
        const clock = new FrameClock()

        clock.play(resolveAnimation(testSkin, 'walk'))
        clock.advance(0.3)
        clock.play(resolveAnimation(testSkin, 'walk'))

        expect(clock.index).toBe(2)

        clock.play(resolveAnimation(testSkin, 'sleep'))

        expect(clock.frame).toBe(5)
    })
})
