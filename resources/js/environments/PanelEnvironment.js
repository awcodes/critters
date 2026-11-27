/**
 * Stage A of the panel environment: creatures walk along the bottom of the viewport.
 * Geometry is measured only when invalidated, never inside the per-frame update.
 */
export class PanelEnvironment {
    constructor({ win = window, doc = document, inset = 4 } = {}) {
        this.win = win
        this.doc = doc
        this.inset = inset
        this.bounds = null
        this.dirty = true
        this.measurements = 0
    }

    invalidate() {
        this.dirty = true
    }

    measure() {
        const root = this.doc.documentElement

        this.bounds = {
            left: 0,
            right: root.clientWidth || this.win.innerWidth,
            floor: (root.clientHeight || this.win.innerHeight) - this.inset,
        }
        this.dirty = false
        this.measurements++

        return this.bounds
    }

    ensureMeasured() {
        return this.dirty || !this.bounds ? this.measure() : this.bounds
    }

    place(size, random) {
        const { left, right, floor } = this.ensureMeasured()
        const span = Math.max(right - left - size.width, 0)

        return { x: left + random.next() * span, y: floor - size.height }
    }

    /** Keeps a position on the floor and inside the viewport after the viewport changes. */
    constrain(position, size) {
        const { left, right, floor } = this.ensureMeasured()

        return {
            x: Math.min(Math.max(position.x, left), Math.max(right - size.width, left)),
            y: floor - size.height,
        }
    }

    step(position, intent, speed, delta, size) {
        const { left, right } = this.ensureMeasured()
        const maxX = Math.max(right - size.width, left)
        let x = position.x
        let blocked = null

        if (intent.action === 'walk') {
            x += intent.direction * speed * delta
        }

        if (x <= left) {
            x = left
            blocked = intent.action === 'walk' && intent.direction < 0 ? 'left' : null
        } else if (x >= maxX) {
            x = maxX
            blocked = intent.action === 'walk' && intent.direction > 0 ? 'right' : null
        }

        return { position: this.constrain({ x, y: position.y }, size), blocked }
    }
}
