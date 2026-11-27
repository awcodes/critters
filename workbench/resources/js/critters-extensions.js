/**
 * A consuming application's own Critters extensions, kept outside the package to prove
 * that creatures and behaviors register without touching the runtime. Loaded as a
 * Filament asset by the `custom` panel; it may load before or after Critters itself.
 */
;(function () {
    /**
     * An external behavior implementing the experimental behavior contract from scratch
     * (no core classes): start(), update(delta), transition(action, { duration }),
     * blocked(side), the `intent` getter, a writable `direction`, `movingAction`, and
     * optionally chooseHop(options, context).
     */
    class ZoomiesBehavior {
        movingAction = 'walk'

        constructor({ random }) {
            this.random = random
            this.action = 'walk'
            this.direction = 1
            this.remaining = 0
        }

        get intent() {
            return { action: this.action, direction: this.direction }
        }

        start() {
            return this.transition('walk')
        }

        update(delta) {
            this.remaining -= delta

            if (this.remaining <= 0) {
                // Bursts of running with short pauses; never sleeps.
                this.transition(this.action === 'walk' ? 'idle' : 'walk')
            }

            return this.intent
        }

        transition(action, { duration } = {}) {
            if (!['walk', 'idle', 'sleep'].includes(action)) return this.intent

            if (action === 'walk' && this.random.next() < 0.5) this.direction *= -1

            this.action = action
            this.remaining = duration ?? (action === 'walk' ? this.random.between(1, 2.5) : this.random.between(0.5, 1.2))

            return this.intent
        }

        blocked(side) {
            this.direction = side === 'left' ? 1 : -1
        }

        chooseHop(options, { blocked }) {
            return blocked ? Math.floor(this.random.next() * options.length) : null
        }
    }

    const tabby = {
        label: 'the tabby',
        width: 64,
        height: 64,
        speed: 90,
        behavior: 'zoomies',
        hitboxes: {
            walk: { x: 4, y: 19, width: 56, height: 45 },
            idle: { x: 9, y: 16, width: 46, height: 48 },
            sleep: { x: 4, y: 30, width: 56, height: 34 },
        },
        skin: {
            // Served by the application (see workbench/routes/web.php), not by the package.
            src: '/workbench/critters/tabby.png',
            frameWidth: 96,
            frameHeight: 96,
            frameCount: 10,
            facing: 'right',
            animations: {
                walk: { frames: [0, 1, 2, 3], fps: 12 },
                idle: { frames: [4, 5], fps: 4 },
                sleep: { frames: [7, 8, 9, 8], fps: 2 },
            },
        },
    }

    ;(window.CrittersRegistrations ||= []).push((Critters) => {
        Critters.registerBehavior('zoomies', ZoomiesBehavior)
        Critters.registerCreature('tabby', tabby)
    })
})()
