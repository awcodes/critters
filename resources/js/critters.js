import { AmbientBehavior } from './behaviors/AmbientBehavior.js'
import { WanderBehavior } from './behaviors/WanderBehavior.js'
import { builtInCreatures } from './creatures/builtins.js'
import { connectFilament, filamentOverlays, filamentSurfaces } from './integration/filament.js'
import { createCrittersApi } from './runtime/api.js'
import { readConfig } from './runtime/config.js'
import { CrittersRuntime } from './runtime/CrittersRuntime.js'
import { watchDocument } from './runtime/DocumentWatcher.js'
import { Registry } from './runtime/Registry.js'

if (!window.Critters) {
    const registry = new Registry().registerBehavior('wander', WanderBehavior).registerBehavior('swim', AmbientBehavior)

    for (const [name, definition] of Object.entries(builtInCreatures)) {
        registry.registerCreature(name, definition)
    }

    const runtime = new CrittersRuntime({ registry, surfaces: filamentSurfaces, overlays: filamentOverlays })
    const sync = () => runtime.sync(readConfig())

    createCrittersApi({ runtime, registry, sync })

    watchDocument(sync)
    connectFilament(runtime)

    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', sync, { once: true }) : sync()
}
