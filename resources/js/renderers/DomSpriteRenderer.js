/**
 * Draws one creature as a single element showing a window into its sprite strip.
 * Writes styles only when something visible changed and never reads layout.
 */
export class DomSpriteRenderer {
    constructor({ doc = document, container, definition }) {
        const { skin, width, height } = definition

        this.definition = definition
        this.last = {}
        this.el = doc.createElement('div')
        this.el.className = 'critters-creature'
        this.el.dataset.crittersCreature = definition.name
        Object.assign(this.el.style, {
            width: `${width}px`,
            height: `${height}px`,
            backgroundSize: `${skin.frameCount * width}px ${height}px`,
        })

        if (skin.className) {
            this.el.classList.add(skin.className)
        } else {
            this.el.style.backgroundImage = `url("${skin.src}")`
        }

        this.hit = doc.createElement('div')
        this.hit.className = 'critters-hit'
        this.hit.dataset.crittersHit = definition.name
        this.el.appendChild(this.hit)
        this.hitEnabled = null
        this.setHitEnabled(false)

        container.appendChild(this.el)
    }

    /** The visible footprint for an action, in display pixels relative to the creature box. */
    hitbox(action) {
        const boxes = this.definition.hitboxes ?? {}

        return boxes[action] ?? boxes.idle ?? { x: 0, y: 0, width: this.definition.width, height: this.definition.height }
    }

    /** The current hitbox in viewport coordinates, accounting for mirroring. */
    hitRect(position, action, direction) {
        const box = this.hitbox(action)
        const facing = this.definition.skin.facing === 'left' ? -direction : direction
        const x = facing < 0 ? this.definition.width - box.x - box.width : box.x

        return { left: position.x + x, top: position.y + box.y, right: position.x + x + box.width, bottom: position.y + box.y + box.height }
    }

    setHitEnabled(enabled) {
        if (enabled === this.hitEnabled) return

        this.hit.style.pointerEvents = enabled ? 'auto' : 'none'
        this.hit.dataset.crittersHitEnabled = enabled ? 'true' : 'false'
        this.hitEnabled = enabled
    }

    /** A small floating heart: the lightweight response when a skin has no `pet` frames. */
    burst(container, position, { animate = true } = {}) {
        const heart = this.el.ownerDocument.createElement('div')

        heart.className = animate ? 'critters-heart' : 'critters-heart critters-heart--still'
        heart.textContent = '♥'
        heart.style.transform = `translate3d(${(position.x + this.definition.width / 2 - 6).toFixed(1)}px, ${(position.y + this.hitbox('idle').y - 14).toFixed(1)}px, 0)`
        container.appendChild(heart)

        const remove = () => heart.remove()

        heart.addEventListener('animationend', remove, { once: true })
        setTimeout(remove, 1500)

        return heart
    }

    render({ position, direction, frame, action, surface = null, hidden = false }) {
        if (hidden !== this.last.hidden) {
            this.el.style.visibility = hidden ? 'hidden' : ''
            this.last.hidden = hidden
        }

        const facing = this.definition.skin.facing === 'left' ? -direction : direction
        const transform = `translate3d(${position.x.toFixed(1)}px, ${position.y.toFixed(1)}px, 0) scaleX(${facing})`

        if (transform !== this.last.transform) {
            this.el.style.transform = transform
            this.last.transform = transform
        }

        if (frame !== this.last.frame) {
            this.el.style.backgroundPosition = `${-frame * this.definition.width}px 0`
            this.el.dataset.crittersFrame = frame
            this.last.frame = frame
        }

        if (surface !== this.last.surface) {
            surface === null ? delete this.el.dataset.crittersSurfaceId : (this.el.dataset.crittersSurfaceId = surface)
            this.last.surface = surface
        }

        if (action !== this.last.action) {
            this.el.dataset.crittersAction = action
            this.last.action = action

            const box = this.hitbox(action)

            Object.assign(this.hit.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` })
        }
    }

    destroy() {
        this.el.remove()
    }
}
