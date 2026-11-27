<?php

declare(strict_types=1);

namespace Workbench\App\Filament\Pages;

use Filament\Pages\Dashboard;

class SecondPage extends Dashboard
{
    protected static string $routePath = 'second';

    protected static ?string $title = 'Second page';

    protected static ?int $navigationSort = 2;
}
