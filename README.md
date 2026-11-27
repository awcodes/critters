# Critters

Small animated companions for Filament panels: a creature that wanders along safe parts of the interface, naps, reacts when you pet it, and can be picked up and moved out of the way.

> **Status: proof of concept.** Not released, and the API is experimental. Progress, verified integration points, and limitations are recorded in [docs/poc-findings.md](docs/poc-findings.md).

## Requirements

- PHP 8.3+
- Filament 5

## Installation

```bash
composer require awcodes/critters
php artisan filament:assets
```

```php
use Awcodes\Critters\CrittersPlugin;

$panel->plugins([
    CrittersPlugin::make(),
]);
```

## Creatures

Seven creatures are built in: `cat`, `dog`, `lizard`, `fish` (for ambient mode), and Filament's mascots `sparky`, `atlas` and `barney`. Each has walk (or swim), idle, sleep, pet and carried animations. A page only downloads the sprite of the creature it shows.

## Configuration

```php
CrittersPlugin::make()
    ->creature('cat')        // or a closure, e.g. fn () => auth()->user()->critter
    ->environment('panel')   // or 'ambient'
    ->behavior('wander')     // optional; defaults to the creature's own behavior
    ->enabled(fn (): bool => auth()->user()?->likes_cats ?? true)
    ->interactive()          // pet and drag; false makes creatures fully click-through
    ->touchDevices(false);   // touch-only devices are opted out by default
```

Critters only render for signed-in users, on panels that register the plugin.

## Interacting

- **Click** a creature to pet it. **Drag** it to move it: it drops onto the nearest surface below and stays there for a while.
- The **user menu** has *Pet the cat* and *Hide or show critters*, both keyboard-accessible. Hiding is remembered per panel in this browser.
- Creatures never block the interface. They can't be clicked while passing over a control, they move away when a control they cover gets keyboard focus, and they hide while dropdowns and modals are open.
- With reduced motion enabled, creatures stay still but can still be petted and moved.

## Surfaces

Creatures walk along the bottom of the viewport and hop onto contained Filament sections. You can opt other elements in or out:

```html
<div data-critters-surface="sidebar-card">…</div>    <!-- a ledge with a stable logical id -->
<div data-critters-ignore>…</div>                     <!-- nothing inside is ever a ledge -->
```

Interactive elements (buttons, links, form controls, focusable elements, dialogs, menus) are never used as ledges, even when marked, and creatures walk aside rather than resting in front of them.

## Ambient mode

An ambient creature moves freely inside one region, for example a fish in an aquarium widget:

```php
CrittersPlugin::make()
    ->creature('fish')
    ->environment('ambient')
    ->behavior('swim')
    ->region('[data-critters-region="tank"]');   // optional; defaults to the first [data-critters-region], else the viewport
```

```html
<div data-critters-region="tank" style="height: 320px"></div>
```

## Custom creatures and behaviors (experimental)

Register your own creatures from your application's JavaScript. Load the file as a normal Filament asset; it can load before or after Critters:

```js
(window.CrittersRegistrations ||= []).push((Critters) => {
    Critters.registerCreature('tabby', {
        width: 64,
        height: 64,
        speed: 40,
        behavior: 'wander',
        skin: {
            src: '/images/critters/tabby.png',   // a horizontal strip of equal frames, transparent background
            frameWidth: 96,
            frameHeight: 96,
            frameCount: 10,
            facing: 'right',
            animations: {
                idle: { frames: [4, 5, 6], fps: 4 },    // required
                walk: { frames: [0, 1, 2, 3], fps: 8 },
                sleep: { frames: [7, 8, 9], fps: 2 },
            },
        },
    })
})
```

```php
$panel->assets([Js::make('my-critters', resource_path('js/my-critters.js'))]);

CrittersPlugin::make()->creature('tabby');
```

Missing optional animations fall back (`pet`, `carried`, `sleep` → `idle`; `walk` ⇄ `swim`). Behaviors can be registered with `Critters.registerBehavior(name, Class)`; see `docs/poc-findings.md` (M5) for the current contract. These APIs are experimental and may change.

## Sprite requirements

- One horizontal strip of equal-size frames (`frameWidth × frameHeight`, `frameCount` frames, indexed from 0, left to right), on a transparent background.
- The creature is bottom-centred in each frame: the frame's bottom edge is where it stands.
- `facing` declares which way the artwork faces; the other direction is mirrored.
- Animations list frame indices and a frame rate from 1 to 12 fps. Only `idle` is required.
- Save PNGs with a palette (indexed colour) where possible; they are a fraction of the size of RGBA.

## Development

```bash
composer serve          # build and serve the workbench at /admin (test@example.com / password)
composer test           # rector, pint, phpstan, pest
npm run build           # rebuild resources/dist
npm test                # JS unit tests
npm run test:browser    # browser tests against the workbench (Chromium, Firefox, WebKit)
```

## Known limitations

- Proof of concept: the placeholder artwork is temporary, and the JavaScript extension API is experimental.
- Touch-only devices are off by default until mobile behavior is verified.
- Surface discovery relies on a few Filament v5 class names; see the decision section in [docs/poc-findings.md](docs/poc-findings.md) for the list and the other open items.

## License

The MIT License (MIT). See [LICENSE](LICENSE.md).
