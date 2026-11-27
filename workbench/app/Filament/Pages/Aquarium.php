<?php

declare(strict_types=1);

namespace Workbench\App\Filament\Pages;

use Filament\Actions\Action;
use Filament\Pages\Dashboard;
use Filament\Schemas\Components\Actions;
use Filament\Schemas\Components\Html;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Text;
use Filament\Schemas\Schema;

/**
 * Ambient-mode fixture: the fish must stay inside the tank region and must ignore the
 * other sections, which are panel surfaces in the panel environment.
 */
class Aquarium extends Dashboard
{
    protected static ?string $title = 'Aquarium';

    public function content(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Tank')
                    ->schema([
                        Html::make('<div data-critters-region="tank" style="height: 320px; border-radius: 0.75rem; background: linear-gradient(#e0f2fe, #7dd3fc);"></div>'),
                    ]),
                Section::make('Not water')
                    ->schema([Text::make('A contained section the fish must ignore.')]),
                Actions::make([
                    Action::make('ping')->label('Ping')->action(fn (): null => null),
                ]),
            ]);
    }
}
