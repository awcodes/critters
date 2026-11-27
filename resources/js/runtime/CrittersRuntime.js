import { configKey } from './config.js'

export class CrittersRuntime {
    constructor({ win = window, doc = document } = {}) {
        this.win = win
        this.doc = doc
        this.config = null
        this.overlay = null
        this.state = 'idle'
        this.stats = { mounts: 0, destroys: 0, reattachments: 0, reconfigurations: 0 }
    }

    mount(config) {
        if (this.state !== 'idle' || !config) {
            return this
        }

        this.config = config
        this.overlay = this.createOverlay(config)
        this.doc.body.appendChild(this.overlay)
        this.state = 'mounted'
        this.stats.mounts++

        return this
    }

    start() {
        if (this.state === 'mounted' || this.state === 'paused') {
            this.state = 'running'
        }

        return this
    }

    pause() {
        if (this.state === 'running') {
            this.state = 'paused'
        }

        return this
    }

    resume() {
        return this.start()
    }

    refreshSurfaces() {
        return this
    }

    destroy() {
        if (this.state === 'idle') {
            return this
        }

        this.overlay?.remove()
        this.overlay = null
        this.config = null
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

        if (this.state === 'idle') {
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

    createOverlay(config) {
        const overlay = this.doc.createElement('div')

        overlay.className = 'critters-overlay'
        overlay.dataset.crittersOverlay = config.panel
        overlay.setAttribute('aria-hidden', 'true')

        return overlay
    }
}
