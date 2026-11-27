"""
Rebuild the built-in creature sprites from the concept sheet.

    python bin/sprites/build.py [art/critters-sprite-sheet.png] [--work build/sprites]

Run from the repository root. Steps:

1. Extract and clean each creature's 14 frames into a palette PNG strip.
2. Describe each strip (JSON, preview GIF) and draw a contact sheet in the work directory.
3. Validate every strip; stop without touching the repository if any check fails.
4. Install the strips into resources/sprites/ and regenerate resources/js/creatures/builtins.js.

Afterwards run `npm run build` to rebuild the sprite stylesheets in resources/dist/.
"""

import argparse
import sys
from pathlib import Path

from builtins_js import render
from creatures import CREATURES
from describe import describe, write_contact_sheet, write_json, write_preview
from extract import build_strip, load_sheet
from validate import validate_all

SPRITES = Path('resources/sprites')
BUILTINS = Path('resources/js/creatures/builtins.js')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('sheet', type=Path, nargs='?', default=Path('art/critters-sprite-sheet.png'), help='the Critters runtime sprite sheet PNG (default: %(default)s)')
    parser.add_argument('--work', type=Path, default=Path('build/sprites'), help='where JSON, previews and the contact sheet go')
    args = parser.parse_args()

    if not SPRITES.is_dir():
        sys.exit('Run this from the repository root.')

    work = args.work
    work.mkdir(parents=True, exist_ok=True)
    sheet = load_sheet(args.sheet)
    strips, descriptions = {}, {}

    for name in CREATURES:
        strips[name] = strip = build_strip(name, sheet)
        strip.save(work / f'{name}.png', optimize=True)
        descriptions[name] = data = describe(name, strip)
        write_json(data, work / f'{name}.json')
        write_preview(name, data, strip, work / f'{name}-preview.gif')
        print(f'{name}: built')

    write_contact_sheet(strips, work / 'contact-sheet.png')

    if not validate_all(work, work):
        sys.exit(f'\nValidation failed; nothing was installed. See {work}/validation.json.')

    for name in CREATURES:
        (SPRITES / f'{name}.png').write_bytes((work / f'{name}.png').read_bytes())

    BUILTINS.write_text(render(descriptions))
    print(f'\nInstalled {len(CREATURES)} strips into {SPRITES}/ and regenerated {BUILTINS}.')
    print('Next: npm run build')


if __name__ == '__main__':
    main()
