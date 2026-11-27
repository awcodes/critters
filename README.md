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
    ->enabled(fn (): bool => auth()->user()?->likes_cats ?? true);
```

Critters only render for signed-in users, on panels that register the plugin.

## Development

```bash
composer serve          # build and serve the workbench at /admin (test@example.com / password)
composer test           # rector, pint, phpstan, pest
npm run build           # rebuild resources/dist
npx playwright test     # browser tests against the workbench
```

## Known limitations

See [docs/poc-findings.md](docs/poc-findings.md).

## License

The MIT License (MIT). See [LICENSE](LICENSE.md).
