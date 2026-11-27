/**
 * One requestAnimationFrame loop shared by everything a runtime animates. Callbacks
 * receive elapsed seconds, clamped so a tab waking from suspension doesn't teleport
 * creatures across the screen.
 */
export class AnimationScheduler {
    constructor({ raf = (cb) => window.requestAnimationFrame(cb), caf = (id) => window.cancelAnimationFrame(id), maxDelta = 0.1 } = {}) {
        this.raf = raf
        this.caf = caf
        this.maxDelta = maxDelta
        this.callbacks = new Set()
        this.frameId = null
        this.lastTime = null
        this.ticks = 0
        this.tick = this.tick.bind(this)
    }

    get isRunning() {
        return this.frameId !== null
    }

    add(callback) {
        this.callbacks.add(callback)

        return () => this.callbacks.delete(callback)
    }

    start() {
        if (this.isRunning) {
            return
        }

        this.lastTime = null
        this.frameId = this.raf(this.tick)
    }

    stop() {
        if (!this.isRunning) {
            return
        }

        this.caf(this.frameId)
        this.frameId = null
        this.lastTime = null
    }

    tick(time) {
        const delta = this.lastTime === null ? 0 : Math.min(Math.max((time - this.lastTime) / 1000, 0), this.maxDelta)

        this.lastTime = time
        this.ticks++
        this.frameId = this.raf(this.tick)

        for (const callback of this.callbacks) {
            callback(delta, time)
        }
    }
}
