import { WanderBehavior } from './behaviors/WanderBehavior.js'
import { placeholderCat } from './creatures/placeholderCat.js'
import { connectFilament, filamentOverlays, filamentSurfaces } from './integration/filament.js'
import { readConfig } from './runtime/config.js'
import { CrittersRuntime } from './runtime/CrittersRuntime.js'
import { watchDocument } from './runtime/DocumentWatcher.js'
import { Registry } from './runtime/Registry.js'

if (!window.Critters) {
    const registry = new Registry().registerCreature('cat', placeholderCat).registerBehavior('wander', WanderBehavior)
    const runtime = new CrittersRuntime({ registry, surfaces: filamentSurfaces, overlays: filamentOverlays })
    const sync = () => runtime.sync(readConfig())

    window.Critters = {
        runtime,
        registerCreature: (name, definition) => registry.registerCreature(name, definition),
        registerBehavior: (name, Behavior) => registry.registerBehavior(name, Behavior),
        pet: () => runtime.pet(),
        toggleHidden: () => runtime.toggleHidden(),
    }

    watchDocument(sync)
    connectFilament(runtime)

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', sync, { once: true }) : sync()
}
