/**
 * The experimental public surface on `window.Critters`, and the registration handshake
 * for consumer scripts, which may load before or after Critters:
 *
 *   (window.CrittersRegistrations ||= []).push((Critters) => {
 *       Critters.registerCreature('tabby', tabby)
 *       Critters.registerBehavior('zoomies', Zoomies)
 *   })
 *
 * Callbacks queued before Critters loads run when it initializes; after that, `push`
 * runs them immediately. A `critters:init` event is also dispatched on `document`.
 * Registering a creature or behavior the current panel is waiting for mounts it.
 */
export function createCrittersApi({ runtime, registry, sync, win = window, doc = document }) {
    const resyncIfWaiting = () => {
        if (!runtime.isMounted) sync()
    }

    const api = {
        runtime,
        registerCreature(name, definition) {
            registry.registerCreature(name, definition)
            resyncIfWaiting()

            return api
        },
        registerBehavior(name, Behavior) {
            registry.registerBehavior(name, Behavior)
            resyncIfWaiting()

            return api
        },
        pet: () => runtime.pet(),
        toggleHidden: () => runtime.toggleHidden(),
    }

    const run = (callback) => {
        try {
            callback(api)
        } catch (error) {
            win.console?.error('Critters: a registration callback failed.', error)
        }
    }

    const queued = Array.isArray(win.CrittersRegistrations) ? win.CrittersRegistrations : []

    win.Critters = api
    win.CrittersRegistrations = { push: (...callbacks) => callbacks.forEach(run) }
    queued.forEach(run)
    doc.dispatchEvent(new CustomEvent('critters:init', { detail: api }))

    return api
}
