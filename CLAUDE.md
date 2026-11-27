# CLAUDE.md

## What this is

Critters (`awcodes/critters`, namespace `Awcodes\Critters`) adds small animated companions to Filament 5 panels. It is a **proof of concept** built to the spec in `plans/critters-agent-spec-v3.md` (local only, never committed). Milestone evidence, verified integration points, and deviations go in `docs/poc-findings.md`. Update it at every milestone.

## Commands

```bash
composer test           # rector --dry-run, pint --test, phpstan, pest
composer build          # npm ci, build resources/dist, rebuild the workbench, theme CSS
composer serve          # build, then serve the workbench at /admin (test@example.com / password)
npm run build           # rebuild resources/dist only; then `vendor/bin/testbench filament:assets` to republish
npx playwright test     # browser tests (serves the workbench on :8765 if not running)
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

## Workbench

Three panels: `admin` (SPA + Critters), `classic` (no SPA + Critters), `plain` (SPA, no Critters), used to test the full-load, SPA, and panel-exit lifecycles.
