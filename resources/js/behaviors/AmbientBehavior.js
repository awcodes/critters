/**
 * Free two-dimensional movement for ambient creatures (fish): swim with a gentle vertical
 * drift, hover, or doze. Like every behavior it only states intent.
 */
export class AmbientBehavior {
    static actions = {
        swim: { duration: [4, 10], next: { swim: 0.35, idle: 0.5, sleep: 0.15 } },
        idle: { duration: [2, 5], next: { swim: 0.8, sleep: 0.2 } },
        sleep: { duration: [6, 15], next: { idle: 1 } },
    }

    movingAction = 'swim'

    constructor({ random, actions = AmbientBehavior.actions } = {}) {
        this.random = random
        this.actions = actions
        this.action = 'idle'
        this.direction = 1
        this.vertical = 0
        this.remaining = 0
    }

    start() {
        return this.transition('swim')
    }

    get intent() {
        return { action: this.action, direction: this.direction, vertical: this.action === 'swim' ? this.vertical : 0 }
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

        if (!definition) return this.intent

        if (action === 'swim') {
            if (this.random.next() < 0.4) this.direction *= -1

            this.vertical = (this.random.next() - 0.5) * 0.8
        }

        this.action = action
        this.remaining = duration ?? this.random.between(...definition.duration)

        return this.intent
    }

    blocked(side) {
        if (side === 'left') this.direction = 1
        if (side === 'right') this.direction = -1
        if (side === 'top') this.vertical = Math.abs(this.vertical)
        if (side === 'bottom') this.vertical = -Math.abs(this.vertical)
    }
}
