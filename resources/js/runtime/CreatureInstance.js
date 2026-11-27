import { FrameClock, resolveAnimation } from './skin.js'

export class CreatureInstance {
    constructor({ definition, behavior, environment, renderer, random }) {
        this.definition = definition
        this.behavior = behavior
        this.environment = environment
        this.renderer = renderer
        this.clock = new FrameClock()
        this.size = { width: definition.width, height: definition.height }
        this.position = environment.place(this.size, random)
        this.intent = behavior.start()
    }

    update(delta) {
        this.intent = this.behavior.update(delta)

        const { position, blocked } = this.environment.step(this.position, this.intent, this.definition.speed, delta, this.size)

        this.position = position

        if (blocked) {
            this.behavior.blocked(blocked)
            this.intent = this.behavior.intent
        }

        this.draw(delta)
    }

    /** Shows one still frame of an action without autonomous movement (reduced motion). */
    still(action = 'sleep') {
        this.position = this.environment.constrain(this.position, this.size)
        this.intent = { ...this.intent, action }
        this.clock.play(resolveAnimation(this.definition.skin, action))
        this.renderer.render({ position: this.position, direction: this.intent.direction, frame: this.clock.frame, action })
    }

    draw(delta) {
        this.clock.play(resolveAnimation(this.definition.skin, this.intent.action))
        this.renderer.render({
            position: this.position,
            direction: this.intent.direction,
            frame: this.clock.advance(delta),
            action: this.intent.action,
        })
    }

    destroy() {
        this.renderer.destroy()
    }
}
