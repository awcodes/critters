<?php

declare(strict_types=1);

namespace Awcodes\Critters\Tests;

use Awcodes\Critters\CrittersServiceProvider;
use BladeUI\Heroicons\BladeHeroiconsServiceProvider;
use BladeUI\Icons\BladeIconsServiceProvider;
use Filament\Actions\ActionsServiceProvider;
use Filament\FilamentServiceProvider;
use Filament\Forms\FormsServiceProvider;
use Filament\Infolists\InfolistsServiceProvider;
use Filament\Notifications\NotificationsServiceProvider;
use Filament\Schemas\SchemasServiceProvider;
use Filament\Support\SupportServiceProvider;
use Filament\Tables\TablesServiceProvider;
use Filament\Widgets\WidgetsServiceProvider;
use Livewire\LivewireServiceProvider;
use Orchestra\Testbench\Concerns\WithWorkbench;
use Orchestra\Testbench\TestCase as Orchestra;
use RyanChandler\BladeCaptureDirective\BladeCaptureDirectiveServiceProvider;
use Workbench\App\Providers\Filament\AdminPanelProvider;
use Workbench\App\Providers\Filament\AquariumPanelProvider;
use Workbench\App\Providers\Filament\ClassicPanelProvider;
use Workbench\App\Providers\Filament\CustomPanelProvider;
use Workbench\App\Providers\Filament\PlainPanelProvider;

class TestCase extends Orchestra
{
    use WithWorkbench;

    public function getEnvironmentSetUp($app): void
    {
        $app['config']->set('app.key', 'base64:' . base64_encode(random_bytes(32)));
    }

    protected function getPackageProviders($app)
    {
        $providers = [
            ActionsServiceProvider::class,
            BladeCaptureDirectiveServiceProvider::class,
            BladeHeroiconsServiceProvider::class,
            BladeIconsServiceProvider::class,
            FilamentServiceProvider::class,
            FormsServiceProvider::class,
            InfolistsServiceProvider::class,
            LivewireServiceProvider::class,
            NotificationsServiceProvider::class,
            SchemasServiceProvider::class,
            SupportServiceProvider::class,
            TablesServiceProvider::class,
            WidgetsServiceProvider::class,
            CrittersServiceProvider::class,
        ];

        sort($providers);

        // Panel providers depend on the Filament providers above, so they register last.
        return [
            ...$providers,
            AdminPanelProvider::class,
            ClassicPanelProvider::class,
            PlainPanelProvider::class,
            AquariumPanelProvider::class,
            CustomPanelProvider::class,
        ];
    }
}
