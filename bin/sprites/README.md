# Sprite pipeline

Rebuilds the built-in creature sprites (`resources/sprites/*.png`) and their definitions (`resources/js/creatures/builtins.js`) from the concept sheet, `art/critters-sprite-sheet.png`. That sheet is concept art laid out in the 14-frame order. `art/` is excluded from the distributed package.

The pipeline extracts and cleans the sheet's frames; it doesn't draw new artwork.

## Run it

```bash
python3 -m venv .venv-sprites
.venv-sprites/bin/pip install -r bin/sprites/requirements.txt
.venv-sprites/bin/python bin/sprites/build.py              # uses art/critters-sprite-sheet.png
npm run build    # rebuild the sprite stylesheets in resources/dist/creatures/
```

Run from the repository root. Previews, JSON descriptions, a contact sheet and `validation.json` go to `build/sprites/` (ignored by git). Open the `*-preview.gif` files to review the motion.

If any check fails, **nothing is installed**. Running it again on the same sheet reproduces the committed PNGs byte for byte.

## What it does

1. **Finds** the 14 sprites in each creature's card row (`SHEET_ROWS` in `creatures.py`) and pads them into the gaps between them.
2. **Removes the background.** It flood-fills the dark background from each frame's edges and removes enclosed pockets of background, such as inside curled tails. It drops small marks floating above the body (`!`, `z`).
3. **Normalizes the walk/swim cycle** if the sheet drew a frame at a different size (up to ±15%).
4. **Converts to crisp pixel art** on a half-size grid. It uses one scale per creature, hard alpha, and removes leftover specks.
5. **Anchors each frame**: land creatures with feet 2 px above the cell bottom, the fish centred, all with at least 2 px margins.
6. **Writes** a 64-colour palette PNG strip: 96 px cells, or 128 px for Atlas.
7. **Validates** format, alpha, palette, margins, baseline, centring, walk-cycle stability and size.
8. **Installs** the strips and regenerates `builtins.js`. Display sizes are 2/3 of the cell, and hitboxes are the measured footprints, scaled.

## Changing things

- **Creature settings** (label, speed, behavior, cell size) and the frame-to-animation mapping live in `creatures.py`. Never edit `builtins.js` by hand.
- **Manual fixes** go in `SHEET_ROWS[...]['erase']`, as boxes in output-cell pixels per frame. Atlas uses one for the alert marks the sheet draws touching his head.
- **A new built-in creature** needs:
  - a row on the sheet;
  - entries in `CREATURES` and `SHEET_ROWS`;
  - `resources/css/creatures/<name>.css`;
  - an entry in `CrittersPlugin::BUILT_IN_CREATURES`.
