import src from '../../sprites/placeholder-cat.png'

/**
 * Placeholder cat extracted from concept art for the POC (see docs/poc-findings.md).
 * Strip of 10 frames, 96x96 each, facing right, feet on the bottom edge.
 */
export const placeholderCat = {
    label: 'cat',
    width: 64,
    height: 64,
    speed: 36,
    behavior: 'wander',
    // Visible footprint per pose (display px), measured from the sprite strip.
    hitboxes: {
        walk: { x: 4, y: 19, width: 56, height: 45 },
        idle: { x: 9, y: 16, width: 46, height: 48 },
        sleep: { x: 4, y: 30, width: 56, height: 34 },
    },
    skin: {
        src,
        frameWidth: 96,
        frameHeight: 96,
        frameCount: 10,
        facing: 'right',
        animations: {
            walk: { frames: [0, 1, 2, 3], fps: 8 },
            idle: { frames: [4, 4, 4, 4, 6, 4, 4, 4, 5, 5], fps: 4 },
            sleep: { frames: [7, 8, 9, 8], fps: 2 },
        },
    },
}
