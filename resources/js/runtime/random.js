/** Small seedable PRNG (mulberry32) so behavior can be replayed in tests. */
export function createRandom(seed = Date.now()) {
    let state = seed >>> 0

    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    return {
        next,
        between: (min, max) => min + next() * (max - min),
        pick(weights) {
            const entries = Object.entries(weights).filter(([, weight]) => weight > 0)
            const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
            let roll = next() * total

            for (const [key, weight] of entries) {
                roll -= weight

                if (roll < 0) {
                    return key
                }
            }

            return entries[entries.length - 1][0]
        },
    }
}
