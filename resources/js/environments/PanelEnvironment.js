import { discoverSurfaces, measureOccluders, measureSurfaces, measureUnsafe } from '../navigation/SurfaceDiscovery.js'
import { clamp, HOP_LIMITS, hopTargets, nearestSafeX, safeIntervals, standingRange, supportBelow } from '../navigation/SurfaceGraph.js'

const RESTING = new Set(['idle', 'sleep'])

/** Unsafe-region measurements are reused while invalidations keep arriving (e.g. scrolling). */
const UNSAFE_QUIET_MS = 150

/**
 * The panel environment: creatures walk along the viewport floor and along measured
 * ledges (opted-in surfaces), hop between ledges within reach, and fall to the ledge
 * below when theirs disappears. Geometry is measured in one batch per frame, and only
 * after something invalidated it.
 *
 * A placement is { surfaceId, offset, x, y, hop }, where `offset` is the distance from
 * the ledge's left edge, so a creature rides along when its ledge moves.
 */
export class PanelEnvironment {
    constructor({ win = window, doc = document, inset = 4, adapter = {}, hopLimits = HOP_LIMITS, now = () => win.performance.now() } = {}) {
        this.win = win
        this.doc = doc
        this.inset = inset
        this.adapter = adapter
        this.hopLimits = hopLimits
        this.now = now
        this.candidates = []
        this.rejected = []
        this.ledges = new Map()
        this.viewport = null
        this.dirty = true
        this.needsDiscovery = true
        this.unsafe = null
        this.unsafeStale = true
        this.invalidatedAt = 0
        this.measurements = 0
        this.discoveries = 0
        this.cleanups = []
        this.resizeObserver = null
        this.bodyObserver = null
        this.observedBody = null
    }

    connect() {
        const onScroll = () => this.invalidate()
        const scrollOptions = { capture: true, passive: true }

        this.win.addEventListener('scroll', onScroll, scrollOptions)
        this.cleanups.push(() => this.win.removeEventListener('scroll', onScroll, scrollOptions))

        if (this.win.ResizeObserver) {
            this.resizeObserver = new this.win.ResizeObserver(() => this.invalidate())
            this.resizeObserver.observe(this.doc.documentElement)
        }

        this.observeBody()

        return this
    }

    /** Watches for elements being added or removed (Livewire morphs, Alpine toggles). */
    observeBody() {
        if (this.observedBody === this.doc.body || !this.win.MutationObserver) return

        this.bodyObserver?.disconnect()
        this.bodyObserver = new this.win.MutationObserver((records) => {
            if (records.some((record) => !record.target.closest?.('[data-critters-overlay]'))) {
                this.invalidate({ rediscover: true })
            }
        })
        this.bodyObserver.observe(this.doc.body, { childList: true, subtree: true })
        this.observedBody = this.doc.body
    }

    destroy() {
        this.cleanups.forEach((cleanup) => cleanup())
        this.cleanups = []
        this.resizeObserver?.disconnect()
        this.bodyObserver?.disconnect()
        this.resizeObserver = this.bodyObserver = this.observedBody = null
        this.candidates = []
        this.ledges.clear()
    }

    invalidate({ rediscover = false } = {}) {
        this.dirty = true
        this.unsafeStale = true
        this.invalidatedAt = this.now()

        if (rediscover) this.needsDiscovery = true
    }

    measure(size) {
        const root = this.doc.documentElement

        this.viewport = { width: root.clientWidth || this.win.innerWidth, height: root.clientHeight || this.win.innerHeight }

        if (this.needsDiscovery) this.discover()

        const occluders = measureOccluders(this.doc, this.adapter.occluders)
        const { measured, rejected } = measureSurfaces(this.candidates, { viewport: this.viewport, occluders, size })

        this.ledges = new Map([['floor', this.floor()], ...measured.map((ledge) => [ledge.id, ledge])])
        this.rejected = [...this.discoveryRejected, ...rejected]
        this.dirty = false
        this.measurements++
    }

    discover() {
        const { surfaces, rejected } = discoverSurfaces(this.doc, this.adapter)

        this.resizeObserver?.disconnect()
        this.resizeObserver?.observe(this.doc.documentElement)
        surfaces.forEach((surface) => this.resizeObserver?.observe(surface.element))

        this.candidates = surfaces
        this.discoveryRejected = rejected
        this.needsDiscovery = false
        this.discoveries++
    }

    floor() {
        return { id: 'floor', type: 'floor', left: 0, right: this.viewport.width, top: this.viewport.height - this.inset }
    }

    ensureMeasured(size) {
        if (this.dirty || !this.viewport) this.measure(size)
    }

    ledge(id) {
        return this.ledges.get(id) ?? null
    }

    unsafeRegions() {
        const quiet = this.now() - this.invalidatedAt >= UNSAFE_QUIET_MS

        if (!this.unsafe || (this.unsafeStale && quiet)) {
            this.unsafe = measureUnsafe(this.doc, this.viewport)
            this.unsafeStale = false
        }

        return this.unsafe
    }

    place(size, random) {
        this.ensureMeasured(size)

        const floor = this.ledge('floor')
        const [min, max] = standingRange(floor, size)

        return this.anchor({ surfaceId: 'floor', offset: random.next() * Math.max(max - min, 0), hop: null }, floor, size)
    }

    anchor(placement, ledge, size) {
        const [min, max] = standingRange(ledge, size)
        const x = clamp(ledge.left + placement.offset, min, max)

        return { ...placement, surfaceId: ledge.id, offset: x - ledge.left, x, y: ledge.top - size.height }
    }

    /** Re-anchors a placement after geometry changed, without autonomous movement. */
    constrain(placement, size) {
        this.ensureMeasured(size)

        if (placement.hop) return placement

        const ledge = this.ledge(placement.surfaceId)

        return ledge ? this.anchor(placement, ledge, size) : this.fall(placement, size)
    }

    hopOptions(placement, size, direction) {
        this.ensureMeasured(size)

        const from = this.ledge(placement.surfaceId)

        if (!from || placement.hop) return []

        return hopTargets([...this.ledges.values()], from, placement.x, size, direction, this.hopLimits)
    }

    startHop(placement, target, size, kind = 'hop') {
        const ledge = this.ledge(target.surfaceId)

        if (!ledge) return placement

        const landingOffset = target.x - ledge.left
        const rise = ledge.top - size.height - placement.y

        return {
            ...placement,
            hop: {
                kind,
                from: { x: placement.x, y: placement.y },
                surfaceId: ledge.id,
                offset: landingOffset,
                elapsed: 0,
                duration: 0.4 + Math.abs(rise) / 700,
                lift: kind === 'fall' ? 0 : Math.max(-rise, 0) * 0.35 + 24,
            },
        }
    }

    /** Graceful recovery when a creature's ledge (or hop target) disappears. */
    fall(placement, size) {
        const ledges = [...this.ledges.values()]
        const support = supportBelow(ledges, placement.x, placement.y + size.height, size) ?? this.ledge('floor')
        const [min, max] = standingRange(support, size)

        return this.startHop({ ...placement, hop: null }, { surfaceId: support.id, x: clamp(placement.x, min, max) }, size, 'fall')
    }

    step(placement, intent, speed, delta, size) {
        this.ensureMeasured(size)

        if (placement.hop) return this.stepHop(placement, delta, size, intent)

        const ledge = this.ledge(placement.surfaceId)

        if (!ledge) return this.stepHop(this.fall(placement, size), delta, size, intent)

        let { x } = this.anchor(placement, ledge, size)
        let action = intent.action
        let direction = intent.direction

        if (RESTING.has(action)) {
            const target = nearestSafeX(safeIntervals(ledge, this.unsafeRegions(), size), x)

            if (target === null) {
                // Nowhere on this ledge is safe to settle, so keep moving.
                action = 'walk'
            } else if (Math.abs(target - x) > 0.5) {
                action = 'walk'
                direction = Math.sign(target - x)
                x += direction * Math.min(speed * delta, Math.abs(target - x))

                return this.result({ ...placement, offset: x - ledge.left }, ledge, size, { action, direction, blocked: null })
            }
        }

        let blocked = null

        if (action === 'walk') {
            const [min, max] = standingRange(ledge, size)

            x += direction * speed * delta

            if (x <= min && direction < 0) blocked = 'left'
            if (x >= max && direction > 0) blocked = 'right'
        }

        return this.result({ ...placement, offset: x - ledge.left }, ledge, size, { action, direction, blocked })
    }

    stepHop(placement, delta, size, intent) {
        const hop = { ...placement.hop, elapsed: placement.hop.elapsed + delta }
        const target = this.ledge(hop.surfaceId)

        if (!target) {
            // The landing ledge vanished mid-flight: cancel and fall from where we are.
            const fallen = this.fall({ ...placement, hop: null }, size)

            return { placement: fallen, action: 'fall', direction: intent.direction, blocked: null, landed: false }
        }

        const t = Math.min(hop.elapsed / hop.duration, 1)
        const to = this.anchor({ offset: hop.offset }, target, size)
        const arc = 4 * t * (1 - t)
        const direction = to.x === hop.from.x ? intent.direction : Math.sign(to.x - hop.from.x)

        if (t >= 1) {
            return { placement: { ...to, hop: null }, action: hop.kind, direction, blocked: null, landed: true }
        }

        return {
            placement: {
                ...placement,
                hop,
                x: hop.from.x + (to.x - hop.from.x) * t,
                y: hop.from.y + (to.y - hop.from.y) * t - hop.lift * arc,
            },
            action: hop.kind,
            direction,
            blocked: null,
            landed: false,
        }
    }

    result(placement, ledge, size, { action, direction, blocked }) {
        return { placement: this.anchor(placement, ledge, size), action, direction, blocked, landed: false }
    }

    describe() {
        return {
            ledges: [...this.ledges.values()].map(({ id, type, source, left, right, top }) => ({ id, type, source, left, right, top })),
            rejected: this.rejected.map(({ id, reason }) => ({ id, reason })),
            measurements: this.measurements,
            discoveries: this.discoveries,
        }
    }
}
