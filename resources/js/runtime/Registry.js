import { validateSkin } from './skin.js'

export class Registry {
    constructor() {
        this.creatures = new Map()
        this.behaviors = new Map()
    }

    registerCreature(name, definition) {
        const errors = validateSkin(definition?.skin)

        if (errors.length) {
            throw new Error(`Critters: creature "${name}" has an invalid skin. ${errors.join(' ')}`)
        }

        this.creatures.set(name, { speed: 40, behavior: 'wander', ...definition, name })

        return this
    }

    registerBehavior(name, Behavior) {
        this.behaviors.set(name, Behavior)

        return this
    }

    creature(name) {
        return this.creatures.get(name) ?? null
    }

    behavior(name) {
        return this.behaviors.get(name) ?? null
    }
}
