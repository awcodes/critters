import { BaseEnvironment } from './BaseEnvironment.js'

const MOVING = new Set(['swim', 'walk'])
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

/**
 * The ambient environment: creatures move freely in two dimensions inside one region
 * (an aquarium is just an ambient region). It never discovers or uses panel surfaces.
 *
 * The region is `config.region` (a selector), else the first `[data-critters-region]`.
 * With no selector and no marked region, the viewport is the region. When a configured
 * region is missing, creatures are hidden until it appears.
 *
 * A placement is { surfaceId: 'region', offset, offsetY, x, y, hop, hidden }, with offsets
 * relative to the region's top-left corner so creatures move with a scrolling region.
 */
export class AmbientEnvironment extends BaseEnvironment {
    constructor({ region = null, inset = 8, ...options } = {}) {
        super(options)
        this.regionSelector = region
        this.inset = inset
        this.regionElement = null
        this.bounds = null
    }

    destroy() {
        super.destroy()
        this.regionElement = null
        this.bounds = null
    }

    discover() {
        this.regionElement = this.doc.querySelector(this.regionSelector ?? '[data-critters-region]')
        this.observeElements(this.regionElement ? [this.regionElement] : [])
        this.needsDiscovery = false
        this.discoveries++
    }

    measure() {
        this.measureViewport()

        if (this.needsDiscovery || (this.regionElement && !this.regionElement.isConnected)) this.discover()

        this.bounds = this.regionBounds()
        this.dirty = false
        this.measurements++
    }

    regionBounds() {
        const el = this.regionElement

        if (!el) {
            return this.regionSelector ? null : { left: 0, top: 0, right: this.viewport.width, bottom: this.viewport.height }
        }

        if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return null

        const rect = el.getBoundingClientRect()

        if (rect.width <= 0 || rect.height <= 0) return null

        return { left: rect.left + this.inset, top: rect.top + this.inset, right: rect.right - this.inset, bottom: rect.bottom - this.inset }
    }

    place(size, random) {
        this.ensureMeasured(size)

        if (!this.bounds) return { surfaceId: 'region', offset: 0, offsetY: 0, x: -size.width, y: -size.height, hop: null, hidden: true }

        const { left, top, right, bottom } = this.bounds

        return this.anchor(
            {
                surfaceId: 'region',
                offset: random.next() * Math.max(right - left - size.width, 0),
                offsetY: random.next() * Math.max(bottom - top - size.height, 0),
                hop: null,
            },
            size,
        )
    }

    anchor(placement, size) {
        if (!this.bounds) return { ...placement, hidden: true }

        const { left, top, right, bottom } = this.bounds
        const x = clamp(left + placement.offset, left, right - size.width)
        const y = clamp(top + placement.offsetY, top, bottom - size.height)

        return { ...placement, surfaceId: 'region', offset: x - left, offsetY: y - top, x, y, hidden: false }
    }

    constrain(placement, size) {
        this.ensureMeasured(size)

        return placement.hop ? placement : this.anchor(placement, size)
    }

    /**
     * Released creatures glide back to the nearest point inside the region, so a drop
     * outside the tank never strands the fish there.
     */
    fall(placement, size) {
        this.ensureMeasured(size)

        if (!this.bounds) return { ...placement, hop: null, hidden: true }

        const { left, top } = this.bounds
        const target = this.anchor({ offset: placement.x - left, offsetY: placement.y - top }, size)
        const distance = Math.hypot(target.x - placement.x, target.y - placement.y)

        return {
            ...placement,
            hop: { kind: 'swim', from: { x: placement.x, y: placement.y }, offset: target.offset, offsetY: target.offsetY, elapsed: 0, duration: 0.3 + distance / 600 },
        }
    }

    step(placement, intent, speed, delta, size) {
        this.ensureMeasured(size)

        if (!this.bounds) {
            return { placement: { ...placement, hidden: true }, action: intent.action, direction: intent.direction, blocked: null, landed: false }
        }

        if (placement.hop) return this.stepGlide(placement, delta, size, intent)

        let { offset, offsetY } = this.anchor(placement, size)
        let blocked = null

        if (MOVING.has(intent.action)) {
            const { left, top, right, bottom } = this.bounds
            const maxX = right - left - size.width
            const maxY = bottom - top - size.height

            offset += intent.direction * speed * delta
            offsetY += (intent.vertical ?? 0) * speed * delta

            if (offset <= 0 && intent.direction < 0) blocked = 'left'
            else if (offset >= maxX && intent.direction > 0) blocked = 'right'
            else if (offsetY <= 0 && intent.vertical < 0) blocked = 'top'
            else if (offsetY >= maxY && intent.vertical > 0) blocked = 'bottom'
        }

        return { placement: this.anchor({ ...placement, offset, offsetY }, size), action: intent.action, direction: intent.direction, blocked, landed: false }
    }

    stepGlide(placement, delta, size, intent) {
        const hop = { ...placement.hop, elapsed: placement.hop.elapsed + delta }
        const t = Math.min(hop.elapsed / hop.duration, 1)
        const to = this.anchor({ offset: hop.offset, offsetY: hop.offsetY }, size)
        const direction = to.x === hop.from.x ? intent.direction : Math.sign(to.x - hop.from.x)

        if (t >= 1) return { placement: { ...to, hop: null }, action: 'swim', direction, blocked: null, landed: true }

        return {
            placement: { ...placement, hop, x: hop.from.x + (to.x - hop.from.x) * t, y: hop.from.y + (to.y - hop.from.y) * t, hidden: false },
            action: 'swim',
            direction,
            blocked: null,
            landed: false,
        }
    }

    describe() {
        return { region: this.bounds, ledges: [], measurements: this.measurements, discoveries: this.discoveries }
    }
}
