/**
 * Placeholder fish extracted from concept art for the POC (see docs/poc-findings.md).
 * Strip of 10 frames, 96x96 each, facing right.
 */
export const placeholderFish = {
    label: 'fish',
    width: 56,
    height: 56,
    speed: 30,
    behavior: 'swim',
    hitboxes: {
        idle: { x: 4, y: 26, width: 48, height: 30 },
    },
    skin: {
        // The sprite ships as its own stylesheet (resources/css/creatures/fish.css), which the
        // plugin registers only on panels using this creature, keeping it out of critters.js.
        className: 'critters-skin-fish',
        frameWidth: 96,
        frameHeight: 96,
        frameCount: 10,
        facing: 'right',
        animations: {
            swim: { frames: [0, 1, 2, 3], fps: 6 },
            idle: { frames: [4, 5, 6, 5], fps: 3 },
            sleep: { frames: [7, 8, 9, 8], fps: 1 },
        },
    },
}
