import { readConfig } from './runtime/config.js'
import { CrittersRuntime } from './runtime/CrittersRuntime.js'
import { watchDocument } from './runtime/DocumentWatcher.js'
import { connectFilament } from './integration/filament.js'

if (!window.Critters) {
    const runtime = new CrittersRuntime()
    const sync = () => runtime.sync(readConfig())

    window.Critters = { runtime }

    watchDocument(sync)
    connectFilament(runtime)

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', sync, { once: true }) : sync()
}
