<?php

declare(strict_types=1);

namespace Awcodes\Critters;

use Spatie\LaravelPackageTools\Package;
use Spatie\LaravelPackageTools\PackageServiceProvider;

class CrittersServiceProvider extends PackageServiceProvider
{
    public static string $name = 'critters';

    public function configurePackage(Package $package): void
    {
        $package->name(static::$name)
            ->hasTranslations();
    }
}
