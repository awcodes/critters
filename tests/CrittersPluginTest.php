<?php

declare(strict_types=1);

use Awcodes\Critters\CrittersPlugin;
use Filament\Facades\Filament;
use Filament\Panel;
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

    $config = CrittersPlugin::make()->getConfig();

    expect($config)->toMatchArray([
        'panel' => 'admin',
        'creature' => 'cat',
        'environment' => 'panel',
        'behavior' => null,
        'region' => null,
        'interactive' => true,
        'touch' => false,
        'choices' => ['cat', 'dog', 'lizard', 'sparky', 'atlas', 'barney'],
    ])
        ->and(array_keys($config['sprites']))->toBe($config['choices'])
        ->and($config['sprites']['sparky'])->toContain('css/awcodes/critters/critters-creature-sparky.css?v=');
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
        ->each(fn ($style) => $style->toBeInstanceOf(Css::class));
});

it('renders the panel config for authenticated users', function (): void {
    $this->actingAs(User::factory()->create());

    $html = renderCrittersHook('admin');

    expect($html)->toContain('<script type="application/json" data-critters-config>');

    preg_match('/data-critters-config>(.*)<\/script>/', $html, $matches);

    expect(json_decode($matches[1], true))->toMatchArray([
        'panel' => 'admin',
        'creature' => 'cat',
        'environment' => 'panel',
        'behavior' => null,
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

it('publishes every built-in sprite but loads them only on request', function (): void {
    $panel = Panel::make()->id('probe-' . uniqid());
    $panel->plugin(CrittersPlugin::make());

    $assets = collect((fn (): array => $this->assets)->call($panel)[CrittersPlugin::ASSET_PACKAGE])
        ->keyBy(fn ($asset): string => $asset->getId());

    foreach (CrittersPlugin::BUILT_IN_CREATURES as $creature) {
        $sprite = $assets[CrittersPlugin::spriteAssetId($creature)];

        expect($sprite)->toBeInstanceOf(Css::class)
            ->and($sprite->isLoadedOnRequest())->toBeTrue()
            ->and(file_exists($sprite->getPath()))->toBeTrue();
    }

    expect($assets['critters']->isLoadedOnRequest())->toBeFalse();
});

function renderCrittersHead(string $panel): string
{
    Filament::setCurrentPanel($panel);
    Filament::getCurrentPanel()->boot();

    return (string) Filament::renderHook(PanelsRenderHook::HEAD_END);
}

it('links only the sprite of the creature shown on the page', function (): void {
    $this->actingAs(User::factory()->create());

    $html = renderCrittersHead('admin');

    expect($html)->toContain('data-critters-sprite="cat"')
        ->toContain('critters-creature-cat.css')
        ->and(substr_count($html, 'data-critters-sprite'))->toBe(1);
});

it('resolves a closure creature per request', function (): void {
    $this->actingAs(User::factory()->create());

    Filament::getPanel('admin')->getPlugin('critters')->creature(fn (): string => 'sparky');

    expect(renderCrittersHead('admin'))->toContain('data-critters-sprite="sparky"')
        ->and(renderCrittersHook('admin'))->toContain('"creature":"sparky"');
});

it('links no sprite for custom creatures or guests', function (): void {
    expect(renderCrittersHead('admin'))->not->toContain('data-critters-sprite');

    $this->actingAs(User::factory()->create());
    Filament::getPanel('admin')->getPlugin('critters')->creature('tabby');

    expect(renderCrittersHead('admin'))->not->toContain('data-critters-sprite');
});

it('names built-in creatures naturally in the pet control', function (string $creature, string $label): void {
    $this->actingAs(User::factory()->create());
    Filament::setCurrentPanel('admin');
    Filament::getCurrentPanel()->getPlugin('critters')->creature($creature);

    expect(Filament::getCurrentPanel()->getUserMenuItems()['critters-pet']->getLabel())->toBe($label);
})->with([
    ['cat', 'Pet the cat'],
    ['sparky', 'Pet Sparky'],
    ['tabby', 'Pet the tabby'],
]);

it('offers no choices in ambient mode or when turned off', function (): void {
    expect(CrittersPlugin::make()->environment('ambient')->getChoices())->toBe([])
        ->and(CrittersPlugin::make()->choices(false)->getChoices())->toBe([]);
});

it('limits choices, allows custom creatures, and needs at least two', function (): void {
    Filament::setCurrentPanel('admin');

    $config = CrittersPlugin::make()->choices(['dog', 'tabby', 'dog'])->getConfig();

    expect($config['choices'])->toBe(['dog', 'tabby'])
        ->and(array_keys($config['sprites']))->toBe(['dog'])
        ->and(CrittersPlugin::make()->choices(['dog'])->getChoices())->toBe([])
        ->and(CrittersPlugin::make()->choices(fn (): array => ['cat', 'atlas'])->getChoices())->toBe(['cat', 'atlas']);
});

it('shows the change critter menu item only when there is a choice', function (): void {
    $this->actingAs(User::factory()->create());

    Filament::setCurrentPanel('admin');
    expect(Filament::getCurrentPanel()->getUserMenuItems())->toHaveKey('critters-choose')
        ->and(Filament::getCurrentPanel()->getUserMenuItems()['critters-choose']->getAlpineClickHandler())->toBe('window.Critters?.choose()');

    Filament::setCurrentPanel('aquarium');
    expect(Filament::getCurrentPanel()->getUserMenuItems())->not->toHaveKey('critters-choose');
});

it('sends translated text and creature names to the browser', function (): void {
    Filament::setCurrentPanel('admin');

    $config = CrittersPlugin::make()->choices(['cat', 'sparky', 'tabby'])->getConfig();

    expect($config['strings'])->toMatchArray([
        'pickerTitle' => 'Choose your critter',
        'pickerClose' => 'Close',
        'petted' => 'You petted :creature.',
        'nowShowing' => 'Now showing :creature.',
    ])
        ->and($config['names'])->toBe([
            'cat' => ['title' => 'Cat', 'label' => 'the cat'],
            'sparky' => ['title' => 'Sparky', 'label' => 'Sparky'],
        ]);
});

it('follows the application locale', function (): void {
    $this->actingAs(User::factory()->create());

    app('translator')->addLines([
        'critters.menu.pet' => 'Streichle :creature',
        'critters.menu.choose' => 'Tier wechseln',
        'critters.picker.title' => 'Wähle dein Tierchen',
        'critters.announcements.petted' => 'Du hast :creature gestreichelt.',
        'critters.creatures.cat.title' => 'Katze',
        'critters.creatures.cat.label' => 'die Katze',
    ], 'de', 'critters');
    app()->setLocale('de');

    Filament::setCurrentPanel('admin');
    $panel = Filament::getCurrentPanel();
    $config = $panel->getPlugin('critters')->getConfig();

    expect($panel->getUserMenuItems()['critters-pet']->getLabel())->toBe('Streichle die Katze')
        ->and($panel->getUserMenuItems()['critters-choose']->getLabel())->toBe('Tier wechseln')
        ->and($config['strings']['pickerTitle'])->toBe('Wähle dein Tierchen')
        ->and($config['strings']['petted'])->toBe('Du hast :creature gestreichelt.')
        ->and($config['names']['cat'])->toBe(['title' => 'Katze', 'label' => 'die Katze'])
        // Untranslated keys fall back to English.
        ->and($config['strings']['pickerClose'])->toBe('Close');
});
