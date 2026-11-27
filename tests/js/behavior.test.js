import { describe, expect, it } from 'vitest'
import { WanderBehavior } from '../../resources/js/behaviors/WanderBehavior.js'
import { createRandom } from '../../resources/js/runtime/random.js'

describe('WanderBehavior', () => {
    it('starts idle', () => {
        const behavior = new WanderBehavior({ random: createRandom(1) })

        expect(behavior.start().action).toBe('idle')
    })

    it('only moves between defined actions using the weighted table', () => {
        const behavior = new WanderBehavior({ random: createRandom(7) })
        const seen = new Set()
        const transitions = new Set()
        let previous = behavior.start().action

        for (let i = 0; i < 20000; i++) {
            const { action } = behavior.update(0.5)

            if (action !== previous) {
                transitions.add(`${previous}->${action}`)
            }

            seen.add(action)
            previous = action
        }

        expect([...seen].sort()).toEqual(['idle', 'sleep', 'walk'])
        // Sleep always wakes into idle, never straight into walking.
        expect(transitions.has('sleep->walk')).toBe(false)
    })

    it('spends time in proportion to the weights and durations', () => {
        const behavior = new WanderBehavior({ random: createRandom(3) })
        const time = { walk: 0, idle: 0, sleep: 0 }

        behavior.start()

        for (let i = 0; i < 100000; i++) {
            time[behavior.update(0.1).action] += 0.1
        }

        const total = time.walk + time.idle + time.sleep

        for (const action of Object.keys(time)) {
            expect(time[action] / total).toBeGreaterThan(0.15)
        }
    })

    it('turns around when blocked', () => {
        const behavior = new WanderBehavior({ random: createRandom(1) })

        behavior.transition('walk')
        behavior.blocked('right')

        expect(behavior.intent.direction).toBe(-1)

        behavior.blocked('left')

        expect(behavior.intent.direction).toBe(1)
    })

    it('ignores unknown actions and honors forced durations', () => {
        const behavior = new WanderBehavior({ random: createRandom(1) })

        behavior.transition('sleep', { duration: 2 })
        behavior.transition('fly')

        expect(behavior.update(1.5).action).toBe('sleep')
        expect(behavior.update(1).action).toBe('idle')
    })

    it('is deterministic for a seed', () => {
        const run = () => {
            const behavior = new WanderBehavior({ random: createRandom(42) })
            behavior.start()

            return Array.from({ length: 200 }, () => behavior.update(0.5).action).join()
        }

        expect(run()).toBe(run())
    })
})
