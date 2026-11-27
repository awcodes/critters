import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { builtInCreatures } from '../../resources/js/creatures/builtins.js'
import { resolveAnimation, validateSkin } from '../../resources/js/runtime/skin.js'

const names = ['cat', 'dog', 'lizard', 'fish', 'sparky', 'atlas', 'barney']

describe('built-in creatures', () => {
    it('ships all seven', () => {
        expect(Object.keys(builtInCreatures)).toEqual(names)
    })

    describe.each(names)('%s', (name) => {
        const creature = builtInCreatures[name]
        const moving = name === 'fish' ? 'swim' : 'walk'

        it('has a valid 14-frame skin provided by its stylesheet', () => {
            expect(validateSkin(creature.skin)).toEqual([])
            expect(creature.skin.frameCount).toBe(14)
            expect(creature.skin.className).toBe(`critters-skin-${name}`)
            expect(readFileSync(`resources/css/creatures/${name}.css`, 'utf8')).toContain(`.critters-skin-${name}`)
        })

        it('uses every frame and has its own pet and carried poses', () => {
            const used = new Set(Object.values(creature.skin.animations).flatMap((a) => a.frames))

            expect([...used].sort((a, b) => a - b)).toEqual([...Array(14).keys()])

            for (const action of [moving, 'idle', 'sleep', 'pet', 'carried']) {
                expect(resolveAnimation(creature.skin, action).name).toBe(action)
            }
        })

        it('keeps every hitbox inside the display box', () => {
            for (const box of Object.values(creature.hitboxes)) {
                expect(box.x).toBeGreaterThanOrEqual(0)
                expect(box.y).toBeGreaterThanOrEqual(0)
                expect(box.x + box.width).toBeLessThanOrEqual(creature.width)
                expect(box.y + box.height).toBeLessThanOrEqual(creature.height)
            }
        })

        it('is drawn at the same pixel scale as the others', () => {
            expect(creature.width / creature.skin.frameWidth).toBeCloseTo(2 / 3, 2)
        })
    })
})
