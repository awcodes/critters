/**
 * Picks what a creature intends to do next. It never touches the DOM: the environment
 * decides where that intent actually takes the creature.
 */
export class WanderBehavior {
    static actions = {
        walk: { duration: [3, 8], next: { idle: 0.6, walk: 0.25, sleep: 0.15 } },
        idle: { duration: [2, 6], next: { walk: 0.6, sleep: 0.25, idle: 0.15 } },
        sleep: { duration: [10, 25], next: { idle: 1 } },
    }

    constructor({ random, actions = WanderBehavior.actions } = {}) {
        this.random = random
        this.actions = actions
        this.action = 'idle'
        this.direction = 1
        this.remaining = 0
    }

    start() {
        this.transition('idle')

        return this.intent
    }

    get intent() {
        return { action: this.action, direction: this.direction }
    }

    update(delta) {
        this.remaining -= delta

        if (this.remaining <= 0) {
            this.transition(this.random.pick(this.actions[this.action].next))
        }

        return this.intent
    }

    transition(action, { duration } = {}) {
        const definition = this.actions[action]

        if (!definition) {
            return this.intent
        }

        if (action === 'walk' && this.action === 'walk') {
            this.direction *= -1
        } else if (action === 'walk' && this.action !== 'walk' && this.random.next() < 0.5) {
            this.direction *= -1
        }

        this.action = action
        this.remaining = duration ?? this.random.between(...definition.duration)

        return this.intent
    }

    /** The environment reports when movement is blocked so the creature turns around. */
    blocked(side) {
        this.direction = side === 'left' ? 1 : -1
    }
}
