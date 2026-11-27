<?php

declare(strict_types=1);

namespace Workbench\App\Filament\Pages;

use Filament\Actions\Action;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Schemas\Components\Actions;
use Filament\Schemas\Components\EmbeddedSchema;
use Filament\Schemas\Components\Form;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Text;
use Filament\Schemas\Schema;

/**
 * Exercises surface discovery: explicit markers, Filament-adapter sections, a marker on
 * an interactive element (must be rejected), a removable surface and a Livewire form.
 *
 * @property-read Schema $form
 */
class SurfacesPage extends Page
{
    /** @var array<string, mixed> */
    public ?array $data = [];

    public bool $showRemovableShelf = true;

    public int $saves = 0;

    protected static ?string $title = 'Surfaces';

    protected static ?string $slug = 'surfaces';

    protected static ?int $navigationSort = 3;

    public function mount(): void
    {
        $this->form->fill();
    }

    public function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')->label('Name'),
            ])
            ->statePath('data');
    }

    public function save(): void
    {
        $this->saves++;

        Notification::make()->title('Saved')->success()->send();
    }

    public function content(Schema $schema): Schema
    {
        return $schema
            ->components([
                Form::make([EmbeddedSchema::make('form')])
                    ->id('form')
                    ->livewireSubmitHandler('save')
                    ->footer([
                        Actions::make([
                            Action::make('save')->label('Save')->submit('form'),
                        ]),
                    ]),
                Section::make('Upper shelf')
                    ->extraAttributes(['data-critters-surface' => 'upper-shelf'])
                    ->schema([Text::make('An explicitly marked surface.')]),
                Section::make('Removable shelf')
                    ->visible(fn (): bool => $this->showRemovableShelf)
                    ->extraAttributes(['data-critters-surface' => 'removable-shelf'])
                    ->schema([Text::make('Removed and restored by a Livewire action.')]),
                Actions::make([
                    Action::make('toggleRemovableShelf')
                        ->label('Toggle removable shelf')
                        ->action(fn (): bool => $this->showRemovableShelf = ! $this->showRemovableShelf),
                    Action::make('openModal')
                        ->label('Open modal')
                        ->color('gray')
                        ->modalHeading('A modal')
                        ->modalDescription('Critters hide while this is open.')
                        ->modalSubmitAction(false),
                    Action::make('markedButton')
                        ->label('Marked button')
                        ->color('gray')
                        ->extraAttributes(['data-critters-surface' => 'not-a-surface'])
                        ->action(fn (): null => null),
                ]),
                Section::make('Lower shelf')
                    ->schema([Text::make('No marker: discovered through the Filament adapter.')]),
            ]);
    }
}
