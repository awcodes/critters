import src from '../../sprites/placeholder-cat.png'

/**
 * Placeholder cat extracted from concept art for the POC (see docs/poc-findings.md).
 * Strip of 10 frames, 96x96 each, facing right, feet on the bottom edge.
 */
export const placeholderCat = {
    width: 64,
    height: 64,
    speed: 36,
    behavior: 'wander',
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
