/**
 * The only module allowed to know about Livewire or Filament markup.
 *
 * Navigation: listens to the events Filament itself relies on
 * (vendor/filament/filament/resources/js/stores/sidebar.js); it cancels interactions and
 * pauses or resumes, while lifecycle comes from the DOM.
 *
 * Surfaces and overlays: the verified Filament v5 selectors creatures may treat as
 * ledges, the fixed chrome they must never stand under, and the open overlays they hide
 * behind. See docs/poc-findings.md (M3, M4).
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

export const filamentOverlays = [
    // Modals and slide-overs: support/resources/views/components/modal/index.blade.php toggles `fi-modal-open`.
    '.fi-modal.fi-modal-open',
    // Dropdowns: support/resources/js/components/dropdown.js treats `display: block` on the panel as open.
    '.fi-dropdown-panel[style*="display: block"]',
]

export function connectFilament(runtime, doc = document, win = window) {
    const onNavigating = () => {
        runtime.cancelInteractions('navigation')
        runtime.pause('navigation')
    }
    const onNavigated = () => runtime.resume('navigation')
    // Filament announces modal changes; checking right away beats waiting for the poll.
    const onModal = () => runtime.checkObstructions()

    doc.addEventListener('livewire:navigating', onNavigating)
    doc.addEventListener('livewire:navigated', onNavigated)
    doc.addEventListener('x-modal-opened', onModal)
    win.addEventListener('modal-closed', onModal)

    return () => {
        doc.removeEventListener('livewire:navigating', onNavigating)
        doc.removeEventListener('livewire:navigated', onNavigated)
        doc.removeEventListener('x-modal-opened', onModal)
        win.removeEventListener('modal-closed', onModal)
    }
}
