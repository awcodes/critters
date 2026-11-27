/**
 * Placement math over measured ledges. Positions are a creature's top-left corner in
 * viewport space; a creature stands on a ledge when its bottom edge equals ledge.top.
 */
export const HOP_LIMITS = { maxRise: 200, maxDrop: 320, reach: 160, minHeightChange: 8 }

const SAFETY_MARGIN = 4

export const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

export function standingRange(ledge, size) {
    return [ledge.left, ledge.right - size.width]
}

/**
 * The only connection type in the POC: a hop between two ledges within reach. Returns
 * landing spots on other ledges reachable from `x` on `from`, preferring to land ahead.
 */
export function hopTargets(ledges, from, x, size, direction, limits = HOP_LIMITS) {
    const targets = []

    for (const ledge of ledges) {
        if (ledge.id === from.id) continue

        const rise = ledge.top - from.top

        if (rise < -limits.maxRise || rise > limits.maxDrop || Math.abs(rise) < limits.minHeightChange) continue

        const [min, max] = standingRange(ledge, size)

        if (max < min) continue

        const landing = clamp(x + direction * size.width, min, max)

        if (Math.abs(landing - x) > limits.reach) continue

        targets.push({ surfaceId: ledge.id, x: landing, rise })
    }

    return targets
}

/** The ledge a creature lands on when it falls from (x, bottom): the nearest one below. */
export function supportBelow(ledges, x, bottom, size) {
    const center = x + size.width / 2
    let best = null

    for (const ledge of ledges) {
        if (ledge.top < bottom - 1 || center < ledge.left || center > ledge.right) continue
        if (!best || ledge.top < best.top) best = ledge
    }

    return best
}

/** X ranges on a ledge where a resting creature covers no interactive element. */
export function safeIntervals(ledge, unsafe, size) {
    const bandTop = ledge.top - size.height
    let intervals = [standingRange(ledge, size)].filter(([a, b]) => b >= a)

    for (const rect of unsafe) {
        if (rect.bottom <= bandTop || rect.top >= ledge.top) continue

        const blockedFrom = rect.left - size.width - SAFETY_MARGIN
        const blockedTo = rect.right + SAFETY_MARGIN

        intervals = intervals.flatMap(([a, b]) => {
            if (blockedTo <= a || blockedFrom >= b) return [[a, b]]

            return [
                [a, blockedFrom],
                [blockedTo, b],
            ].filter(([c, d]) => d >= c)
        })
    }

    return intervals
}

export function nearestSafeX(intervals, x) {
    let best = null

    for (const [a, b] of intervals) {
        const candidate = clamp(x, a, b)

        if (best === null || Math.abs(candidate - x) < Math.abs(best - x)) best = candidate
    }

    return best
}
