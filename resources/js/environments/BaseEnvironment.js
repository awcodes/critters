import { measureUnsafe } from '../navigation/SurfaceDiscovery.js'

/** Unsafe-region measurements are reused while invalidations keep arriving (e.g. scrolling). */
const UNSAFE_QUIET_MS = 150

/**
 * What every environment shares: batched invalidation (scroll, resize, DOM changes,
 * finished transitions), one-measurement-per-frame bookkeeping, and the geometry of
 * visible interactive elements that creatures must never block.
 *
 * Subclasses implement `measure(size)` and may override `discover()`.
 */
export class BaseEnvironment {
    constructor({ win = window, doc = document, now = () => win.performance.now() } = {}) {
        this.win = win
        this.doc = doc
        this.now = now
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

        // Layout can settle without resizing anything we observe: Filament fades the main
        // container in from `opacity: 0`, and sidebar collapse slides content over. A finished
        // CSS transition or animation (other than our own) is a cheap signal to re-measure.
        const onSettled = (event) => {
            if (!event.target.closest?.('[data-critters-overlay]')) this.invalidate()
        }

        for (const type of ['transitionend', 'animationend']) {
            this.doc.addEventListener(type, onSettled, scrollOptions)
            this.cleanups.push(() => this.doc.removeEventListener(type, onSettled, scrollOptions))
        }

        if (this.doc.readyState !== 'complete') {
            this.win.addEventListener('load', onScroll, { once: true })
            this.cleanups.push(() => this.win.removeEventListener('load', onScroll))
        }

        this.doc.fonts?.ready.then(() => this.cleanups.length && this.invalidate())

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
    }

    invalidate({ rediscover = false } = {}) {
        this.dirty = true
        this.unsafeStale = true
        this.invalidatedAt = this.now()

        if (rediscover) this.needsDiscovery = true
    }

    measureViewport() {
        const root = this.doc.documentElement

        this.viewport = { width: root.clientWidth || this.win.innerWidth, height: root.clientHeight || this.win.innerHeight }

        return this.viewport
    }

    /** Re-targets the resize observer at the elements whose size matters right now. */
    observeElements(elements) {
        if (!this.resizeObserver) return

        this.resizeObserver.disconnect()
        this.resizeObserver.observe(this.doc.documentElement)
        elements.forEach((el) => this.resizeObserver.observe(el))
    }

    ensureMeasured(size) {
        if (this.dirty || !this.viewport) this.measure(size)
    }

    unsafeRegions() {
        const quiet = this.now() - this.invalidatedAt >= UNSAFE_QUIET_MS

        if (!this.unsafe || (this.unsafeStale && quiet)) {
            this.unsafe = measureUnsafe(this.doc, this.viewport)
            this.unsafeStale = false
        }

        return this.unsafe
    }

    /** Refreshes interactive-element geometry if it's due; true when it is current. */
    hasFreshUnsafe() {
        this.unsafeRegions()

        return !this.unsafeStale
    }

    /** Environments without ledges offer no hops. */
    hopOptions() {
        return []
    }
}
