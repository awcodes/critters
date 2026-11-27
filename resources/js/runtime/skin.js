export const MIN_FPS = 1
export const MAX_FPS = 12

/**
 * Animations a skin may leave out, and what stands in for them. `idle` is the only
 * required animation; everything resolves to it eventually.
 */
export const ANIMATION_FALLBACKS = {
    walk: 'idle',
    swim: 'walk',
    sleep: 'idle',
    pet: 'idle',
    carried: 'idle',
}

export function validateSkin(skin) {
    const errors = []

    if (!skin || typeof skin !== 'object') {
        return ['Skin must be an object.']
    }

    for (const key of ['src', 'frameWidth', 'frameHeight', 'frameCount']) {
        if (!skin[key]) {
            errors.push(`Skin is missing "${key}".`)
        }
    }

    if (!skin.animations?.idle) {
        errors.push('Skin must define an "idle" animation.')
    }

    for (const [name, animation] of Object.entries(skin.animations ?? {})) {
        if (!Array.isArray(animation.frames) || animation.frames.length === 0) {
            errors.push(`Animation "${name}" has no frames.`)

            continue
        }

        const outOfRange = animation.frames.filter((frame) => !Number.isInteger(frame) || frame < 0 || frame >= skin.frameCount)

        if (outOfRange.length) {
            errors.push(`Animation "${name}" references missing frames: ${outOfRange.join(', ')}.`)
        }
    }

    return errors
}

export function resolveAnimation(skin, name) {
    let current = name
    const seen = new Set()

    while (current && !seen.has(current)) {
        if (skin.animations[current]) {
            const animation = skin.animations[current]

            return {
                name: current,
                requested: name,
                frames: animation.frames,
                fps: Math.min(Math.max(animation.fps ?? 6, MIN_FPS), MAX_FPS),
            }
        }

        seen.add(current)
        current = ANIMATION_FALLBACKS[current] ?? 'idle'
    }

    return resolveAnimation(skin, 'idle')
}

/** Advances sprite frames at the animation's own cadence, independent of display refresh. */
export class FrameClock {
    constructor() {
        this.animation = null
        this.index = 0
        this.elapsed = 0
    }

    play(animation) {
        if (this.animation?.name === animation.name && this.animation?.requested === animation.requested) {
            return
        }

        this.animation = animation
        this.index = 0
        this.elapsed = 0
    }

    advance(delta) {
        const duration = 1 / this.animation.fps

        this.elapsed += delta

        while (this.elapsed >= duration) {
            this.elapsed -= duration
            this.index = (this.index + 1) % this.animation.frames.length
        }

        return this.frame
    }

    get frame() {
        return this.animation.frames[this.index]
    }
}
