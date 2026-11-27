"""
Turn one creature's card on the concept sheet into a runtime-format sprite strip.

The sheet is concept art (opaque dark background, frames placed by eye, soft upscaled
pixels, a few decorative marks). This extracts each frame, cleans it, converts it to
crisp pixel art on a half-size grid, anchors it consistently and returns one strip. It
does not draw new artwork.
"""

from collections import deque

import numpy as np
from PIL import Image

from creatures import CREATURES, FRAME_COUNT, LAND, SHEET_ROWS

BG = np.array([22, 16, 29])
FLOOD_TOLERANCE = 22  # colour distance treated as background when connected to the edge
ENCLOSED_BG_TOLERANCE = 10  # enclosed pockets this close to the background are holes
MIN_HOLE = 10  # pixels
MIN_ISLAND = 6  # grid pixels; smaller detached specks are cleanup leftovers
MIN_PART = 0.05  # attached parts smaller than this fraction of the body are marks
CONTENT = (360, 1758)  # x range of the frame columns (right of the name labels)


def load_sheet(path):
    return np.array(Image.open(path).convert('RGB')).astype(int)


def neighbours(y, x, h, w):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ny, nx = y + dy, x + dx
            if (dy or dx) and 0 <= ny < h and 0 <= nx < w:
                yield ny, nx


def label(mask):
    h, w = mask.shape
    labels = np.zeros((h, w), int)
    sizes = {}
    n = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not labels[y, x]:
                n += 1
                labels[y, x] = n
                queue, size = deque([(y, x)]), 0
                while queue:
                    cy, cx = queue.popleft()
                    size += 1
                    for ny, nx in neighbours(cy, cx, h, w):
                        if mask[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = n
                            queue.append((ny, nx))
                sizes[n] = size
    return labels, sizes


def frame_columns(sheet, rows):
    """The 14 sprites in a card row, padded into the gaps between them."""
    y0, y1 = rows
    x0, x1 = CONTENT
    occupied = (np.abs(sheet[y0:y1, x0:x1] - BG).sum(axis=2) > 30).any(axis=0)
    runs, start = [], None
    for i, filled in enumerate(occupied):
        if filled and start is None:
            start = i
        elif not filled and start is not None:
            if i - start > 6:
                runs.append([start + x0, i + x0])
            start = None
    if len(runs) != FRAME_COUNT:
        raise SystemExit(f'Expected {FRAME_COUNT} sprites in rows {rows}, found {len(runs)}: {runs}')
    for left, right in zip(runs, runs[1:]):
        middle = (left[1] + right[0]) // 2
        left[1], right[0] = min(left[1] + 4, middle), max(right[0] - 4, middle)
    runs[0][0] -= 4
    runs[-1][1] += 4
    return [tuple(r) for r in runs]


def extract_frame(sheet, rows, cols):
    """Cut one frame: flood-fill the background from the region edge, drop holes and marks."""
    y0, y1 = rows
    x0, x1 = cols
    region = sheet[y0:y1, x0:x1]
    h, w = region.shape[:2]
    distance = np.abs(region - BG).sum(axis=2)

    background = np.zeros((h, w), bool)
    edge = [(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)]
    queue = deque()
    for y, x in edge:
        if distance[y, x] <= FLOOD_TOLERANCE and not background[y, x]:
            background[y, x] = True
            queue.append((y, x))
    while queue:
        cy, cx = queue.popleft()
        for ny, nx in neighbours(cy, cx, h, w):
            if not background[ny, nx] and distance[ny, nx] <= FLOOD_TOLERANCE:
                background[ny, nx] = True
                queue.append((ny, nx))

    # Enclosed pockets of pure background colour (inside a curled tail, between legs).
    pockets, pocket_sizes = label(~background & (distance <= ENCLOSED_BG_TOLERANCE))
    for index, size in pocket_sizes.items():
        if size >= MIN_HOLE:
            background[pockets == index] = True

    # Keep the body and sizeable attached parts; drop small marks (!, z) floating above it.
    labels, sizes = label(~background)
    biggest_id = max(sizes, key=sizes.get)
    keep = np.isin(labels, [i for i, s in sizes.items() if s >= MIN_PART * sizes[biggest_id]])
    top = np.where(labels == biggest_id)[0].min()
    keep &= np.arange(h)[:, None] >= top - 2

    ys, xs = np.where(keep)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.zeros((b - t, r - l, 4), np.uint8)
    rgba[..., :3] = region[t:b, l:r]
    rgba[..., 3] = np.where(keep[t:b, l:r], 255, 0)
    return Image.fromarray(rgba)


def harden(image):
    """Pixel art has no partial transparency."""
    a = np.array(image)
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    a[a[..., 3] == 0] = 0
    return Image.fromarray(a)


def to_grid(sprite, scale):
    w, h = sprite.size
    small = np.array(harden(sprite.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)))
    islands, sizes = label(small[..., 3] > 0)
    biggest = max(sizes, key=sizes.get)
    for index, size in sizes.items():
        if index != biggest and size < MIN_ISLAND:
            small[islands == index] = 0
    image = Image.fromarray(small)
    return image.crop(image.getbbox())


def place(sprite, grid, kind):
    """Bottom-centre (land) or centre (swim) in a grid cell with a 1-cell margin."""
    cell = Image.new('RGBA', (grid, grid), (0, 0, 0, 0))
    w, h = sprite.size
    x = (grid - w) // 2
    y = grid - 1 - h if kind == LAND else (grid - h) // 2 + grid // 8
    y = min(max(y, 1), grid - 1 - h)
    cell.alpha_composite(sprite, (x, y))
    return cell


def build_strip(name, sheet, log=print):
    """Returns the creature's strip as a 64-colour palette image."""
    creature, source = CREATURES[name], SHEET_ROWS[name]
    cell_px = creature['cell']
    grid = cell_px // 2
    sprites = [extract_frame(sheet, source['rows'], cols) for cols in frame_columns(sheet, source['rows'])]

    # Keep the walk cycle from pulsing if the sheet drew one frame at a different size.
    metric = [np.sqrt(s.width * s.height) for s in sprites[:4]]
    median = float(np.median(metric))
    for i in range(4):
        factor = min(max(median / metric[i], 0.85), 1.15)
        if abs(factor - 1) > 0.03:
            w, h = sprites[i].size
            sprites[i] = sprites[i].resize((round(w * factor), round(h * factor)), Image.LANCZOS)
            log(f'  {name}: walk frame {i} rescaled ×{factor:.3f}')

    # One scale for every frame keeps the character the same size throughout.
    biggest = max(max(s.size) for s in sprites)
    scale = min(0.5, (grid - 3) / biggest)

    strip = Image.new('RGBA', (grid * FRAME_COUNT, grid), (0, 0, 0, 0))
    for i, sprite in enumerate(sprites):
        cell = place(to_grid(sprite, scale), grid, creature['kind'])
        for x0, y0, x1, y1 in source.get('erase', {}).get(i, []):
            cell.paste((0, 0, 0, 0), (x0 // 2, y0 // 2, x1 // 2, y1 // 2))
        strip.alpha_composite(cell, (i * grid, 0))

    strip = strip.resize((cell_px * FRAME_COUNT, cell_px), Image.NEAREST)
    return strip.quantize(colors=64, method=Image.Quantize.FASTOCTREE)
