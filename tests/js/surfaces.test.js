import { afterEach, describe, expect, it } from 'vitest'
import { discoverSurfaces, measureSurfaces, measureUnsafe } from '../../resources/js/navigation/SurfaceDiscovery.js'
import { hopTargets, nearestSafeX, safeIntervals, supportBelow } from '../../resources/js/navigation/SurfaceGraph.js'
import { filamentSurfaces } from '../../resources/js/integration/filament.js'
import { element, setRect } from './helpers.js'

const size = { width: 20, height: 20 }
const viewport = { width: 400, height: 300 }
const ids = (list) => list.map((s) => s.id)

describe('discoverSurfaces', () => {
    afterEach(() => (document.body.innerHTML = ''))

    it('takes explicit markers first, then adapter matches', () => {
        element('<div data-critters-surface="shelf"></div>')
        element('<section class="fi-section"><header class="fi-section-header"><h3 class="fi-section-header-heading">Orders</h3></header></section>')

        const { surfaces } = discoverSurfaces(document, filamentSurfaces)

        expect(ids(surfaces)).toEqual(['shelf', 'section:Orders'])
        expect(surfaces.map((s) => s.source)).toEqual(['marker', 'adapter'])
    })

    it('does not double count an adapter match wrapped by a marker', () => {
        element('<div data-critters-surface="wrapped"><section class="fi-section"></section></div>')

        expect(ids(discoverSurfaces(document, filamentSurfaces).surfaces)).toEqual(['wrapped'])
    })

    it('keeps logical ids unique', () => {
        const section = '<section class="fi-section"><header class="fi-section-header"><h3 class="fi-section-header-heading">Notes</h3></header></section>'

        element(section)
        element(section)

        expect(ids(discoverSurfaces(document, filamentSurfaces).surfaces)).toEqual(['section:Notes', 'section:Notes~2'])
    })

    it('ignores uncontained sections', () => {
        element('<section class="fi-section fi-section-not-contained"></section>')

        expect(discoverSurfaces(document, filamentSurfaces).surfaces).toEqual([])
    })

    it.each([
        ['an interactive element', '<button data-critters-surface="btn">x</button>', 'interactive'],
        ['a focusable element', '<div tabindex="0" data-critters-surface="focus"></div>', 'interactive'],
        ['an element inside a dialog', '<div role="dialog"><div data-critters-surface="modal"></div></div>', 'overlay'],
        ['an element inside an ignored region', '<div data-critters-ignore><div data-critters-surface="quiet"></div></div>', 'ignored'],
    ])('rejects %s even when marked', (_, html, reason) => {
        element(html)

        const { surfaces, rejected } = discoverSurfaces(document, filamentSurfaces)

        expect(surfaces).toEqual([])
        expect(rejected[0].reason).toBe(reason)
    })

    it('honors explicit opt-out markers', () => {
        element('<div data-critters-surface="none"><section class="fi-section"></section></div>')

        expect(discoverSurfaces(document, filamentSurfaces).surfaces).toEqual([])
    })
})

describe('measureSurfaces', () => {
    afterEach(() => (document.body.innerHTML = ''))

    const measure = (rect, options = {}) => {
        const el = setRect(element('<div data-critters-surface="s"></div>'), rect)
        const { surfaces } = discoverSurfaces(document)

        return measureSurfaces(surfaces, { viewport, size, ...options, element: el })
    }

    it('produces viewport-space ledges', () => {
        expect(measure({ left: -10, top: 100, width: 200, height: 40 }).measured[0]).toMatchObject({ id: 's', left: 0, right: 190, top: 100 })
    })

    it.each([
        ['too narrow for the creature', { left: 0, top: 100, width: 10, height: 40 }, 'too-narrow'],
        ['without room above it', { left: 0, top: 10, width: 200, height: 40 }, 'offscreen'],
        ['below the viewport', { left: 0, top: 350, width: 200, height: 40 }, 'offscreen'],
    ])('rejects a ledge %s', (_, rect, reason) => {
        expect(measure(rect).rejected[0].reason).toBe(reason)
    })

    it('rejects ledges whose standing band is under fixed chrome', () => {
        const occluders = [{ left: 0, right: 400, top: 0, bottom: 64 }]

        expect(measure({ left: 0, top: 70, width: 200, height: 40 }, { occluders }).rejected[0].reason).toBe('occluded')
        expect(measure({ left: 0, top: 90, width: 200, height: 40 }, { occluders }).measured).toHaveLength(1)
    })

    it('rejects removed elements', () => {
        const el = setRect(element('<div data-critters-surface="gone"></div>'), { left: 0, top: 100, width: 200, height: 40 })
        const { surfaces } = discoverSurfaces(document)

        el.remove()

        expect(measureSurfaces(surfaces, { viewport, size }).rejected[0].reason).toBe('disconnected')
    })

    it('clips ledges to scrolling ancestors and rejects ones scrolled out of them', () => {
        const scroller = element('<div style="overflow: auto"><div data-critters-surface="inner"></div></div>')
        setRect(scroller, { left: 50, top: 50, width: 100, height: 100 })
        const inner = setRect(scroller.firstElementChild, { left: 0, top: 120, width: 300, height: 20 })
        const { surfaces } = discoverSurfaces(document)

        expect(measureSurfaces(surfaces, { viewport, size }).measured[0]).toMatchObject({ left: 50, right: 150 })

        setRect(inner, { left: 0, top: 200, width: 300, height: 20 })

        expect(measureSurfaces(surfaces, { viewport, size }).rejected[0].reason).toBe('clipped')
    })
})

describe('measureUnsafe', () => {
    afterEach(() => (document.body.innerHTML = ''))

    it('collects visible interactive elements but not critters or offscreen ones', () => {
        setRect(element('<input>'), { left: 10, top: 10, width: 100, height: 30 })
        setRect(element('<button>far</button>'), { left: 10, top: 900, width: 100, height: 30 })
        setRect(element('<div data-critters-overlay><button>cat</button></div>').firstElementChild, { left: 10, top: 10, width: 10, height: 10 })

        expect(measureUnsafe(document, viewport)).toEqual([{ left: 10, right: 110, top: 10, bottom: 40 }])
    })
})

describe('SurfaceGraph', () => {
    const floor = { id: 'floor', left: 0, right: 400, top: 296 }
    const shelf = { id: 'shelf', left: 100, right: 300, top: 200 }

    it('lands ahead of the creature, clamped to the target ledge', () => {
        expect(hopTargets([floor, shelf], floor, 50, size, 1)).toEqual([{ surfaceId: 'shelf', x: 100, rise: -96 }])
        expect(hopTargets([floor, shelf], floor, 50, size, -1)).toEqual([{ surfaceId: 'shelf', x: 100, rise: -96 }])
    })

    it('respects reach', () => {
        const nearLeft = { id: 'near-left', left: 0, right: 120, top: 200 }

        // The closest landing spot (x = 100) is 280px away.
        expect(hopTargets([floor, nearLeft], floor, 380, size, 1)).toEqual([])
        expect(hopTargets([floor, nearLeft], floor, 200, size, -1)).toEqual([{ surfaceId: 'near-left', x: 100, rise: -96 }])
    })

    it('finds the support directly below', () => {
        expect(supportBelow([floor, shelf], 150, 150, size).id).toBe('shelf')
        expect(supportBelow([floor, shelf], 150, 210, size).id).toBe('floor')
        expect(supportBelow([floor, shelf], 20, 150, size).id).toBe('floor')
    })

    it('carves interactive elements out of the resting band', () => {
        const unsafe = [{ left: 150, right: 170, top: 185, bottom: 195 }]

        expect(safeIntervals(shelf, unsafe, size)).toEqual([
            [100, 126],
            [174, 280],
        ])
        // Elements below the ledge top don't matter.
        expect(safeIntervals(shelf, [{ left: 150, right: 170, top: 205, bottom: 230 }], size)).toEqual([[100, 280]])
        expect(nearestSafeX(safeIntervals(shelf, unsafe, size), 140)).toBe(126)
        expect(nearestSafeX([], 140)).toBeNull()
    })
})
