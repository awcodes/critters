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

## M3: surface navigation

**Gate result: pass, in the real Filament workbench.** The cat discovers ledges and hops between them, rides a ledge while the page scrolls, and falls to the ledge below when its own is removed or scrolls under the top bar. A hop is cancelled into a fall when its target disappears mid-flight. The cat walks aside rather than resting in front of a control, and stays correct through sidebar collapse, Livewire form submissions and back/forward navigation. Evidence: 72 Vitest tests and 22 browser tests, stable across 3 repeat runs (`tests/browser/surfaces.spec.js` covers M3).

### Workbench

`/admin/surfaces` (`workbench/app/Filament/Pages/SurfacesPage.php`) contains:

- a Livewire form (name input and Save button);
- an explicitly marked section (`upper-shelf`);
- a marked section that a Livewire action removes and restores (`removable-shelf`);
- an action row in which one button carries `data-critters-surface` (it must be rejected);
- an unmarked contained section, found by the Filament adapter (`section:Lower shelf`).

The admin panel is now `->sidebarCollapsibleOnDesktop()`.

### Discovery and classification (`navigation/SurfaceDiscovery.js`)

1. **Explicit markers first:** `[data-critters-surface="<logical-id>"]`, with an optional `data-critters-surface-type` (default `perch`). `data-critters-surface="none"` and `data-critters-ignore` exclude a whole region.
2. **Filament adapter second** (`integration/filament.js`), deliberately small:
   - `.fi-section:not(.fi-section-not-contained)` — contained card sections. Class names verified in `vendor/filament/schemas/resources/views/components/section.blade.php`.
   - Logical ID: `section#<id>`, otherwise `section:<heading text>`, otherwise `section:<index>`. Repeated IDs get a `~n` suffix.
3. **Filament quirk:** `Section::make()->extraAttributes()` lands on a wrapper `div.fi-sc-section`, not on the `.fi-section` itself. An adapter match inside a marker is therefore skipped, so the same section isn't counted twice.
4. **Rejected even when marked:**
   - interactive elements (links, buttons, form controls, focusable `tabindex`, interactive ARIA roles, `contenteditable`);
   - anything inside a dialog, menu, listbox, popover or `aria-modal`;
   - anything inside the Critters overlay.

   Verified: the marked button is reported as `{ id: 'not-a-surface', reason: 'interactive' }`.
5. **Clipping ancestors** (computed `overflow` not visible) are found once per discovery, not per measurement.

### Geometry (one batch per frame, only after invalidation)

- Each candidate becomes a viewport-space ledge `{ id, left, right, top }` from `getBoundingClientRect()`, in the same coordinate space as the fixed overlay. The span is clipped to the viewport and to any clipping ancestors.
- A ledge is rejected when it is:
  - disconnected;
  - hidden (`checkVisibility`);
  - narrower than the creature;
  - without room above it inside the viewport;
  - scrolled out of a clipping ancestor;
  - **occluded**: the creature's standing band would overlap fixed chrome. The adapter names `.fi-topbar` as an occluder (sticky, `z-30`).
- The viewport floor (Stage A) is always present as the `floor` ledge, so there is always a fallback.

### Invalidation and observation (`environments/PanelEnvironment.js`)

| Source | Effect |
| --- | --- |
| `scroll` on `window` (capture, passive, so nested scrollers count too) | re-measure |
| `ResizeObserver` on `<html>` and every discovered surface element | re-measure (catches sidebar collapse, content growth) |
| `MutationObserver` (`childList`, `subtree`) on `<body>`, ignoring mutations inside the overlay | rediscover and re-measure (Livewire morphs, Alpine `x-if`) |
| `window` and `visualViewport` resize, `runtime.sync()` after `<body>` replacement | rediscover and re-measure |

- Invalidation only sets flags. Measuring happens once, in the next animation frame. The body observer re-binds to the new `<body>` after SPA navigation.
- `destroy()` disconnects all observers and listeners (unit-tested).
- Elements that move without resizing and without a scroll (CSS transforms or animations) are **not** detected. That's acceptable for Filament layouts, but recorded as a limitation.

### Placement, hops and falls (`navigation/SurfaceGraph.js`)

- **Anchoring:** a placement stores its ledge ID and its offset from the ledge's left edge, so the cat rides along when the ledge scrolls or shifts (verified with scrolling and sidebar collapse). Logical IDs, not DOM nodes, connect measurements over time.
- **The single transition type is a hop.** A target ledge qualifies when:
  - it is at most 200 px higher or 320 px lower;
  - the height difference is at least 8 px;
  - a landing spot exists within 160 px horizontally.

  The flight is a parabolic arc lasting `0.4 s + |rise|/700`. The landing point follows the target ledge if it moves mid-flight. No general pathfinding.
- **Behavior decides, environment resolves:** the environment offers abstract options (`{ rise, distance }`), and `WanderBehavior.chooseHop()` takes one about 0.15 times per second while walking, or with probability 0.6 when blocked at a ledge's end. Otherwise the cat turns around.
- **Falls:** if a creature's ledge disappears (removed, scrolled under the top bar, clipped away), it falls to the nearest ledge below its centre, and ultimately to the floor. A hop whose target vanishes is cancelled into a fall from the creature's current position. A cancelled hop that hasn't left its origin falls back onto that origin, which is physically correct. Relocation is always animated, never a teleport.
- **Animation fallbacks added:** `hop → walk`, `fall → hop → walk`.

### Safe settling

- When the behavior wants to rest (`idle` or `sleep`), the environment checks the creature's standing band against the visible interactive elements, with a 4 px margin.
- If the cat would cover one, it walks to the nearest safe spot on its ledge first. If the ledge has no safe spot, it keeps walking rather than settling. Walking past a control is allowed because the overlay is click-through.
- Verified in the browser: dropped in front of the Save button, the cat walks aside before idling.
- The interactive-element measurements are reused while invalidations keep arriving (150 ms quiet period), so continuous scrolling doesn't query every control on every frame.

### Bug found: Livewire back/forward restores a dead overlay

- Livewire stores the page HTML for back/forward restoration (`updateCurrentPageHtmlInHistoryStateForLaterBackButtonClicks()`), and that snapshot includes the Critters overlay. Restoring it put an inert copy of the overlay and cat next to the live one (2 overlays).
- **Fix (framework-agnostic):** `runtime.sync()` removes every `[data-critters-overlay]` that isn't the runtime's own. It is counted in `stats.strays` and asserted in the back/forward browser test.

### Measurements (headless Chromium, `tests/browser/perf.measure.js`)

| Scenario | Layouts | Style recalcs | Script ms | Task ms | Surface measurements |
| --- | --- | --- | --- | --- | --- |
| Surfaces page, ~5.5 s of wheel scrolling, runtime destroyed | 1 | 1 | 0 | 72 | 0 |
| Same, sleeping cat riding a shelf | **0** forced | 417 | 186 | 467 | 102 (≈ one per scroll event, batched) |

M2 figures (walking and sleeping on the floor) are unchanged within noise. Surface measurement reads geometry only after the browser has laid out the frame, so it never forces a synchronous layout.

### Limitations and carried-forward items

- **Boundary** surfaces (walls or no-go zones as a separate type) are not implemented. Excluded regions cover the POC need.
- Hops don't check for obstacles in their flight path, since the overlay is click-through. They are also free to land in front of a control; the creature then walks aside before resting.
- **For M4:** when creature hit targets become `pointer-events: auto`, a cat walking across a control would briefly intercept clicks. Hit targets need to be disabled while overlapping unsafe regions, or while moving.
- **For M4:** dropdowns (`z-20`) and modals (`z-40` and up) are not occluders yet. The overlay sits at `z-35`, so it can draw over an open dropdown. M4 handles open overlays explicitly.
- `contain: strict` on the overlay and per-frame `transform` writes keep style recalcs cheap. Recalc counts track frames, not DOM size.

## M4: core interactions and safety

**Gate result: pass.** In the real workbench the cat can be petted (by pointer or keyboard), dragged and dropped onto a safe ledge where it stays put. Interrupted drags always recover. A cat crossing a control never blocks it, and a keyboard-focused control sends the cat away. Critters hide while Filament dropdowns and modals are open and can be hidden at any time from the user menu. Evidence: 94 Vitest tests, 13 new browser tests (`tests/browser/interactions.spec.js`, 35 browser tests in total), all stable across 3 repeat runs, and 15 Pest tests.

### Interaction model (`interactions/InteractionController.js`)

- **States:** `idle → pressed → (carried | reacting) → settling → idle`, independent of the behavior. The creature itself has modes `auto`, `carried` and `reacting`, so behavior is suspended while a person is in control.
- **Hit target:** a child element of the creature that receives pointer events. It is sized to the **visible footprint per pose** (`hitboxes` in the creature definition, measured from the sprite: walk 56×45, sitting 46×48, sleeping 56×34 display px) and mirrored with the sprite. The overlay and stage stay `pointer-events: none`. There is never a page-wide capture surface.
- **Pet:** a press released within 6 px. Plays `pet` (falling back to `idle` for the placeholder) plus a floating heart, holds still for 1.2 s, then returns to behavior. It also posts the status message "You petted the cat."
- **Drag:** more than 6 px of movement after a press. Uses `setPointerCapture`; the creature follows the pointer keeping its grab offset, clamped to the viewport. No long press is needed with a mouse. A completed drag never triggers a pet.
- **Drop:** falls to the nearest ledge below the release point (the floor at worst), then stays for a random 10–20 s (`stay`) resting. Safety still applies during the stay: if the landing spot is in front of a control, the cat walks aside first (seen in the browser when dropped under the action buttons).
- **Cancellation:** a carried creature is dropped safely on any of `pointercancel`, `lostpointercapture`, Livewire navigation (adapter: `livewire:navigating` → `cancelInteractions`), a hidden tab, an opening overlay, user hide, disable, or runtime teardown. Capture is always released. Per the Pointer Events spec, `lostpointercapture` arrives with the *next* pointer event; real input always provides one.
- **Native side effects:** `pointerdown` is `preventDefault`ed (no text selection or focus theft), `dragstart` is cancelled, and the click that follows a press is swallowed at the hit target, so it never reaches the page. `touch-action: none` applies to the hit target only, never the panel.
- **Attention:** `pointerenter` on the hit target makes a walking cat pause for 1.5 s. Sleeping cats ignore it.

### Safety

- **Never blocking controls:** the hit target is disabled whenever the creature's footprint overlaps a visible interactive element. This is checked at most every 100 ms, with fresh geometry only. Verified: with the cat drawn over the Save button, a real click submits the form.
- **Keyboard focus:** a `focusin` on an element under the creature sends it walking away from that element for 2.5 s (verified with the Save button).
- **Open overlays:** creatures fade out, pause, and drop anything carried while any of these exist:
  - `dialog[open]` (generic);
  - from the Filament adapter: `.fi-modal.fi-modal-open` (modals and slide-overs) and `.fi-dropdown-panel[style*="display: block"]` (dropdowns; this is the open test `support/resources/js/components/dropdown.js` uses).

  Filament's `x-modal-opened` and `modal-closed` events trigger an immediate check; a 200 ms poll is the safety net. This sidesteps the `z-35` versus dropdown `z-20` layering problem noted in M1 entirely.
- **Hide control:** user menu → "Hide or show critters" (an `Action` with `alpineClickHandler`, so there is no Livewire round trip). It is keyboard-operable (verified by focus plus Enter), works wherever the creature is, persists per panel in `localStorage` (`critters:<panel>:hidden`) and is announced. Hidden creatures are `display: none`, so fully click-through.
- **Keyboard petting:** user menu → "Pet the cat". If the menu is still closing (the dropdown counts as an obstruction), the pet is queued and plays as soon as it closes.
- **`interactive(false)`:** the hit target stays `pointer-events: none` and the pet menu item is hidden. Verified on the `classic` panel with `elementFromPoint`.
- **Touch-only devices** (`(hover: none) and (pointer: coarse)`): not mounted unless `touchDevices()` is enabled. Verified with a Playwright mobile context. This is the spec's conservative default; real touch testing is still to do.

### Accessibility

- The overlay is now `overlay > stage[aria-hidden=true] + status[role=status]`. Sprites and hearts are hidden from assistive technology; the visually hidden status region announces hide, show and pet. No sprite is ever in the tab order. The keyboard path is the user menu.
- **Reduced motion:** no loop runs, and pointer and keyboard interactions still work. Petting shows the pet frame and a non-moving heart for 1.2 s; drag and drop place the creature directly onto its ledge (verified with no frames scheduled).

### PHP API additions

`CrittersPlugin::make()->interactive(bool|Closure)` and `->touchDevices(bool)`, serialized as `interactive` and `touch` in the config block. The plugin registers the user-menu items `critters-pet` and `critters-toggle`; their visibility follows `enabled()` and `interactive()`.

### Bugs found by M4 testing

1. **Filament fades the main container in.** `.fi-main-ctn` starts at `opacity-0 transition-all` (`filament/resources/css/components/layout.css`) when the desktop sidebar is collapsible. Surfaces measured in the first ~300 ms are correctly "hidden", but an opacity transition triggers no observer, so they could stay hidden until something else invalidated. **Fix:** the environment also re-measures on `transitionend` and `animationend` (ignoring its own), on window `load`, and on `document.fonts.ready`. That also covers layout that slides without resizing.
2. **Safety decisions on stale geometry (present since M3).** During scrolling, cached control positions (reused for 150 ms while invalidations keep arriving) were compared against freshly measured ledges. A resting cat therefore saw controls in the wrong place and flapped between walking and resting about 10 times in 5 s. Each flip resized the hit target and forced a layout. **Fix:** safety decisions and hit-target checks run only on fresh control geometry; otherwise the creature keeps doing what it was doing. After the fix, scroll-scenario style recalcs dropped from 418 to 113 and script time from 200 ms to 77 ms. The M3 scroll figures included this bug.

The per-frame update is also now split into a **read phase** (environment measurement, hit-target check) followed by a **write phase** (behavior, movement, styles).

### Measurements (headless Chromium, `tests/browser/perf.measure.js`)

| Scenario | Layouts | Style recalcs | Script ms | Task ms |
| --- | --- | --- | --- | --- |
| Cat walking on the floor, 10 s | 1 | 600 | 258 | 579 |
| Cat sleeping on the floor, 10 s | 1 | 20 | 51 | 181 |
| Surfaces page, ~5.5 s wheel scrolling, no Critters | 1 | 1 | 0 | 74 |
| Same, sleeping cat riding a shelf | 1 | 113 | 77 | 230 |

The single layout in each row is the measurement window catching the page's own initial layout, not a per-frame cost.

### Limitations and notes

- Slide-overs share `.fi-modal-open` with modals and so are covered by the same selector, but the workbench has no slide-over test yet.
- The overlay hides for *any* open dropdown, including the user menu, rather than only dropdowns overlapping the creature. That's simple and safe; it could be refined with geometry later.
- Interactive-element geometry used for safety lags by up to 150 ms after scrolling stops. During that window a resting creature may briefly sit over a control, with its hit target state frozen. This is the trade-off for not flapping.
- The placeholder has no `pet` or `carried` frames, so both fall back to sitting. The heart is the lightweight response the spec allows.

## Deviations from the spec

- Critters are not rendered on Filament auth pages (login and similar). The spec does not mention them, and a companion before sign-in adds nothing.
- `Creatures/PlaceholderCat.php` and `Support/CrittersConfig.php` are deferred. Config lives on the plugin until creature registration (M2/M5) shows what PHP actually needs to own.
