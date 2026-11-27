import { DomSpriteRenderer } from '../renderers/DomSpriteRenderer.js'
import { AmbientEnvironment } from '../environments/AmbientEnvironment.js'
import { PanelEnvironment } from '../environments/PanelEnvironment.js'
import { InteractionController } from '../interactions/InteractionController.js'
import { CreaturePicker } from '../ui/CreaturePicker.js'
import { AnimationScheduler } from './AnimationScheduler.js'
import { configKey } from './config.js'
import { CreatureInstance } from './CreatureInstance.js'
import { createRandom } from './random.js'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const TOUCH_ONLY = '(hover: none) and (pointer: coarse)'

/** Open overlays any page can have; integrations add their own (e.g. Filament modals). */
const GENERIC_OPEN_OVERLAYS = ['dialog[open]']

const OBSTRUCTION_POLL_MS = 200

/** English fallbacks; the panel sends translated `strings` in its config. */
const DEFAULT_STRINGS = {
    pickerTitle: 'Choose your critter',
    pickerClose: 'Close',
    petted: 'You petted :creature.',
    hidden: 'Critters hidden.',
    shown: 'Critters shown.',
    nowShowing: 'Now showing :creature.',
    shownAndNowShowing: 'Critters shown. Now showing :creature.',
}

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
        this.serverConfig = null
        this.picker = null
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

        this.ensureSprite(config.creature, config)
        this.config = config
        this.createOverlay(config)
        this.doc.body.appendChild(this.overlay)
        this.environment = this.createEnvironment(config).connect()

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
            onPet: () => this.announce(this.text('petted', this.nameOf(definition.name).label)),
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

    /** Opens the "Change critter" dialog, when this panel offers a choice. */
    choose() {
        const choices = this.serverConfig?.choices ?? []

        if (!this.isMounted || choices.length < 2) return this

        this.picker = new CreaturePicker({
            doc: this.doc,
            choices,
            current: this.config.creature,
            strings: { title: this.text('pickerTitle'), close: this.text('pickerClose') },
            describe: (name) => {
                this.ensureSprite(name, this.serverConfig)

                return { title: this.nameOf(name).title, definition: this.registry.creature(name) }
            },
            onPick: (name) => this.setCreature(name),
            onClose: () => (this.picker = null),
        }).open()

        return this
    }

    /**
     * Switches to another offered creature and remembers it in this browser (per panel).
     * No server or database is involved.
     */
    setCreature(name) {
        const serverConfig = this.serverConfig

        if (!serverConfig?.choices?.includes(name) || !this.registry.creature(name)) return this

        const { label } = this.nameOf(name)
        const wasHidden = this.hidden

        // Picking a critter means wanting to see one, so it also un-hides.
        this.writePreference('creature', name)
        if (wasHidden) this.writeHidden(false)

        this.destroy()
        this.mount(this.withChoice(serverConfig)).start()
        this.stats.reconfigurations++
        this.announce(this.text(wasHidden ? 'shownAndNowShowing' : 'nowShowing', label))

        return this
    }

    /** Translated text from the panel (English fallback), with `:creature` filled in. */
    text(key, creature = '') {
        const template = this.serverConfig?.strings?.[key] ?? DEFAULT_STRINGS[key] ?? key

        return template.replaceAll(':creature', creature)
    }

    /**
     * How to name a creature: the panel's translated names for built-ins, else the JS
     * definition's own `title`/`label`, else a default from its registered name.
     */
    nameOf(name) {
        const translated = this.serverConfig?.names?.[name]
        const definition = this.registry.creature(name)

        return {
            title: translated?.title ?? definition?.title ?? name.charAt(0).toUpperCase() + name.slice(1),
            label: translated?.label ?? definition?.label ?? `the ${name}`,
        }
    }

    /** The server's config with this browser's remembered creature applied, if still offered. */
    withChoice(config) {
        const choice = this.readPreference('creature', config)

        return choice && choice !== config.creature && config.choices?.includes(choice) && this.registry.creature(choice) ? { ...config, creature: choice } : config
    }

    /** Loads a built-in creature's sprite stylesheet if the page doesn't have it yet. */
    ensureSprite(name, config) {
        const href = config?.sprites?.[name]

        if (!href || this.doc.head.querySelector(`link[data-critters-sprite="${name}"]`)) return

        const link = this.doc.createElement('link')

        link.rel = 'stylesheet'
        link.href = href
        link.dataset.crittersSprite = name
        this.doc.head.appendChild(link)
    }

    toggleHidden() {
        return this.setHidden(!this.hidden)
    }

    setHidden(hidden) {
        if (!this.isMounted) return this

        this.writeHidden(hidden)

        if (hidden) this.cancelInteractions('hidden-by-user')

        this.toggle('hidden-by-user', hidden)
        this.announce(this.text(hidden ? 'hidden' : 'shown'))

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
        this.picker?.close()
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
    sync(serverConfig) {
        this.removeStrayOverlays()
        this.serverConfig = serverConfig

        if (!serverConfig) {
            return this.destroy()
        }

        const config = this.withChoice(serverConfig)

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

    /** Per-panel preferences live in localStorage: `critters:<panel>:<key>`. */
    readPreference(key, config = this.config) {
        try {
            return this.win.localStorage?.getItem(`critters:${config.panel}:${key}`) ?? null
        } catch {
            return null
        }
    }

    writePreference(key, value, config = this.config) {
        try {
            const storageKey = `critters:${config.panel}:${key}`

            value === null ? this.win.localStorage?.removeItem(storageKey) : this.win.localStorage?.setItem(storageKey, value)
        } catch {
            // Storage can be unavailable (privacy modes); the change still applies to this page.
        }
    }

    readHidden() {
        return this.readPreference('hidden') === '1'
    }

    writeHidden(hidden) {
        this.writePreference('hidden', hidden ? '1' : null)
    }

    listen(target, event, handler, options) {
        if (!target) {
            return
        }

        target.addEventListener(event, handler, options)
        this.cleanups.push(() => target.removeEventListener(event, handler, options))
    }

    /** Both environments share this runtime, scheduler, registry, renderer and interactions. */
    createEnvironment(config) {
        const options = { win: this.win, doc: this.doc }

        return config.environment === 'ambient'
            ? new AmbientEnvironment({ ...options, region: config.region ?? null })
            : new PanelEnvironment({ ...options, adapter: this.surfaces })
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
