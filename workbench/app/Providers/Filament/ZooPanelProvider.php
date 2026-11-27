<?php

declare(strict_types=1);

namespace Workbench\App\Providers\Filament;

use Awcodes\Critters\CrittersPlugin;
use Filament\Http\Middleware\Authenticate;
use Filament\Http\Middleware\AuthenticateSession;
use Filament\Http\Middleware\DisableBladeIconComponents;
use Filament\Http\Middleware\DispatchServingFilamentEvent;
use Filament\Pages\Dashboard;
use Filament\Panel;
use Filament\PanelProvider;
use Filament\Support\Assets\Theme;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;
use Workbench\App\Filament\Pages\Auth\Login;
use Workbench\App\Filament\Pages\SecondPage;

class ZooPanelProvider extends PanelProvider
{
    /** The fish lives in the aquarium panel (ambient mode). */
    public const array CREATURES = ['cat', 'dog', 'lizard', 'sparky', 'atlas', 'barney'];

    public function panel(Panel $panel): Panel
    {
        return $panel
            ->id('zoo')
            ->path('zoo')
            ->login(Login::class)
            ->spa()
            ->plugins([
                // Preview any built-in land creature: /zoo?critter=sparky (remembered in the session).
                CrittersPlugin::make()->creature(function (): string {
                    $choice = request()->query('critter');

                    if (is_string($choice) && in_array($choice, self::CREATURES, true)) {
                        session(['zoo.critter' => $choice]);
                    }

                    return session('zoo.critter', 'dog');
                }),
            ])
            ->theme(Theme::make('workbench')->html(
                fn (): string => route('workbench.theme'),
            ))
            ->pages([
                Dashboard::class,
                SecondPage::class,
            ])
            ->middleware([
                EncryptCookies::class,
                AddQueuedCookiesToResponse::class,
                StartSession::class,
                AuthenticateSession::class,
                ShareErrorsFromSession::class,
                $this->csrfMiddleware(),
                SubstituteBindings::class,
                DisableBladeIconComponents::class,
                DispatchServingFilamentEvent::class,
            ])
            ->authMiddleware([
                Authenticate::class,
            ]);
    }

    /**
     * @return class-string
     */
    private function csrfMiddleware(): string
    {
        // PreventRequestForgery replaced VerifyCsrfToken in Laravel 13. Laravel 12 rows
        // in the CI matrix don't have it yet, so fall back there, as Filament's own panel
        // generator does.
        return class_exists(PreventRequestForgery::class)
            ? PreventRequestForgery::class
            : VerifyCsrfToken::class;
    }
}
