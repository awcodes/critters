"""
Everything that describes the built-in creatures, in one place.

`SHEET_ROWS` locates each creature's card on the source sheet ("Critters Runtime Sprite
Sheet.png"); `CREATURES` holds the runtime settings written into builtins.js.
"""

FRAME_COUNT = 14
LAND, SWIM = 'land', 'swim'

# Strip layout shared by every creature.
LAYOUT = {
    'move': [0, 1, 2, 3],
    'idle': [4, 5, 6],
    'sleep': [7, 8, 9],
    'pet': [10, 11],
    'carried': [12, 13],
}

CREATURES = {
    'cat': dict(label='the cat', kind=LAND, cell=96, speed=36, behavior='wander'),
    'dog': dict(label='the dog', kind=LAND, cell=96, speed=44, behavior='wander'),
    'lizard': dict(label='the lizard', kind=LAND, cell=96, speed=28, behavior='wander'),
    'fish': dict(label='the fish', kind=SWIM, cell=96, speed=30, behavior='swim'),
    'sparky': dict(label='Sparky', kind=LAND, cell=96, speed=40, behavior='wander'),
    'atlas': dict(label='Atlas', kind=LAND, cell=128, speed=32, behavior='wander'),
    'barney': dict(label='Barney', kind=LAND, cell=96, speed=30, behavior='wander'),
}

# Card interiors (rows, in sheet pixels) and per-frame manual fixes.
SHEET_ROWS = {
    'cat': dict(rows=(121, 213)),
    'dog': dict(rows=(227, 319)),
    'lizard': dict(rows=(332, 416)),
    'fish': dict(rows=(431, 513)),
    'sparky': dict(rows=(525, 609)),
    # Idle 5-6 carry the sheet's alert marks, drawn touching the head so the automatic
    # filter keeps them. Erase boxes are in output-cell pixels, clear of ossicones and head.
    'atlas': dict(rows=(623, 727), erase={5: [(74, 18, 96, 39)], 6: [(74, 18, 96, 39)]}),
    'barney': dict(rows=(742, 842)),
}

# Every creature is shown at the same pixel scale.
DISPLAY_SCALE = 2 / 3


def animations(name):
    move = 'swim' if CREATURES[name]['kind'] == SWIM else 'walk'
    slow = CREATURES[name]['kind'] == SWIM

    return {
        move: {'frames': LAYOUT['move'], 'fps': 6 if slow else 8},
        'idle': {'frames': [4, 4, 4, 4, 5, 4, 4, 4, 6, 6], 'fps': 4},
        'sleep': {'frames': [7, 8, 9, 8], 'fps': 1 if slow else 2},
        'pet': {'frames': [10, 11, 10, 11], 'fps': 6},
        'carried': {'frames': LAYOUT['carried'], 'fps': 4},
    }
