"""
Validate sprite strips against the Critters sprite format.

    python bin/sprites/validate.py [resources/sprites] [build/sprites]

Checks each PNG in the sprites directory against the JSON description in the work
directory (written by build.py). Exits 1 if any check fails.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from creatures import CREATURES, FRAME_COUNT, SWIM

GROUNDED = {'walk', 'idle', 'pet', 'sleep'}


def check(name, png_path, data):
    raw = Image.open(png_path)
    strip = raw.convert('RGBA')
    alpha = np.array(strip)[..., 3]
    size = data['frameHeight']
    swims = CREATURES[name]['kind'] == SWIM
    results = {}

    def record(key, ok, detail):
        results[key] = {'ok': bool(ok), 'detail': detail}

    record('format', raw.format == 'PNG' and raw.mode in ('P', 'RGBA'), f'{raw.format} {raw.mode}')
    record('dimensions', strip.size == (data['frameWidth'] * FRAME_COUNT, size) and data['frameWidth'] == size, f'{strip.width}×{strip.height}')
    corners = [alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]]
    record('transparent corners', all(c == 0 for c in corners), str([int(c) for c in corners]))
    colours = len({tuple(p) for p in np.array(strip).reshape(-1, 4) if p[3]})
    record('palette ≤ 64', colours <= 64, f'{colours} colours')
    partial = int(((alpha > 0) & (alpha < 255)).sum())
    record('hard alpha', partial == 0, f'{partial} partial pixels')
    kb = png_path.stat().st_size / 1024
    record('size ≤ 25 KB', kb <= 25, f'{kb:.1f} KB')

    frame_of = {}
    for key, anim in data['animations'].items():
        for index in anim['frames']:
            frame_of.setdefault(index, set()).add(key)

    margins, baselines, centres, empties, move_boxes = [], [], [], [], []
    move = 'swim' if swims else 'walk'

    for i in range(FRAME_COUNT):
        cell = alpha[:, i * size:(i + 1) * size] > 0
        if not cell.any():
            empties.append(i)
            continue
        ys, xs = np.where(cell)
        margins.append(min(xs.min(), size - 1 - xs.max(), ys.min(), size - 1 - ys.max()))
        centres.append(abs((xs.min() + xs.max() + 1) / 2 - size / 2))
        if not swims and frame_of.get(i, set()) & GROUNDED:
            baselines.append(size - 1 - ys.max())
        if i in data['animations'][move]['frames']:
            move_boxes.append((xs.max() - xs.min() + 1, ys.max() - ys.min() + 1))

    record('no empty frames', not empties, f'empty: {empties}')
    record('≥ 2 px margin', bool(margins) and min(margins) >= 2, f'min margin {min(margins) if margins else "-"} px')
    if baselines:
        record('baseline ≤ 2 px', max(baselines) <= 2, f'feet {min(baselines)}–{max(baselines)} px above bottom')
    record('centred ±3 px', bool(centres) and max(centres) <= 3, f'max offset {max(centres) if centres else 0:.1f} px')
    widths, heights = [w for w, _ in move_boxes], [h for _, h in move_boxes]
    record(
        f'{move} cycle stable',
        bool(move_boxes) and (max(heights) - min(heights)) / max(heights) <= 0.10 and (max(widths) - min(widths)) / max(widths) <= 0.15,
        f'height {min(heights)}–{max(heights)}, width {min(widths)}–{max(widths)}' if move_boxes else 'no frames',
    )
    in_range = all(0 <= f < FRAME_COUNT for a in data['animations'].values() for f in a['frames'])
    fps_ok = all(isinstance(a['fps'], int) and 1 <= a['fps'] <= 12 for a in data['animations'].values())
    record('json consistent', in_range and fps_ok and data['frameCount'] == FRAME_COUNT, 'frames in range, fps 1–12')

    return results


def validate_all(sprites_dir, work_dir, log=print):
    report = {}
    failed = False

    for name in CREATURES:
        data = json.loads((work_dir / f'{name}.json').read_text())
        report[name] = results = check(name, sprites_dir / f'{name}.png', data)
        log(f'\n{name}')
        for key, result in results.items():
            failed |= not result['ok']
            log(f"  {'PASS' if result['ok'] else 'FAIL'}  {key:<20} {result['detail']}")

    (work_dir / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')

    return not failed


if __name__ == '__main__':
    sprites = Path(sys.argv[1] if len(sys.argv) > 1 else 'resources/sprites')
    work = Path(sys.argv[2] if len(sys.argv) > 2 else 'build/sprites')
    sys.exit(0 if validate_all(sprites, work) else 1)
