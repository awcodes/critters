<?php

declare(strict_types=1);

use Awcodes\Critters\CrittersPlugin;
use Filament\Facades\Filament;
use Filament\Support\Assets\Css;
use Filament\Support\Assets\Js;
use Filament\Support\Facades\FilamentAsset;
use Filament\View\PanelsRenderHook;
use Workbench\App\Models\User;

function renderCrittersHook(string $panel): string
{
    Filament::setCurrentPanel($panel);
    Filament::getCurrentPanel()->boot();

    return (string) Filament::renderHook(PanelsRenderHook::BODY_END);
}

it('identifies itself as critters', function (): void {
    expect(CrittersPlugin::make()->getId())->toBe('critters');
});

it('has sensible defaults', function (): void {
    Filament::setCurrentPanel('admin');

    expect(CrittersPlugin::make()->getConfig())->toBe([
        'panel' => 'admin',
        'creature' => 'cat',
        'environment' => 'panel',
        'behavior' => 'wander',
        'region' => null,
        'interactive' => true,
        'touch' => false,
    ]);
});

it('stores configured creature, environment and behavior', function (): void {
    Filament::setCurrentPanel('admin');

    $config = CrittersPlugin::make()
        ->creature('fish')
        ->environment('ambient')
        ->behavior('swim')
        ->region('#tank')
        ->getConfig();

    expect($config)->toMatchArray([
        'creature' => 'fish',
        'environment' => 'ambient',
        'behavior' => 'swim',
        'region' => '#tank',
    ]);
});

it('rejects unknown environments', function (): void {
    CrittersPlugin::make()->environment('ocean');
})->throws(InvalidArgumentException::class, 'Critters environment [ocean] is not supported');

it('evaluates the enabled condition lazily', function (): void {
    $enabled = false;
    $plugin = CrittersPlugin::make()->enabled(function () use (&$enabled): bool {
        return $enabled;
    });

    expect($plugin->isEnabled())->toBeFalse();

    $enabled = true;

    expect($plugin->isEnabled())->toBeTrue();
});

it('registers its script and stylesheet under the awcodes/critters package', function (): void {
    Filament::setCurrentPanel('admin');
    Filament::getCurrentPanel()->boot();

    $scripts = FilamentAsset::getScripts([CrittersPlugin::ASSET_PACKAGE]);
    $styles = FilamentAsset::getStyles([CrittersPlugin::ASSET_PACKAGE]);

    // In the console every panel registers its assets so `filament:assets` can publish
    // them, so the same asset can appear once per panel here. Over HTTP only the current
    // panel boots (asserted in tests/browser/lifecycle.spec.js).
    expect($scripts)->not->toBeEmpty()
        ->each(fn ($script) => $script
            ->toBeInstanceOf(Js::class)
            ->getId()->toBe('critters')
            ->isNavigateOnce()->toBeTrue())
        ->and($styles)->not->toBeEmpty()
        ->each(fn ($style) => $style->toBeInstanceOf(Css::class)->getId()->toBe('critters'));
});

it('renders the panel config for authenticated users', function (): void {
    $this->actingAs(User::factory()->create());

    $html = renderCrittersHook('admin');

    expect($html)->toContain('<script type="application/json" data-critters-config>');

    preg_match('/data-critters-config>(.*)<\/script>/', $html, $matches);

    expect(json_decode($matches[1], true))->toBe([
        'panel' => 'admin',
        'creature' => 'cat',
        'environment' => 'panel',
        'behavior' => 'wander',
        'region' => null,
        'interactive' => true,
        'touch' => false,
    ]);
});

it('renders nothing for guests', function (): void {
    expect(renderCrittersHook('admin'))->not->toContain('data-critters-config');
});

it('renders nothing on a panel without the plugin', function (): void {
    $this->actingAs(User::factory()->create());

    expect(renderCrittersHook('plain'))->not->toContain('data-critters-config');
});

it('renders nothing when disabled', function (): void {
    $this->actingAs(User::factory()->create());

    Filament::getPanel('admin')->getPlugin('critters')->enabled(false);

    expect(renderCrittersHook('admin'))->not->toContain('data-critters-config');
});

it('escapes config values so they cannot break out of the script tag', function (): void {
    $this->actingAs(User::factory()->create());

    Filament::getPanel('admin')->getPlugin('critters')->creature('</script><script>alert(1)</script>');

    $html = renderCrittersHook('admin');

    expect($html)->not->toContain('<script>alert(1)')
        ->and(substr_count($html, '</script>'))->toBe(1);
});

it('serializes interactivity and touch settings', function (): void {
    Filament::setCurrentPanel('admin');

    expect(CrittersPlugin::make()->interactive(fn (): bool => false)->touchDevices()->getConfig())
        ->toMatchArray(['interactive' => false, 'touch' => true]);
});

it('adds keyboard-accessible pet and hide controls to the user menu', function (): void {
    $this->actingAs(User::factory()->create());
    Filament::setCurrentPanel('admin');

    $items = Filament::getCurrentPanel()->getUserMenuItems();

    expect($items)->toHaveKeys(['critters-pet', 'critters-toggle'])
        ->and($items['critters-pet']->getAlpineClickHandler())->toBe('window.Critters?.pet()')
        ->and($items['critters-toggle']->getAlpineClickHandler())->toBe('window.Critters?.toggleHidden()')
        ->and($items['critters-pet']->isVisible())->toBeTrue();
});

it('hides the pet control when interactions are disabled', function (): void {
    $this->actingAs(User::factory()->create());
    Filament::setCurrentPanel('admin');
    Filament::getCurrentPanel()->getPlugin('critters')->interactive(false);

    $items = Filament::getCurrentPanel()->getUserMenuItems();

    expect($items)->not->toHaveKey('critters-pet')
        ->toHaveKey('critters-toggle');
});
