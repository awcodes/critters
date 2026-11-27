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
     * Built-in creatures; each sprite ships as its own stylesheet. Their names live in
     * resources/lang (`critters::critters.creatures.<name>`).
     */
    public const array BUILT_IN_CREATURES = ['cat', 'dog', 'lizard', 'fish', 'sparky', 'atlas', 'barney'];

    protected bool | Closure $isEnabled = true;

    protected bool | Closure $isInteractive = true;

    protected bool $hasTouchDevices = false;

    protected string | Closure $creature = 'cat';

    protected string $environment = 'panel';

    protected ?string $behavior = null;

    protected ?string $region = null;

    /** @var array<string> | bool | Closure */
    protected array | bool | Closure $choices = true;

    public static function make(): static
    {
        return app(static::class);
    }

    public static function spriteAssetId(string $creature): string
    {
        return "critters-creature-{$creature}";
    }

    public static function spriteAsset(string $creature): Css
    {
        return Css::make(self::spriteAssetId($creature), __DIR__ . "/../resources/dist/creatures/{$creature}.css")
            ->package(self::ASSET_PACKAGE)
            ->loadedOnRequest();
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
        foreach (self::BUILT_IN_CREATURES as $creature) {
            $assets[] = self::spriteAsset($creature);
        }

        $panel
            ->assets($assets, self::ASSET_PACKAGE)
            ->renderHook(PanelsRenderHook::HEAD_END, fn (): ?Htmlable => $this->renderSprite())
            ->renderHook(PanelsRenderHook::BODY_END, fn (): ?Htmlable => $this->renderConfig())
            ->userMenuItems([
                // Keyboard-accessible controls that work wherever the creature is on screen.
                'critters-pet' => Action::make('critters-pet')
                    ->label(fn (): string => __('critters::critters.menu.pet', ['creature' => $this->getCreatureLabel()]))
                    ->icon(Heroicon::OutlinedHeart)
                    ->alpineClickHandler('window.Critters?.pet()')
                    ->visible(fn (): bool => $this->isEnabled() && $this->isInteractive()),
                'critters-choose' => Action::make('critters-choose')
                    ->label(fn (): string => __('critters::critters.menu.choose'))
                    ->icon(Heroicon::OutlinedSparkles)
                    ->alpineClickHandler('window.Critters?.choose()')
                    ->visible(fn (): bool => $this->isEnabled() && count($this->getChoices()) > 1),
                'critters-toggle' => Action::make('critters-toggle')
                    ->label(fn (): string => __('critters::critters.menu.toggle'))
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
     * The creatures each person may switch to from the user menu. Their pick is stored in
     * their browser (per panel), so no database is involved. Defaults to every built-in
     * land creature in the panel environment; ambient panels offer none. `false` turns
     * picking off; custom (JavaScript-registered) creature names may be included.
     *
     * @param  array<string> | bool | Closure  $creatures
     */
    public function choices(array | bool | Closure $creatures = true): static
    {
        $this->choices = $creatures;

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

    public function getCreatureLabel(?string $creature = null): string
    {
        return $this->describeCreature($creature ?? $this->getCreature())['label'];
    }

    /**
     * How a creature is named in the picker (`title`) and in sentences (`label`). Built-ins
     * are translated; other creatures get a sensible English default (the JavaScript
     * definition's own title and label win in the browser).
     *
     * @return array{title: string, label: string}
     */
    public function describeCreature(string $creature): array
    {
        if (in_array($creature, self::BUILT_IN_CREATURES, true)) {
            return [
                'title' => __("critters::critters.creatures.{$creature}.title"),
                'label' => __("critters::critters.creatures.{$creature}.label"),
            ];
        }

        return ['title' => ucfirst($creature), 'label' => "the {$creature}"];
    }

    /**
     * @return array<string>
     */
    public function getChoices(): array
    {
        $choices = $this->evaluate($this->choices);

        if ($choices === false) {
            return [];
        }

        if ($choices === true) {
            $choices = $this->environment === 'ambient'
                ? []
                : array_values(array_diff(self::BUILT_IN_CREATURES, ['fish']));
        }

        $choices = array_values(array_unique(array_map(strval(...), $choices)));

        return count($choices) > 1 ? $choices : [];
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
     * @return array{panel: string, creature: string, environment: string, behavior: ?string, region: ?string, interactive: bool, touch: bool, choices: array<string>, sprites: array<string, string>, names: array<string, array{title: string, label: string}>, strings: array<string, string>}
     */
    public function getConfig(): array
    {
        $creature = $this->getCreature();

        return [
            'panel' => filament()->getCurrentOrDefaultPanel()->getId(),
            'creature' => $creature,
            'environment' => $this->environment,
            'behavior' => $this->behavior,
            'region' => $this->region,
            'interactive' => $this->isInteractive(),
            'touch' => $this->hasTouchDevices,
            'choices' => $choices = $this->getChoices(),
            // Built-in sprites a person may switch to, so the browser can load the one they pick.
            'sprites' => collect($choices)
                ->filter(fn (string $choice): bool => in_array($choice, self::BUILT_IN_CREATURES, true))
                ->mapWithKeys(fn (string $choice): array => [$choice => self::spriteAsset($choice)->getHref()])
                ->all(),
            // Translated names for built-ins on this page; custom creatures name themselves.
            'names' => collect([$creature, ...$choices])
                ->unique()
                ->filter(fn (string $name): bool => in_array($name, self::BUILT_IN_CREATURES, true))
                ->mapWithKeys(fn (string $name): array => [$name => $this->describeCreature($name)])
                ->all(),
            // Text the browser shows or announces; `:creature` is replaced with a label.
            'strings' => [
                'pickerTitle' => __('critters::critters.picker.title'),
                'pickerClose' => __('critters::critters.picker.close'),
                'petted' => __('critters::critters.announcements.petted'),
                'hidden' => __('critters::critters.announcements.hidden'),
                'shown' => __('critters::critters.announcements.shown'),
                'nowShowing' => __('critters::critters.announcements.now_showing'),
                'shownAndNowShowing' => __('critters::critters.announcements.shown_and_now_showing'),
            ],
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

        if (! $this->shouldRender() || ! in_array($creature, self::BUILT_IN_CREATURES, true)) {
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
