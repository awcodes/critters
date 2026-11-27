/**
 * The only module allowed to know about Livewire. It listens to the navigation events
 * Filament itself relies on (see vendor/filament/filament/resources/js/stores/sidebar.js)
 * and only ever asks the runtime to pause or resume; lifecycle comes from the DOM.
 */
export function connectFilament(runtime, doc = document) {
    const onNavigating = () => runtime.pause('navigation')
    const onNavigated = () => runtime.resume('navigation')

    doc.addEventListener('livewire:navigating', onNavigating)
    doc.addEventListener('livewire:navigated', onNavigated)

    return () => {
        doc.removeEventListener('livewire:navigating', onNavigating)
        doc.removeEventListener('livewire:navigated', onNavigated)
    }
}
