/**
 * Finds and measures the DOM elements creatures may stand on. Geometry is not
 * suitability: only opted-in elements (explicit markers, or the small verified set an
 * integration adapter names) are candidates, and interactive elements never are.
 */
export const INTERACTIVE = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    'label',
    'summary',
    'iframe',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
    ...['button', 'link', 'checkbox', 'switch', 'tab', 'menuitem', 'option', 'slider', 'textbox', 'combobox', 'radio'].map((role) => `[role="${role}"]`),
].join(', ')

export const OVERLAY_CONTAINERS = 'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [popover], [aria-modal="true"]'

const IGNORED = '[data-critters-ignore], [data-critters-surface="none"]'
const CRITTERS = '[data-critters-overlay]'

export function rejectionReason(el) {
    if (el.closest(CRITTERS)) return 'critters'
    if (el.matches(INTERACTIVE)) return 'interactive'
    if (el.closest(OVERLAY_CONTAINERS)) return 'overlay'
    if (el.closest(IGNORED)) return 'ignored'

    return null
}

/**
 * @param {{ selectors?: Array<{ selector: string, id: (el: Element, index: number) => string }> }} adapter
 */
export function discoverSurfaces(doc, adapter = {}) {
    const surfaces = []
    const rejected = []
    const markers = [...doc.querySelectorAll('[data-critters-surface]')].filter((el) => el.dataset.crittersSurface !== 'none')

    const consider = (element, id, source) => {
        const reason = rejectionReason(element)

        if (reason) {
            rejected.push({ id, element, reason })

            return
        }

        surfaces.push({ id, element, source, type: element.dataset.crittersSurfaceType || 'perch' })
    }

    markers.forEach((el, index) => consider(el, el.dataset.crittersSurface || `marker:${index}`, 'marker'))

    for (const { selector, id } of adapter.selectors ?? []) {
        doc.querySelectorAll(selector).forEach((el, index) => {
            // A marker on a wrapper already describes this element.
            if (markers.some((marker) => marker.contains(el))) return

            consider(el, id(el, index), 'adapter')
        })
    }

    const seen = new Map()

    for (const surface of surfaces) {
        // Logical ids must be unique; repeated ones (e.g. two sections with the same
        // heading) get a document-order suffix.
        const count = seen.get(surface.id) ?? 0

        seen.set(surface.id, count + 1)

        if (count) surface.id = `${surface.id}~${count + 1}`

        surface.clipAncestors = clippingAncestors(surface.element, doc)
    }

    return { surfaces, rejected }
}

/** Ancestors that can clip a surface. Read once per discovery, not per measurement. */
function clippingAncestors(el, doc) {
    const view = doc.defaultView
    const ancestors = []

    for (let node = el.parentElement; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
        const style = view.getComputedStyle(node)

        if (`${style.overflowX}${style.overflowY}`.match(/hidden|clip|auto|scroll/)) {
            ancestors.push(node)
        }
    }

    return ancestors
}

const rectOf = (el) => el.getBoundingClientRect()

const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * Converts candidates into viewport-space ledges: { id, type, left, right, top }. A ledge
 * is only usable when the creature standing on it would be fully visible and clear of
 * fixed chrome (occluders) such as a sticky top bar.
 */
export function measureSurfaces(candidates, { viewport, occluders = [], size }) {
    const measured = []
    const rejected = []

    for (const candidate of candidates) {
        const reason = measureRejection(candidate, { viewport, occluders, size })

        if (typeof reason === 'string') {
            rejected.push({ id: candidate.id, reason })
        } else {
            measured.push(reason)
        }
    }

    return { measured, rejected }
}

function measureRejection(candidate, { viewport, occluders, size }) {
    const { element } = candidate

    if (!element.isConnected) return 'disconnected'
    if (element.checkVisibility && !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return 'hidden'

    const rect = rectOf(element)
    let left = Math.max(rect.left, 0)
    let right = Math.min(rect.right, viewport.width)

    for (const ancestor of candidate.clipAncestors ?? []) {
        const clip = rectOf(ancestor)

        if (rect.top < clip.top || rect.top > clip.bottom) return 'clipped'

        left = Math.max(left, clip.left)
        right = Math.min(right, clip.right)
    }

    if (rect.height <= 0 || right - left < size.width) return 'too-narrow'

    const band = { left, right, top: rect.top - size.height, bottom: rect.top }

    if (band.top < 0 || band.bottom > viewport.height) return 'offscreen'
    if (occluders.some((occluder) => intersects(band, occluder))) return 'occluded'

    return { id: candidate.id, type: candidate.type, source: candidate.source, element, left, right, top: rect.top }
}

export function measureOccluders(doc, selectors = []) {
    return selectors.flatMap((selector) => [...doc.querySelectorAll(selector)]).map(rectOf).filter((r) => r.width > 0 && r.height > 0)
}

/** Visible interactive elements a resting creature must not cover. */
export function measureUnsafe(doc, viewport) {
    const rects = []

    for (const el of doc.querySelectorAll(INTERACTIVE)) {
        if (el.closest(CRITTERS)) continue

        const rect = rectOf(el)

        if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewport.height && rect.right > 0 && rect.left < viewport.width) {
            rects.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })
        }
    }

    return rects
}
