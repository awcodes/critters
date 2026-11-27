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
node tests/browser/perf.measure.js   # manual perf counters + screenshots (needs a running workbench on :8765)
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
- `behaviors/` pick intents and never touch the DOM. `environments/` own geometry and measure only when invalidated. `renderers/` write styles only and never read layout.
- Built-ins are registered in `critters.js`; `window.Critters.registerCreature/registerBehavior` is the experimental extension point.
- The placeholder cat sprite is inlined into the bundle as a data URL (esbuild `dataurl` loader).

## Workbench

Three panels: `admin` (SPA + Critters, collapsible sidebar), `classic` (no SPA + Critters), `plain` (SPA, no Critters), used to test the full-load, SPA, and panel-exit lifecycles. `/admin/surfaces` is the surface-navigation fixture (markers, adapter section, rejected marked button, removable shelf, Livewire form).

Browser-test tip: pause the runtime (`runtime.pause('test')`) before forcing a placement, and assert on `creature.position` rather than the DOM until it resumes, because the renderer draws on the next frame.
