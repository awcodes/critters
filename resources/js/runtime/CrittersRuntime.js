import { DomSpriteRenderer } from '../renderers/DomSpriteRenderer.js'
import { PanelEnvironment } from '../environments/PanelEnvironment.js'
import { InteractionController } from '../interactions/InteractionController.js'
import { AnimationScheduler } from './AnimationScheduler.js'
import { configKey } from './config.js'
import { CreatureInstance } from './CreatureInstance.js'
import { createRandom } from './random.js'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const TOUCH_ONLY = '(hover: none) and (pointer: coarse)'

/** Open overlays any page can have; integrations add their own (e.g. Filament modals). */
const GENERIC_OPEN_OVERLAYS = ['dialog[open]']

const OBSTRUCTION_POLL_MS = 200

export class CrittersRuntime {
    constructor({ registry, win = window, doc = document, scheduler, seed, surfaces = {}, overlays = [], interactionOptions = {} } = {}) {
        this.registry = registry
        this.surfaces = surfaces
        this.openOverlaySelector = [...GENERIC_OPEN_OVERLAYS, ...overlays].join(', ')
        this.interactionOptions = interactionOptions
        this.win = win
        this.doc = doc
        this.seed = seed
        this.scheduler = scheduler ?? new AnimationScheduler({ raf: (cb) => win.requestAnimationFrame(cb), caf: (id) => win.cancelAnimationFrame(id) })
        this.config = null
        this.overlay = null
        this.stage = null
        this.status = null
        this.environment = null
        this.creature = null
        this.interactions = null
        this.state = 'idle'
        this.pauseReasons = new Set()
        this.cleanups = []
        this.pendingPet = false
        this.stats = { mounts: 0, destroys: 0, reattachments: 0, reconfigurations: 0, strays: 0, skippedTouch: 0 }
    }

    get isMounted() {
        return this.state !== 'idle'
    }

    get hidden() {
        return this.pauseReasons.has('hidden-by-user')
    }

    get obstructed() {
        return this.pauseReasons.has('obstructed')
    }

    mount(config) {
        if (this.isMounted || !config) {
            return this
        }

        if (!config.touch && this.win.matchMedia?.(TOUCH_ONLY)?.matches) {
            // Conservative mobile policy: touch-only devices are opted out unless enabled.
            this.stats.skippedTouch++

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
        this.createOverlay(config)
        this.doc.body.appendChild(this.overlay)
        this.environment = new PanelEnvironment({ win: this.win, doc: this.doc, adapter: this.surfaces }).connect()

        const renderer = new DomSpriteRenderer({ doc: this.doc, container: this.stage, definition })

        this.creature = new CreatureInstance({ definition, behavior: new Behavior({ random }), environment: this.environment, renderer, random })
        this.interactions = new InteractionController({
            creature: this.creature,
            renderer,
            environment: this.environment,
            random,
            container: this.stage,
            options: this.interactionOptions,
            isStatic: () => this.state === 'static',
            onPet: () => this.announce(`You petted the ${definition.label ?? definition.name}.`),
        })

        this.cleanups.push(
            this.scheduler.add((delta) => {
                // Read everything first, then write: no forced synchronous layouts.
                this.environment.ensureMeasured(this.creature.size)
                this.interactions.measure(delta)
                this.creature.update(delta)
                this.interactions.update(delta)
            }),
        )
        this.listen(this.win, 'resize', () => this.refreshSurfaces())
        this.listen(this.win.visualViewport, 'resize', () => this.refreshSurfaces())
        this.listen(this.doc, 'visibilitychange', () => {
            const hidden = this.doc.visibilityState === 'hidden'

            if (hidden) this.cancelInteractions('hidden')

            this.toggle('hidden', hidden)
        })
        this.listen(this.doc, 'focusin', (event) => this.onFocus(event), true)

        const motion = this.win.matchMedia?.(REDUCED_MOTION)

        this.listen(motion, 'change', () => this.apply())
        this.reducedMotionQuery = motion

        const poll = this.win.setInterval(() => this.checkObstructions(), OBSTRUCTION_POLL_MS)

        this.cleanups.push(() => this.win.clearInterval(poll))

        this.state = 'mounted'
        this.stats.mounts++

        if (this.doc.visibilityState === 'hidden') this.pauseReasons.add('hidden')
        if (this.readHidden()) this.pauseReasons.add('hidden-by-user')

        return this
    }

    start() {
        if (!this.isMounted) {
            return this
        }

        this.started = true
        this.checkObstructions()

        return this.apply()
    }

    pause(reason = 'user') {
        return this.toggle(reason, true)
    }

    resume(reason = 'user') {
        return this.toggle(reason, false)
    }

    refreshSurfaces() {
        this.environment?.observeBody()
        this.environment?.invalidate({ rediscover: true })

        if (this.state === 'static') {
            this.creature.still()
        }

        return this
    }

    /** Ends any press or drag right away; the creature recovers to a safe ledge. */
    cancelInteractions(reason = 'external') {
        this.interactions?.cancel(reason)

        return this
    }

    /** Keyboard-accessible petting (wired to a panel menu item). */
    pet() {
        if (!this.isMounted || this.hidden || this.state === 'paused' && !this.obstructed) return this

        if (this.obstructed) {
            // Usually the menu that triggered it is still closing; pet once it has.
            this.pendingPet = true
        } else {
            this.interactions.pet()
        }

        return this
    }

    toggleHidden() {
        return this.setHidden(!this.hidden)
    }

    setHidden(hidden) {
        if (!this.isMounted) return this

        this.writeHidden(hidden)

        if (hidden) this.cancelInteractions('hidden-by-user')

        this.toggle('hidden-by-user', hidden)
        this.announce(hidden ? 'Critters hidden.' : 'Critters shown.')

        return this
    }

    /** Hides creatures while a dialog, slide-over or dropdown is open over the page. */
    checkObstructions() {
        if (!this.isMounted) return this

        const obstructed = Boolean(this.doc.querySelector(this.openOverlaySelector))

        if (obstructed === this.obstructed) return this

        if (obstructed) this.cancelInteractions('obstructed')

        this.toggle('obstructed', obstructed)

        if (!obstructed && this.pendingPet) {
            this.pendingPet = false
            this.pet()
        }

        return this
    }

    onFocus(event) {
        const target = event.target

        if (!this.creature || !(target instanceof this.win.Element) || target.closest('[data-critters-overlay]')) return

        const rect = target.getBoundingClientRect()

        if (this.interactions.covers(rect)) {
            this.environment.invalidate()
            this.creature.moveAway(rect)
        }
    }

    destroy() {
        if (!this.isMounted) {
            return this
        }

        this.scheduler.stop()
        this.interactions?.destroy()
        this.cleanups.forEach((cleanup) => cleanup())
        this.cleanups = []
        this.creature?.destroy()
        this.environment?.destroy()
        this.overlay?.remove()
        this.overlay = this.stage = this.status = this.creature = this.interactions = this.environment = this.config = this.reducedMotionQuery = null
        this.pauseReasons.clear()
        this.pendingPet = false
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
        this.removeStrayOverlays()

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

    /**
     * Client-side routers can snapshot the page HTML (overlay included) and restore it on
     * back/forward, which brings back inert copies of the overlay. Only ours may remain.
     */
    removeStrayOverlays() {
        this.doc.querySelectorAll('[data-critters-overlay]').forEach((overlay) => {
            if (overlay !== this.overlay) {
                overlay.remove()
                this.stats.strays++
            }
        })
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

        this.overlay.classList.toggle('critters-overlay--hidden', this.hidden)
        this.overlay.classList.toggle('critters-overlay--obstructed', this.obstructed)

        const reasons = new Set(this.pauseReasons)

        if (this.reducedMotionQuery?.matches) {
            this.scheduler.stop()
            this.state = reasons.size ? 'paused' : 'static'

            if (!reasons.size) this.creature.still()
        } else if (reasons.size) {
            this.scheduler.stop()
            this.state = 'paused'
        } else {
            this.state = 'running'
            this.scheduler.start()
        }

        this.interactions.setEnabled(this.config.interactive !== false && (this.state === 'running' || this.state === 'static'))

        return this
    }

    announce(message) {
        if (!this.status) return

        // Clearing first makes repeated identical messages announce again.
        this.status.textContent = ''
        this.win.setTimeout(() => this.status && (this.status.textContent = message), 50)
    }

    storageKey() {
        return `critters:${this.config.panel}:hidden`
    }

    readHidden() {
        try {
            return this.win.localStorage?.getItem(this.storageKey()) === '1'
        } catch {
            return false
        }
    }

    writeHidden(hidden) {
        try {
            hidden ? this.win.localStorage?.setItem(this.storageKey(), '1') : this.win.localStorage?.removeItem(this.storageKey())
        } catch {
            // Storage can be unavailable (privacy modes); hiding still works for this page.
        }
    }

    listen(target, event, handler, options) {
        if (!target) {
            return
        }

        target.addEventListener(event, handler, options)
        this.cleanups.push(() => target.removeEventListener(event, handler, options))
    }

    createOverlay(config) {
        this.overlay = this.doc.createElement('div')
        this.overlay.className = 'critters-overlay'
        this.overlay.dataset.crittersOverlay = config.panel

        this.stage = this.doc.createElement('div')
        this.stage.className = 'critters-stage'
        this.stage.setAttribute('aria-hidden', 'true')

        this.status = this.doc.createElement('div')
        this.status.className = 'critters-status'
        this.status.setAttribute('role', 'status')

        this.overlay.append(this.stage, this.status)
    }
}
