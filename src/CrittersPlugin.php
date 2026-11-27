<?php

declare(strict_types=1);

namespace Awcodes\Critters;

use Closure;
use Filament\Actions\Action;
use Filament\Contracts\Plugin;
use Filament\Panel;
use Filament\Support\Assets\Css;
use Filament\Support\Assets\Js;
use Filament\Support\Concerns\EvaluatesClosures;
use Filament\Support\Facades\FilamentAsset;
use Filament\Support\Icons\Heroicon;
use Filament\View\PanelsRenderHook;
use Illuminate\Contracts\Support\Htmlable;
use Illuminate\Support\HtmlString;
use InvalidArgumentException;

class CrittersPlugin implements Plugin
{
    use EvaluatesClosures;

    public const string ASSET_PACKAGE = 'awcodes/critters';

    public const array ENVIRONMENTS = ['panel', 'ambient'];

    /**
     * Built-in creatures (each sprite ships as its own stylesheet) and how to refer to them.
     */
    public const array BUILT_IN_CREATURES = [
        'cat' => 'the cat',
        'dog' => 'the dog',
        'lizard' => 'the lizard',
        'fish' => 'the fish',
        'sparky' => 'Sparky',
        'atlas' => 'Atlas',
        'barney' => 'Barney',
    ];

    protected bool | Closure $isEnabled = true;

    protected bool | Closure $isInteractive = true;

    protected bool $hasTouchDevices = false;

    protected string | Closure $creature = 'cat';

    protected string $environment = 'panel';

    protected ?string $behavior = null;

    protected ?string $region = null;

    public static function make(): static
    {
        return app(static::class);
    }

    public static function spriteAssetId(string $creature): string
    {
        return "critters-creature-{$creature}";
    }

    public function getId(): string
    {
        return 'critters';
    }

    public function register(Panel $panel): void
    {
        $assets = [
            Css::make('critters', __DIR__ . '/../resources/dist/critters.css'),
            Js::make('critters', __DIR__ . '/../resources/dist/critters.js')->navigateOnce(),
        ];

        // Every built-in sprite is published, but only the creature shown on a page is linked
        // (see renderSprite()), which also lets the creature be chosen per request or per user.
        foreach (array_keys(self::BUILT_IN_CREATURES) as $creature) {
            $assets[] = Css::make(self::spriteAssetId($creature), __DIR__ . "/../resources/dist/creatures/{$creature}.css")->loadedOnRequest();
        }

        $panel
            ->assets($assets, self::ASSET_PACKAGE)
            ->renderHook(PanelsRenderHook::HEAD_END, fn (): ?Htmlable => $this->renderSprite())
            ->renderHook(PanelsRenderHook::BODY_END, fn (): ?Htmlable => $this->renderConfig())
            ->userMenuItems([
                // Keyboard-accessible controls that work wherever the creature is on screen.
                'critters-pet' => Action::make('critters-pet')
                    ->label(fn (): string => __('Pet :creature', ['creature' => $this->getCreatureLabel()]))
                    ->icon(Heroicon::OutlinedHeart)
                    ->alpineClickHandler('window.Critters?.pet()')
                    ->visible(fn (): bool => $this->isEnabled() && $this->isInteractive()),
                'critters-toggle' => Action::make('critters-toggle')
                    ->label(__('Hide or show critters'))
                    ->icon(Heroicon::OutlinedEyeSlash)
                    ->alpineClickHandler('window.Critters?.toggleHidden()')
                    ->visible(fn (): bool => $this->isEnabled()),
            ]);
    }

    public function boot(Panel $panel): void {}

    public function enabled(bool | Closure $condition = true): static
    {
        $this->isEnabled = $condition;

        return $this;
    }

    /**
     * When false, creatures are fully click-through: no petting or dragging.
     */
    public function interactive(bool | Closure $condition = true): static
    {
        $this->isInteractive = $condition;

        return $this;
    }

    /**
     * Touch-only devices are opted out by default until mobile behavior is verified.
     */
    public function touchDevices(bool $condition = true): static
    {
        $this->hasTouchDevices = $condition;

        return $this;
    }

    /**
     * A built-in creature (cat, dog, lizard, fish, sparky, atlas, barney) or one registered
     * from JavaScript. A closure is evaluated per request, e.g. to let each user pick.
     */
    public function creature(string | Closure $creature): static
    {
        $this->creature = $creature;

        return $this;
    }

    public function environment(string $environment): static
    {
        if (! in_array($environment, self::ENVIRONMENTS, true)) {
            throw new InvalidArgumentException(sprintf(
                'Critters environment [%s] is not supported. Use one of: %s.',
                $environment,
                implode(', ', self::ENVIRONMENTS),
            ));
        }

        $this->environment = $environment;

        return $this;
    }

    /**
     * Defaults to the creature's own behavior (built-ins: `wander`, or `swim` for the fish).
     */
    public function behavior(?string $behavior): static
    {
        $this->behavior = $behavior;

        return $this;
    }

    /**
     * The CSS selector of the element an ambient creature lives in. Without one, ambient
     * creatures use the first `[data-critters-region]` element, else the viewport.
     */
    public function region(?string $selector): static
    {
        $this->region = $selector;

        return $this;
    }

    public function getCreature(): string
    {
        return (string) $this->evaluate($this->creature);
    }

    public function getCreatureLabel(): string
    {
        $creature = $this->getCreature();

        return self::BUILT_IN_CREATURES[$creature] ?? "the {$creature}";
    }

    public function isEnabled(): bool
    {
        return (bool) $this->evaluate($this->isEnabled);
    }

    public function isInteractive(): bool
    {
        return (bool) $this->evaluate($this->isInteractive);
    }

    /**
     * @return array{panel: string, creature: string, environment: string, behavior: ?string, region: ?string, interactive: bool, touch: bool}
     */
    public function getConfig(): array
    {
        return [
            'panel' => filament()->getCurrentOrDefaultPanel()->getId(),
            'creature' => $this->getCreature(),
            'environment' => $this->environment,
            'behavior' => $this->behavior,
            'region' => $this->region,
            'interactive' => $this->isInteractive(),
            'touch' => $this->hasTouchDevices,
        ];
    }

    protected function shouldRender(): bool
    {
        return filament()->auth()->check() && $this->isEnabled();
    }

    /**
     * Links the built-in sprite for this page's creature from <head>, so it is render-blocking
     * and cached like any stylesheet. Custom creatures bring their own image.
     */
    protected function renderSprite(): ?Htmlable
    {
        $creature = $this->getCreature();

        if (! $this->shouldRender() || ! array_key_exists($creature, self::BUILT_IN_CREATURES)) {
            return null;
        }

        $href = FilamentAsset::getStyleHref(self::spriteAssetId($creature), self::ASSET_PACKAGE);

        return new HtmlString('<link rel="stylesheet" href="' . e($href) . '" data-critters-sprite="' . e($creature) . '" />');
    }

    protected function renderConfig(): ?Htmlable
    {
        if (! $this->shouldRender()) {
            return null;
        }

        $json = json_encode(
            $this->getConfig(),
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR,
        );

        return new HtmlString('<script type="application/json" data-critters-config>' . $json . '</script>');
    }
}
