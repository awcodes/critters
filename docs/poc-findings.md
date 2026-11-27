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

## Deviations from the spec

- Critters are not rendered on Filament auth pages (login and similar). The spec does not mention them, and a companion before sign-in adds nothing.
- `Creatures/PlaceholderCat.php` and `Support/CrittersConfig.php` are deferred. Config lives on the plugin until creature registration (M2/M5) shows what PHP actually needs to own.
