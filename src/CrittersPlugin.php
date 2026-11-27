<?php

declare(strict_types=1);

namespace Awcodes\Critters;

use Closure;
use Filament\Contracts\Plugin;
use Filament\Panel;
use Filament\Support\Assets\Css;
use Filament\Support\Assets\Js;
use Filament\Support\Concerns\EvaluatesClosures;
use Filament\View\PanelsRenderHook;
use Illuminate\Contracts\Support\Htmlable;
use Illuminate\Support\HtmlString;
use InvalidArgumentException;

class CrittersPlugin implements Plugin
{
    use EvaluatesClosures;

    public const string ASSET_PACKAGE = 'awcodes/critters';

    public const array ENVIRONMENTS = ['panel', 'ambient'];

    protected bool | Closure $isEnabled = true;

    protected string $creature = 'cat';

    protected string $environment = 'panel';

    protected string $behavior = 'wander';

    public static function make(): static
    {
        return app(static::class);
    }

    public function getId(): string
    {
        return 'critters';
    }

    public function register(Panel $panel): void
    {
        $panel
            ->assets([
                Css::make('critters', __DIR__ . '/../resources/dist/critters.css'),
                Js::make('critters', __DIR__ . '/../resources/dist/critters.js')->navigateOnce(),
            ], self::ASSET_PACKAGE)
            ->renderHook(PanelsRenderHook::BODY_END, fn (): ?Htmlable => $this->renderConfig());
    }

    public function boot(Panel $panel): void {}

    public function enabled(bool | Closure $condition = true): static
    {
        $this->isEnabled = $condition;

        return $this;
    }

    public function creature(string $creature): static
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

    public function behavior(string $behavior): static
    {
        $this->behavior = $behavior;

        return $this;
    }

    public function isEnabled(): bool
    {
        return (bool) $this->evaluate($this->isEnabled);
    }

    /**
     * @return array{panel: string, creature: string, environment: string, behavior: string}
     */
    public function getConfig(): array
    {
        return [
            'panel' => filament()->getCurrentOrDefaultPanel()->getId(),
            'creature' => $this->creature,
            'environment' => $this->environment,
            'behavior' => $this->behavior,
        ];
    }

    protected function renderConfig(): ?Htmlable
    {
        if (! filament()->auth()->check() || ! $this->isEnabled()) {
            return null;
        }

        $json = json_encode(
            $this->getConfig(),
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR,
        );

        return new HtmlString('<script type="application/json" data-critters-config>' . $json . '</script>');
    }
}
