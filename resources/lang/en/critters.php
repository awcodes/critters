<?php

declare(strict_types=1);

return [

    'menu' => [
        'pet' => 'Pet :creature',
        'choose' => 'Change critter',
        'toggle' => 'Hide or show critters',
    ],

    'picker' => [
        'title' => 'Choose your critter',
        'close' => 'Close',
    ],

    // Screen-reader announcements. `:creature` is a creature's label (e.g. "the cat").
    'announcements' => [
        'petted' => 'You petted :creature.',
        'hidden' => 'Critters hidden.',
        'shown' => 'Critters shown.',
        'now_showing' => 'Now showing :creature.',
        'shown_and_now_showing' => 'Critters shown. Now showing :creature.',
    ],

    // Built-in creatures: `title` names it in the picker, `label` refers to it in sentences.
    'creatures' => [
        'cat' => ['title' => 'Cat', 'label' => 'the cat'],
        'dog' => ['title' => 'Dog', 'label' => 'the dog'],
        'lizard' => ['title' => 'Lizard', 'label' => 'the lizard'],
        'fish' => ['title' => 'Fish', 'label' => 'the fish'],
        'sparky' => ['title' => 'Sparky', 'label' => 'Sparky'],
        'atlas' => ['title' => 'Atlas', 'label' => 'Atlas'],
        'barney' => ['title' => 'Barney', 'label' => 'Barney'],
    ],

];
