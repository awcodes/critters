/**
 * The only module allowed to know about Livewire or Filament markup.
 *
 * Navigation: listens to the events Filament itself relies on
 * (vendor/filament/filament/resources/js/stores/sidebar.js) and only asks the runtime to
 * pause or resume; lifecycle comes from the DOM.
 *
 * Surfaces: the verified Filament v5 selectors creatures may treat as ledges, and the
 * fixed chrome they must never stand under. See docs/poc-findings.md (M3).
 */
export const filamentSurfaces = {
    selectors: [
        {
            // Contained (card) sections: vendor/filament/schemas/resources/views/components/section.blade.php
            selector: '.fi-section:not(.fi-section-not-contained)',
            id: (el, index) => {
                const heading = el.querySelector(':scope > .fi-section-header .fi-section-header-heading')?.textContent.trim()

                return el.id ? `section#${el.id}` : heading ? `section:${heading}` : `section:${index}`
            },
        },
    ],
    occluders: ['.fi-topbar'],
}

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
