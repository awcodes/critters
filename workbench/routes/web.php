<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::redirect('/', '/admin');

Route::get('/workbench/theme.css', fn () => response()->file(
    __DIR__ . '/../public/css/filament/admin/theme.css',
    ['Content-Type' => 'text/css'],
))->name('workbench.theme');

Route::get('/workbench/critters/{sprite}', fn (string $sprite) => response()->file(
    __DIR__ . '/../resources/critters/' . basename($sprite),
    ['Content-Type' => 'image/png'],
))->where('sprite', '[a-z0-9-]+\.png')->name('workbench.critters.sprite');
