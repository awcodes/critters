import { DomSpriteRenderer } from '../renderers/DomSpriteRenderer.js'
import { PanelEnvironment } from '../environments/PanelEnvironment.js'
import { AnimationScheduler } from './AnimationScheduler.js'
import { configKey } from './config.js'
import { CreatureInstance } from './CreatureInstance.js'
import { createRandom } from './random.js'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export class CrittersRuntime {
    constructor({ registry, win = window, doc = document, scheduler, seed } = {}) {
        this.registry = registry
        this.win = win
        this.doc = doc
        this.seed = seed
        this.scheduler = scheduler ?? new AnimationScheduler({ raf: (cb) => win.requestAnimationFrame(cb), caf: (id) => win.cancelAnimationFrame(id) })
        this.config = null
        this.overlay = null
        this.environment = null
        this.creature = null
        this.state = 'idle'
        this.pauseReasons = new Set()
        this.cleanups = []
        this.stats = { mounts: 0, destroys: 0, reattachments: 0, reconfigurations: 0 }
    }

    get isMounted() {
        return this.state !== 'idle'
    }

    mount(config) {
        if (this.isMounted || !config) {
            return this
        }

        const definition = this.registry.creature(config.creature)
        const Behavior = this.registry.behavior(config.behavior ?? definition?.behavior)

        if (!definition || !Behavior) {
            this.win.console?.warn(`Critters: unknown ${definition ? 'behavior' : 'creature'} "${definition ? config.behavior : config.creature}".`)

            return this
        }

        const random = createRandom(this.seed)

        this.config = config
        this.overlay = this.createOverlay(config)
        this.doc.body.appendChild(this.overlay)
        this.environment = new PanelEnvironment({ win: this.win, doc: this.doc })
        this.creature = new CreatureInstance({
            definition,
            behavior: new Behavior({ random }),
            environment: this.environment,
            renderer: new DomSpriteRenderer({ doc: this.doc, container: this.overlay, definition }),
            random,
        })

        this.cleanups.push(this.scheduler.add((delta) => this.creature.update(delta)))
        this.listen(this.win, 'resize', () => this.refreshSurfaces())
        this.listen(this.win.visualViewport, 'resize', () => this.refreshSurfaces())
        this.listen(this.doc, 'visibilitychange', () => this.toggle('hidden', this.doc.visibilityState === 'hidden'))

        const motion = this.win.matchMedia?.(REDUCED_MOTION)

        this.listen(motion, 'change', () => this.apply())
        this.reducedMotionQuery = motion

        this.state = 'mounted'
        this.stats.mounts++

        if (this.doc.visibilityState === 'hidden') {
            this.pauseReasons.add('hidden')
        }

        return this
    }

    start() {
        if (!this.isMounted) {
            return this
        }

        this.started = true

        return this.apply()
    }

    pause(reason = 'user') {
        return this.toggle(reason, true)
    }

    resume(reason = 'user') {
        return this.toggle(reason, false)
    }

    refreshSurfaces() {
        this.environment?.invalidate()

        if (this.state === 'static') {
            this.creature.still()
        }

        return this
    }

    destroy() {
        if (!this.isMounted) {
            return this
        }

        this.scheduler.stop()
        this.cleanups.forEach((cleanup) => cleanup())
        this.cleanups = []
        this.creature?.destroy()
        this.overlay?.remove()
        this.overlay = this.creature = this.environment = this.config = this.reducedMotionQuery = null
        this.pauseReasons.clear()
        this.started = false
        this.state = 'idle'
        this.stats.destroys++

        return this
    }

    /**
     * Brings the runtime in line with the panel config found in the current document:
     * mounts, remounts, destroys, or re-attaches the overlay to a replaced <body>.
     */
    sync(config) {
        if (!config) {
            return this.destroy()
        }

        if (!this.isMounted) {
            return this.mount(config).start()
        }

        if (configKey(config) !== configKey(this.config)) {
            this.stats.reconfigurations++
            this.destroy()

            return this.mount(config).start()
        }

        if (!this.overlay.isConnected) {
            this.doc.body.appendChild(this.overlay)
            this.stats.reattachments++
        }

        return this.refreshSurfaces()
    }

    toggle(reason, paused) {
        paused ? this.pauseReasons.add(reason) : this.pauseReasons.delete(reason)

        return this.apply()
    }

    /** Derives the running state from pause reasons and the reduced-motion preference. */
    apply() {
        if (!this.isMounted || !this.started) {
            return this
        }

        if (this.reducedMotionQuery?.matches) {
            this.scheduler.stop()
            this.state = 'static'
            this.creature.still()
        } else if (this.pauseReasons.size) {
            this.scheduler.stop()
            this.state = 'paused'
        } else {
            this.state = 'running'
            this.scheduler.start()
        }

        return this
    }

    listen(target, event, handler) {
        if (!target) {
            return
        }

        target.addEventListener(event, handler)
        this.cleanups.push(() => target.removeEventListener(event, handler))
    }

    createOverlay(config) {
        const overlay = this.doc.createElement('div')

        overlay.className = 'critters-overlay'
        overlay.dataset.crittersOverlay = config.panel
        overlay.setAttribute('aria-hidden', 'true')

        return overlay
    }
}
