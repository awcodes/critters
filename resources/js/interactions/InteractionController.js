const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

export const INTERACTION_DEFAULTS = {
    /** Movement (CSS px) that turns a press into a drag. */
    dragThreshold: 6,
    /** Seconds a dropped creature stays put before wandering again. */
    stay: [10, 20],
    /** Seconds the pet reaction plays. */
    petDuration: 1.2,
    /** Seconds the attention reaction holds a walking creature. */
    attentionDuration: 1.5,
    /** How often (ms) to re-check whether the hit target overlaps a control. */
    hitCheckInterval: 100,
}

/**
 * Pointer interactions, independent of autonomous behavior. States: `idle`, `pressed`,
 * `carried`, `reacting`, `settling`. Only the creature's own hit target receives pointer
 * events; there is never a page-wide capture surface.
 */
export class InteractionController {
    constructor({ creature, renderer, environment, random, container, options = {}, onPet = () => {}, isStatic = () => false }) {
        this.creature = creature
        this.renderer = renderer
        this.environment = environment
        this.random = random
        this.container = container
        this.options = { ...INTERACTION_DEFAULTS, ...options }
        this.onPet = onPet
        this.isStatic = isStatic
        this.state = 'idle'
        this.enabled = false
        this.press = null
        this.timer = 0
        this.sinceHitCheck = Infinity
        this.cleanups = []
        this.stats = { pets: 0, drags: 0, drops: 0, cancels: 0 }

        const hit = renderer.hit
        const on = (type, handler, options) => {
            hit.addEventListener(type, handler, options)
            this.cleanups.push(() => hit.removeEventListener(type, handler, options))
        }

        on('pointerdown', (e) => this.onPointerDown(e))
        on('pointermove', (e) => this.onPointerMove(e))
        on('pointerup', (e) => this.onPointerUp(e))
        on('pointercancel', () => this.cancel('pointercancel'))
        on('lostpointercapture', () => this.cancel('lostpointercapture'))
        on('pointerenter', (e) => this.onPointerEnter(e))
        // The click that follows a press belongs to the creature; it must never reach the page.
        on('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        on('dragstart', (e) => e.preventDefault())
    }

    setEnabled(enabled) {
        this.enabled = enabled

        if (!enabled) this.cancel('disabled')

        this.updateHitTarget()
    }

    onPointerDown(event) {
        if (!this.enabled || event.button !== 0 || this.state === 'carried') return

        event.preventDefault()

        const { x, y } = this.creature.position

        this.press = { id: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - x, offsetY: event.clientY - y }
        this.state = 'pressed'
        this.renderer.hit.setPointerCapture?.(event.pointerId)
    }

    onPointerMove(event) {
        if (!this.press || event.pointerId !== this.press.id) return

        if (this.state === 'pressed') {
            const distance = Math.hypot(event.clientX - this.press.startX, event.clientY - this.press.startY)

            if (distance < this.options.dragThreshold) return

            this.state = 'carried'
            this.stats.drags++
            this.creature.pickUp()
        }

        this.creature.carryTo(event.clientX - this.press.offsetX, event.clientY - this.press.offsetY)
        this.creature.render(this.creature.intent.direction)
    }

    onPointerUp(event) {
        if (!this.press || event.pointerId !== this.press.id) return

        const wasCarried = this.state === 'carried'

        this.release()
        wasCarried ? this.drop() : this.pet()
    }

    onPointerEnter() {
        const { creature } = this

        if (!this.enabled || this.state !== 'idle' || creature.mode !== 'auto' || creature.placement.hop) return
        if (creature.intent.action !== 'walk') return

        creature.intent = creature.behavior.transition('idle', { duration: this.options.attentionDuration })
    }

    pet() {
        if (this.creature.mode === 'carried') return

        this.state = 'reacting'
        this.timer = this.options.petDuration
        this.stats.pets++
        this.creature.react('pet', this.options.petDuration)
        this.renderer.burst(this.container, this.creature.position, { animate: !this.isStatic() })

        if (this.isStatic()) {
            // No animation loop runs under reduced motion, so end the reaction on a timer.
            this.creature.still('pet')
            this.staticTimer = setTimeout(() => {
                this.creature.endReaction()
                this.creature.still('sleep')
                this.state = 'idle'
            }, this.options.petDuration * 1000)
        }

        this.onPet()
    }

    drop() {
        const [min, max] = this.options.stay
        const stay = min + this.random.next() * (max - min)

        this.state = 'settling'
        this.timer = stay
        this.stats.drops++
        this.creature.drop(stay)

        if (this.isStatic()) this.creature.still('sleep')
    }

    /**
     * Ends any press or carry immediately (lost capture, navigation, hidden tab, overlay,
     * teardown). A carried creature always recovers by dropping to a safe ledge.
     */
    cancel(reason) {
        if (!this.press && this.state !== 'carried') return

        const wasCarried = this.state === 'carried'

        this.stats.cancels++
        this.lastCancel = reason
        this.release()

        if (wasCarried) {
            this.drop()
        } else {
            this.state = 'idle'
        }
    }

    release() {
        const id = this.press?.id

        this.press = null

        if (id !== undefined && this.renderer.hit.hasPointerCapture?.(id)) {
            this.renderer.hit.releasePointerCapture(id)
        }
    }

    /**
     * Read phase: runs before anything writes styles this frame, so geometry reads never
     * force a synchronous layout.
     */
    measure(delta = 0) {
        this.sinceHitCheck += delta * 1000

        if (!this.enabled || this.state === 'carried' || this.press || this.sinceHitCheck < this.options.hitCheckInterval) return

        // Keep the previous answer while control geometry is stale (e.g. mid-scroll).
        if (!this.environment.viewport || !this.environment.hasFreshUnsafe()) return

        this.sinceHitCheck = 0

        const { creature } = this
        const rect = this.renderer.hitRect(creature.position, creature.action, creature.intent.direction)

        this.overControl = this.environment.unsafeRegions().some((control) => intersects(rect, control))
    }

    /** Write phase. */
    update(delta) {
        if (this.state === 'reacting' || this.state === 'settling') {
            this.timer -= delta

            if (this.timer <= 0) this.state = 'idle'
        }

        this.applyHitTarget()
    }

    /**
     * The hit target is live only while interactions are enabled and the creature isn't
     * passing over a control, so it can never steal a click meant for the interface.
     */
    applyHitTarget() {
        if (this.state === 'carried' || this.press) return this.renderer.setHitEnabled(true)
        if (!this.enabled) return this.renderer.setHitEnabled(false)

        this.renderer.setHitEnabled(!this.overControl)
    }

    /** Re-checks immediately (outside the frame loop, e.g. when enabling or in tests). */
    updateHitTarget() {
        this.sinceHitCheck = Infinity
        this.measure()
        this.applyHitTarget()
    }

    covers(rect) {
        const { creature } = this
        const box = { left: creature.position.x, top: creature.position.y, right: creature.position.x + creature.size.width, bottom: creature.position.y + creature.size.height }

        return intersects(box, rect)
    }

    destroy() {
        clearTimeout(this.staticTimer)
        this.cancel('destroy')
        this.cleanups.forEach((cleanup) => cleanup())
        this.cleanups = []
    }
}
