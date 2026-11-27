import { FrameClock, resolveAnimation } from './skin.js'

export class CreatureInstance {
    constructor({ definition, behavior, environment, renderer, random }) {
        this.definition = definition
        this.behavior = behavior
        this.environment = environment
        this.renderer = renderer
        this.random = random
        this.clock = new FrameClock()
        this.size = { width: definition.width, height: definition.height }
        this.placement = environment.place(this.size, random)
        this.intent = behavior.start()
        this.action = this.intent.action
        /** 'auto' (behavior drives), 'carried' (pointer drives) or 'reacting' (playing a reaction). */
        this.mode = 'auto'
        this.reaction = null
    }

    get position() {
        return { x: this.placement.x, y: this.placement.y }
    }

    update(delta) {
        if (this.mode === 'carried') {
            return this.draw(delta)
        }

        if (this.mode === 'reacting') {
            this.reaction.remaining -= delta

            if (this.reaction.remaining > 0) {
                return this.draw(delta)
            }

            this.endReaction()
        }

        this.intent = this.behavior.update(delta)

        if (this.intent.action === 'walk') {
            this.considerHop({ delta, blocked: false })
        }

        const result = this.environment.step(this.placement, this.intent, this.definition.speed, delta, this.size)

        this.placement = result.placement

        if (result.blocked && !this.considerHop({ delta, blocked: true })) {
            this.behavior.blocked(result.blocked)
        }

        this.action = result.action
        this.draw(delta, result.direction)
    }

    /** Lets the behavior decide whether to take one of the hops the environment offers. */
    considerHop({ delta, blocked }) {
        const options = this.environment.hopOptions(this.placement, this.size, this.intent.direction)

        if (!options.length) return false

        const choice = this.behavior.chooseHop?.(
            options.map(({ rise, x }) => ({ rise, distance: x - this.placement.x })),
            { delta, blocked },
        )

        if (choice === null || choice === undefined) return false

        this.placement = this.environment.startHop(this.placement, options[choice], this.size)

        return true
    }

    /** Hops to a specific ledge when it is within reach. Returns whether a hop started. */
    hopTo(surfaceId) {
        const option = [1, -1]
            .flatMap((direction) => this.environment.hopOptions(this.placement, this.size, direction))
            .find((candidate) => candidate.surfaceId === surfaceId)

        if (!option) return false

        this.placement = this.environment.startHop(this.placement, option, this.size)

        return true
    }

    /** Plays a reaction (e.g. `pet`) in place, suspending autonomous behavior. */
    react(action, duration) {
        if (this.mode === 'carried') return

        this.mode = 'reacting'
        this.reaction = { action, remaining: duration }
        this.action = action
    }

    endReaction() {
        this.mode = 'auto'
        this.reaction = null
        this.intent = this.behavior.transition('idle')
    }

    pickUp() {
        this.mode = 'carried'
        this.reaction = null
        this.placement = { ...this.placement, hop: null }
        this.action = 'carried'
    }

    /** Follows the pointer while carried. Coordinates are the creature's top-left corner. */
    carryTo(x, y) {
        const viewport = this.environment.viewport ?? { width: Infinity, height: Infinity }

        this.placement = {
            ...this.placement,
            x: Math.min(Math.max(x, 0), viewport.width - this.size.width),
            y: Math.min(Math.max(y, 0), viewport.height - this.size.height),
        }
    }

    /** Releases a carried creature: it drops onto the nearest ledge below, then stays put a while. */
    drop(stay) {
        this.mode = 'auto'
        this.placement = this.environment.fall(this.placement, this.size)
        this.action = 'fall'
        this.intent = this.behavior.transition(this.random.next() < 0.7 ? 'idle' : 'sleep', { duration: stay })
    }

    /** Hurries off a control that just received keyboard focus. */
    moveAway(rect) {
        if (this.mode !== 'auto') return

        const center = this.placement.x + this.size.width / 2
        const direction = center < (rect.left + rect.right) / 2 ? -1 : 1

        this.intent = this.behavior.transition('walk', { duration: 2.5 })
        this.behavior.direction = direction
        this.intent = this.behavior.intent
    }

    /** Shows one still frame of an action without autonomous movement (reduced motion). */
    still(action = 'sleep') {
        this.placement = this.environment.constrain(this.placement, this.size)

        if (this.placement.hop) {
            this.placement = this.environment.step(this.placement, this.intent, 0, this.placement.hop.duration, this.size).placement
        }

        this.action = action
        this.clock.play(resolveAnimation(this.definition.skin, action))
        this.render(this.intent.direction)
    }

    draw(delta, direction = this.intent.direction) {
        this.clock.play(resolveAnimation(this.definition.skin, this.action))
        this.clock.advance(delta)
        this.render(direction)
    }

    render(direction) {
        this.renderer.render({
            position: this.position,
            direction,
            frame: this.clock.frame,
            action: this.action,
            surface: this.placement.hop ? null : this.placement.surfaceId,
        })
    }

    destroy() {
        this.renderer.destroy()
    }
}
