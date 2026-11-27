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
            backgroundImage: `url("${skin.src}")`,
            backgroundSize: `${skin.frameCount * width}px ${height}px`,
        })

        container.appendChild(this.el)
    }

    render({ position, direction, frame, action, surface = null }) {
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
        }
    }

    destroy() {
        this.el.remove()
    }
}
