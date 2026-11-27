# CLAUDE.md

## What this is

Critters (`awcodes/critters`, namespace `Awcodes\Critters`) adds small animated companions to Filament 5 panels. It is a **proof of concept** built to the spec in `plans/critters-agent-spec-v3.md` (local only, never committed). Milestone evidence, verified integration points, and deviations go in `docs/poc-findings.md`. Update it at every milestone.

## Commands

```bash
composer test           # rector --dry-run, pint --test, phpstan, pest
composer build          # npm ci, build resources/dist, rebuild the workbench, theme CSS
composer serve          # build, then serve the workbench at /admin (test@example.com / password)
npm run build           # rebuild resources/dist only; then `vendor/bin/testbench filament:assets` to republish
npm test                # vitest unit tests (jsdom), tests/js
npm run test:browser    # playwright, tests/browser (serves the workbench on :8765 if not running)
npx playwright test --project=chromium   # one browser (the suite runs chromium, firefox, webkit)
node tests/browser/perf.measure.js     # manual perf counters + screenshots (starts the workbench if needed)
node tests/browser/memory.measure.js   # manual leak + frame-interval check (--headed for a visible browser)
```

Gotchas:

- `post-autoload-dump` purges the workbench skeleton (wipes the DB). Run `composer build` again afterwards.
- Filament rate-limits logins to 5/minute. Browser tests sign in once in `tests/browser/auth.setup.js` and share the session.
- After changing JS, rebuild **and** republish (`filament:assets`), or the workbench serves the stale bundle.

## Architecture rules

- **PHP owns config and asset registration; JS owns all movement, state, and interaction.** Config travels as a JSON `<script type="application/json" data-critters-config>` rendered by a panel-scoped `BODY_END` render hook.
- **The core runtime never imports or names Livewire.** Lifecycle comes from the DOM: `runtime/DocumentWatcher.js` notices `<body>` replacement and calls `runtime.sync(config)`. Only `integration/filament.js` may listen to `livewire:*` events, and only to pause, resume, or cancel.
- `runtime.destroy()` must release everything the runtime owns. The document watcher is page-lifetime and deliberately not owned by the runtime.
- Never make interactive elements resting surfaces; the user always stays in control of the UI.
- No production mascot (Sparky, Atlas, Barney) assets without approved source artwork. Use placeholders.

## Runtime layout (resources/js)

- `runtime/`: `CrittersRuntime` (mount/start/pause/resume/refreshSurfaces/destroy/sync, pause *reasons*), `AnimationScheduler` (the single rAF loop, clamped delta), `CreatureInstance` (behavior + environment + renderer), `skin.js` (validation, animation fallbacks, `FrameClock`), `Registry`, `random.js` (seedable), `DocumentWatcher`, `config.js`.
- `navigation/`: `SurfaceDiscovery` (markers → adapter selectors → rejection rules → viewport-space ledges, occluders, unsafe rects) and `SurfaceGraph` (hop targets, support below, safe intervals). Placements are `{ surfaceId, offset, x, y, hop }`; `offset` is relative to the ledge's left edge so creatures ride moving ledges.
- `interactions/InteractionController`: pointer states (idle/pressed/carried/reacting/settling) on the creature's hit target only; cancellation always drops a carried creature safely. The runtime owns user hide (localStorage per panel), overlay obstruction (generic `dialog[open]` + adapter selectors, 200 ms poll + adapter events), focus avoidance, the touch-only opt-out and the `role=status` announcer.
- Frame order is **read then write**: `environment.ensureMeasured` and `interactions.measure` first, then `creature.update` and `interactions.update`. Keep geometry reads out of the write phase.
- Safety decisions (walk aside, hit-target enable) only use fresh control geometry (`environment.hasFreshUnsafe()`); never act on stale rects.
- `behaviors/` pick intents and never touch the DOM. `environments/` own geometry and measure only when invalidated. `renderers/` write styles only and never read layout.
- `environments/BaseEnvironment` holds shared invalidation, observers and control geometry; `PanelEnvironment` (ledges) and `AmbientEnvironment` (one region, 2D, no surfaces) extend it. `CrittersRuntime.createEnvironment()` is the only place that branches on `config.environment`.
- Built-ins (cat + wander, fish + swim) are registered in `critters.js`. `runtime/api.js` is the experimental extension point: `window.Critters.registerCreature/registerBehavior` plus the `window.CrittersRegistrations` queue and `critters:init` event; late registrations mount a waiting panel.
- Behaviors declare `movingAction` (`walk` or `swim`); never hard-code `'walk'` outside panel-specific code.
- Built-in sprites ship as per-creature stylesheets (`resources/css/creatures/*.css` → `resources/dist/creatures/`, sprite inlined at build time) registered by the plugin only for the panel's creature; skins use `className` instead of `src`. Never put a data URL in an inline style: every transform write re-serializes it. Save sprites as **palette** PNGs.
- `.critters-creature`/`.critters-hit` force `transition: none`: positions are JS-driven, and host-page transition rules must not interpolate them.
- CI: `ci.yml` (shared PHP workflow) + repo-local `js.yml` (vitest, dist freshness, Playwright in three browsers). `resources/dist` is committed and must match `npm run build`.

## Workbench

Five panels: `admin` (SPA + cat, collapsible sidebar), `classic` (no SPA, cat, `interactive(false)`), `plain` (SPA, no Critters), `aquarium` (ambient fish in `[data-critters-region="tank"]`), `custom` (tabby + zoomies registered from `workbench/resources/js/critters-extensions.js`, sprite served by a workbench route). `/admin/surfaces` is the surface-navigation fixture (markers, adapter section, rejected marked button, removable shelf, Livewire form).

Browser-test tips: `/admin` fades `.fi-main-ctn` in, so wait for `opacity: 1` (or for the expected ledges) before measuring. Use `.critters-status`, not `getByRole('status')`, because Filament notifications also have `role=status`.

Also: pause the runtime (`runtime.pause('test')`) before forcing a placement, and assert on `creature.position` rather than the DOM until it resumes, because the renderer draws on the next frame.
