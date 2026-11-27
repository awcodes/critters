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

## Configuration

```php
CrittersPlugin::make()
    ->creature('cat')
    ->environment('panel')   // or 'ambient'
    ->behavior('wander')
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

## Development

```bash
composer serve          # build and serve the workbench at /admin (test@example.com / password)
composer test           # rector, pint, phpstan, pest
npm run build           # rebuild resources/dist
npm test                # JS unit tests
npm run test:browser    # browser tests against the workbench
```

## Known limitations

See [docs/poc-findings.md](docs/poc-findings.md).

## License

The MIT License (MIT). See [LICENSE](LICENSE.md).
