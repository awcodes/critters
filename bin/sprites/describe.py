"""
Describe built strips: JSON (measured from the pixels), preview GIFs and a contact sheet.
"""

import json

from PIL import Image, ImageDraw

from creatures import FRAME_COUNT, animations


def frames(strip):
    size = strip.height
    return [strip.crop((i * size, 0, (i + 1) * size, size)) for i in range(FRAME_COUNT)]


def union_box(cells):
    boxes = [c.getbbox() for c in cells]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)

    return {'x': x0, 'y': y0, 'width': x1 - x0, 'height': y1 - y0}


def describe(name, strip):
    """Frame geometry, animations and per-animation footprints (union of opaque pixels)."""
    strip = strip.convert('RGBA')
    cells = frames(strip)
    anims = animations(name)

    return {
        'name': name,
        'frameWidth': strip.height,
        'frameHeight': strip.height,
        'frameCount': FRAME_COUNT,
        'facing': 'right',
        'animations': anims,
        'footprints': {key: union_box([cells[i] for i in sorted(set(a['frames']))]) for key, a in anims.items()},
    }


def write_json(data, path):
    path.write_text(json.dumps(data, indent=2) + '\n')


def write_preview(name, data, strip, path):
    """Each animation at its fps for ~2 s, on light then dark, at 2x."""
    cells = frames(strip.convert('RGBA'))
    size = data['frameWidth']
    scale = 2
    out, durations = [], []

    for background in ((244, 244, 245, 255), (24, 24, 27, 255)):
        for key, anim in data['animations'].items():
            ms = round(1000 / anim['fps'])
            repeats = max(1, round(2000 / (ms * len(anim['frames']))))

            for _ in range(repeats):
                for index in anim['frames']:
                    canvas = Image.new('RGBA', (size * scale, size * scale + 14), background)
                    canvas.alpha_composite(cells[index].resize((size * scale, size * scale), Image.NEAREST), (0, 14))
                    ImageDraw.Draw(canvas).text((4, 2), f'{name} · {key}', fill=(120, 120, 130, 255))
                    out.append(canvas.convert('RGB'))
                    durations.append(ms)

    out[0].save(path, save_all=True, append_images=out[1:], duration=durations, loop=0, optimize=True)


def write_contact_sheet(strips, path):
    all_cells = {name: frames(strip.convert('RGBA')) for name, strip in strips.items()}
    cell = max(c[0].width for c in all_cells.values())
    label_w, header = 70, 16
    width = label_w + cell * FRAME_COUNT
    height = header + sum(c[0].height + 6 for c in all_cells.values())
    sheet = Image.new('RGBA', (width, height))
    px = sheet.load()

    for y in range(height):
        for x in range(width):
            px[x, y] = (150, 150, 156, 255) if ((x // 8) + (y // 8)) % 2 else (175, 175, 181, 255)

    draw = ImageDraw.Draw(sheet)

    for i in range(FRAME_COUNT):
        draw.text((label_w + i * cell + 4, 2), str(i), fill=(20, 20, 24, 255))

    y = header
    for name, cells in all_cells.items():
        draw.text((4, y + 4), name, fill=(20, 20, 24, 255))
        for i, c in enumerate(cells):
            sheet.alpha_composite(c, (label_w + i * cell, y))
        y += cells[0].height + 6

    sheet.save(path)
