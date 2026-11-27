# Critters POC findings

Living record of verified integration points, measurements, deviations and risks, kept per milestone. Everything here was checked against installed source or a real browser; anything not yet verified is listed under open questions.

## Verified stack

| Package | Version |
| --- | --- |
| `filament/filament` | v5.12.0 |
| `livewire/livewire` | v4.4.10 (resolved through Filament; not required directly) |
| `laravel/framework` | v13.44.1 |
| PHP (local) | 8.4.28 |
| `@playwright/test` | 1.65.1 (Chromium) |

## M1: framework and source audit

**Gate result: pass.** Mount, lifecycle, and asset strategy are proven in a real Filament v5 workbench (`tests/browser/lifecycle.spec.js`, 7/7 passing), with PHP coverage in `tests/CrittersPluginTest.php`.

### Plugin contract

- `Filament\Contracts\Plugin` (`vendor/filament/filament/src/Contracts/Plugin.php`): `getId(): string`, `register(Panel $panel): void`, `boot(Panel $panel): void`.
- `Panel::plugin()` (`src/Panel/Concerns/HasPlugins.php`) calls `$plugin->register($this)` **immediately** when the panel is configured. Fluent configuration chained before `->plugins([...])` is therefore already applied, but anything request-dependent (auth, the `enabled()` closure) must be evaluated lazily at render time, not in `register()`.

### Asset registration and per-panel isolation

- `Panel::assets(array $assets, string $package = 'app')` (`src/Panel/Concerns/HasAssets.php`) only stores assets; `Panel::registerAssets()` forwards them to `FilamentAsset::register()`.
- `Panel::register()` calls `registerAssets()` **only when running in the console** (so `filament:assets` publishes every panel's assets). `Panel::boot()` calls it for the **current panel only** on HTTP requests (`src/Panel.php`).
- Consequence: registering assets through `$panel->assets([...], 'awcodes/critters')` inside the plugin's `register()` gives per-panel isolation without any custom logic. Verified: the `plain` panel (no plugin) loads no Critters script or stylesheet.
- In console and test contexts the same asset appears once per panel that uses the plugin. Harmless, but tests must not assume a single registration.
- Published paths: `public/js/awcodes/critters/critters.js`, `public/css/awcodes/critters/critters.css`.
- `Js::navigateOnce()` (`vendor/filament/support/src/Assets/Js.php`) adds `data-navigate-once` only when the panel has SPA mode; `data-navigate-track` is always added in SPA mode.
- `FilamentAsset::registerScriptData()` is **global** (merged into one `window.filamentData`), so it is not used for per-panel config.

### Config transport

- Per-panel config is rendered by a `PanelsRenderHook::BODY_END` hook registered with `$panel->renderHook()`. Panel render hooks are registered in `Panel::boot()` → `registerRenderHooks()`, so they are also scoped to the current panel.
- Format: `<script type="application/json" data-critters-config>…</script>`, encoded with `JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT`. A non-executable JSON block cannot run code, and the hex flags stop a value from closing the tag (covered by a test).
- The hook renders nothing for guests (Critters stay off auth pages) or when `enabled()` evaluates false.

### Navigation lifecycle (Livewire 4 navigate, used by `->spa()`)

Source: `vendor/livewire/livewire/dist/livewire.js`, `js/plugins/navigate`.

- `swapCurrentPageWithNewHtml()` replaces the **entire `<body>`** with `document.body.replaceWith(newBody)` and merges `<head>`. Anything mounted inside the body is discarded unless it carries `x-persist` (an Alpine mechanism).
- `<html>` survives; only its attributes are synchronized (`replaceHtmlAttributes()`).
- Body `<script>` tags in the new page are re-executed (`prepNewBodyScriptTagsToRun()`), except `data-navigate-once` scripts whose hash matches a script already seen.
- Events, in order: `livewire:navigate` (cancelable, before fetch) → `livewire:navigating` (before the swap, exposes `onSwap`) → `livewire:navigated` (after the new page is initialized). Livewire forwards these from `alpine:navigate*`.
- Filament itself relies on all three (`filament/resources/js/stores/sidebar.js`, `notifications/resources/js/components/notifications.js`, `support/resources/js/components/dropdown.js`, the dark-mode script in `components/layout/base.blade.php`). That makes them de facto supported for the adapter.

### Chosen lifecycle strategy

- **The core runtime is framework-agnostic.** A page-lifetime `MutationObserver` on `document.documentElement` (`childList` only, so it is cheap) detects `<body>` replacement from the DOM alone (`resources/js/runtime/DocumentWatcher.js`). It then calls `runtime.sync(readConfig())`, which:
  - re-attaches the existing overlay node to the new body when config is unchanged (one runtime, no remount);
  - remounts when the config differs (for example, a different panel with Critters);
  - destroys when the new page has no config (leaving the panel, or disabled).
- **The Filament adapter** (`resources/js/integration/filament.js`) is the only module that names Livewire events, and only pauses on `livewire:navigating` and resumes on `livewire:navigated`. It will also be the place to cancel an in-flight drag before the swap (M4).
- **Single runtime per document:** the script is served with `data-navigate-once` and guarded by a `window.Critters` singleton. Verified: the script is not re-requested on SPA navigation, and the runtime object identity survives 6 navigations.
- **Design correction found by the browser spike:** the document observer originally lived inside the runtime and was disconnected by `destroy()`, so returning to a Critters panel after leaving it never remounted. The watcher now lives for the page, while `destroy()` still fully cleans up the runtime's own resources, as the spec requires.

### Browser evidence (`tests/browser/lifecycle.spec.js`)

| Scenario | Result |
| --- | --- |
| Auth pages render no config or overlay | pass |
| Initial load: 1 config, 1 overlay, 1 mount, state `running` | pass |
| 3 SPA round trips: same runtime object, 1 mount, 6 re-attachments, 1 overlay | pass |
| Non-SPA (`classic`) panel: fresh single mount per full page load | pass |
| SPA to a panel without the plugin destroys; SPA back remounts (2 mounts, 1 overlay) | pass |
| Script is tagged `data-navigate-once` and is not re-requested on SPA navigation | pass |

### Layering (from source; to be verified in-browser in M3/M4)

Filament z-index map: sidebar `z-20` on desktop and `z-30` on mobile (`filament/resources/css/components/sidebar.css`); topbar `sticky z-30` (`topbar.css`); dropdown panels `z-20` (`support/resources/css/components/dropdown/index.css`); modal overlay and window `z-40`, stacked modals `z-50` (`support/resources/css/components/modal.css`); notifications `z-50`.

The overlay is currently `position: fixed; z-index: 35; pointer-events: none`, which is above the topbar and below modals. Dropdowns at `z-20` would render **under** a creature. Planned handling: hide or pause while any `.fi-modal.fi-modal-open` exists (Filament also dispatches `x-modal-opened` on `document` and `modal-closed` from the modal element), and avoid settling over open dropdowns. Stacking contexts created by Filament's layout ancestors must be measured in the browser before the final value is fixed.

### Workbench

- Package skeleton follows the fleet workbench standard and `awcodes/thermal`: Testbench workbench, `composer build` / `composer serve`, login prefilled (`test@example.com` / `password`).
- Three panels exercise the lifecycle: `admin` (SPA, Critters), `classic` (no SPA, Critters), `plain` (SPA, no Critters).
- JS is bundled with esbuild (`bin/build.js`, the fleet's existing pattern) into `resources/dist/`. No framework or runtime dependencies.

### Open questions carried forward

1. **Livewire component updates** (form submissions, actions) morph component subtrees, not the body. The overlay is a direct `<body>` child outside any component, so it should be untouched. Verify with a form page in M3.
2. **Surface invalidation after morphs:** component updates can replace surface elements without replacing the body. M3 needs scoped `MutationObserver`s on surface roots in addition to the body watcher.
3. **Sidebar collapse** animates layout width without a window resize; plan a `ResizeObserver` on `.fi-main` and surface elements (M3).
4. **Back/forward from the snapshot cache** uses the same swap path, so the same strategy should hold. Add a browser test in M3.
5. **Final z-index and stacking contexts**: see Layering above.

## M2: basic creature runtime

**Gate result: pass.** The placeholder cat walks, idles and sleeps on the viewport floor (Stage A). Evidence: one animation loop after SPA navigation, delta-time movement independent of refresh rate, and full cleanup on destroy. 39 Vitest unit tests (`tests/js`) and 7 new browser tests (`tests/browser/creature.spec.js`) pass, alongside the 7 M1 lifecycle tests.

### What was built

| Module | Responsibility |
| --- | --- |
| `runtime/AnimationScheduler.js` | The single `requestAnimationFrame` loop. Delta in seconds, clamped to 100 ms so a resumed tab doesn't teleport creatures; restart resets the clock; `start()` is idempotent. |
| `runtime/skin.js` | Skin validation, animation fallbacks (`swim → walk → idle`; `sleep`, `pet`, `carried → idle`), FPS clamped to 1–12, and `FrameClock`, which advances sprite frames at the animation's cadence rather than per display frame. |
| `behaviors/WanderBehavior.js` | Weighted walk/idle/sleep table with randomized durations and a seedable RNG. Sleep always wakes into idle. Turns when the environment reports `blocked`. No DOM access. |
| `environments/PanelEnvironment.js` | Stage A viewport floor. Measures `documentElement.clientWidth/Height` only when invalidated (resize, `visualViewport` resize, `sync`), never per frame. Constrains positions after the viewport shrinks. |
| `renderers/DomSpriteRenderer.js` | One element per creature: background-position window into a horizontal strip, `translate3d` plus `scaleX` for facing. Writes a style only when its value changed and never reads layout. |
| `runtime/CreatureInstance.js` | Wires behavior intent → environment step → frame clock → renderer. |
| `runtime/Registry.js` | Creature and behavior registry. Validates skins on registration. Exposed experimentally as `window.Critters.registerCreature/registerBehavior`. |
| `runtime/CrittersRuntime.js` | Now owns the scheduler, environment, creature and every listener. Pausing is tracked as a set of *reasons* (`hidden`, `navigation`, `user`), so a navigation that ends while the tab is hidden doesn't restart the loop. States: `idle`, `mounted`, `running`, `paused`, `static`. |

- **Reduced motion:** with `prefers-reduced-motion: reduce` no loop runs. The cat is drawn once, sleeping, and is redrawn only on resize. The preference is observed live through `matchMedia` `change`.
- **Hidden tabs:** `visibilitychange` adds and removes the `hidden` pause reason. The browser test confirms the scheduler tick count stops.

### Placeholder sprite

- Source: the **cat row** of `Pixel Animal and Mascot Animation Sheet.png` (local concept art: 1536×1024, opaque background, frames placed by eye rather than on a grid). It is **illustrative concept art**, not a runtime-ready sheet.
- Extraction (one-off, outside the repo): key out the card background (RGB 22,17,32, colour-distance threshold 40), keep each frame's main connected component (which drops the `!` alert and `zZz` marks), pack bottom-centred into 96×96 cells, then quantize to 64 colours. Result: `resources/sprites/placeholder-cat.png`, 960×96, 10 frames, true alpha, 19 KB (89 KB before quantizing).
- Frames: walk 0–3 (8 fps), idle 4–6 (4 fps, mostly sitting with occasional alert and blink frames), sleep 7–9 (2 fps). Facing right, feet on the cell's bottom edge, displayed at 64×64 CSS px.
- Verified visually on light and dark Filament backgrounds; there is no visible fringing from the keyed background.
- **The Filament mascot rows (Sparky, Atlas, Barney) were not extracted or used.** The spec requires approved source artwork first.
- The sprite is inlined into `critters.js` as a data URL (esbuild `dataurl` loader). Filament has no image asset type, and inlining avoids URL resolution entirely for the built-in creature. Bundle: 36.7 KB minified, of which about 26 KB is the sprite. Consumer creatures will reference their own URLs, to be designed in M5.

### Sprite contract as implemented (input for the post-POC skill)

- One horizontal strip; every frame `frameWidth × frameHeight`; `frameCount` frames, indexed from 0, left to right.
- Transparent background; creature bottom-centred in each cell, so the cell's bottom edge is the floor contact line.
- `facing: 'right' | 'left'` declares the art's natural direction; the renderer mirrors as needed.
- `animations: { [name]: { frames: number[], fps: 1–12 } }`. Only `idle` is required; the fallbacks are listed above. Frame lists may repeat indices to shape timing.
- Display size (`width`/`height`) is set by the creature definition, separately from the source cell size.

### Measurements (headless Chromium 1280×800, 10 s window, `tests/browser/perf.measure.js`)

| Scenario | Layouts | Style recalcs | Style ms | Script ms | Task ms | JS heap |
| --- | --- | --- | --- | --- | --- | --- |
| Plain panel (no Critters) | 0 | 0 | 0 | 0 | 1.3 | 3.4 MB |
| Cat walking | **0** | 600 (one per frame) | 100 | 232 | 541 | 5.9 MB |
| Cat sleeping | **0** | 20 (2 fps frame changes) | 4 | 33 | 160 | 2.7 MB |

- No forced layouts while animating. Geometry reads happen only on invalidation.
- Walking costs about 2.3% script and 5.4% total main-thread task time in headless mode. Sleeping costs about 0.3% script.
- The loop still ticks at display rate while the cat is idle or sleeping, even though nothing moves. If headed production profiling in M6 shows this matters, the scheduler can drop to timer-driven frame changes in non-moving states.

### Risks and notes

- The concept-art cat is slightly soft (it's upscaled "pixel style" art rather than true 1:1 pixel art). It's fine for a placeholder, but production skins should be authored at their true pixel grid.
- The 64 px display box is larger than the visible cat (the cell has padding above sitting and sleeping poses). M4 hitboxes must follow the visible bounds per action, not the cell.
- The JS unit and browser suites are not yet in CI: the shared `awcodes/.github` workflow is PHP-only. This has to be resolved before M6.

## Deviations from the spec

- Critters are not rendered on Filament auth pages (login and similar). The spec does not mention them, and a companion before sign-in adds nothing.
- `Creatures/PlaceholderCat.php` and `Support/CrittersConfig.php` are deferred. Config lives on the plugin until creature registration (M2/M5) shows what PHP actually needs to own.
