# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic versioning.

## Unreleased

## 0.2.1 - 2026-05-02

### Fixed

- `/actuator/eventloop`, `/actuator/eventloop/history`, `/actuator/eventloop/hotspots`, and `/actuator/eventloop/metrics` are now reachable on Express, Fastify, and Koa. The 0.2.0 release transitively pulled `node-eventloop-watchdog@1.1.0` which registered watchdog endpoints with the wrong id (`actuator/eventloop` instead of `eventloop`); 0.2.1 resolves `node-eventloop-watchdog@^1.1.1` and `node-actuator-lite@^3.2.1`, both of which include the upstream fixes. See `node-eventloop-watchdog#6` and `node-actuator-lite#8`.

### Added

- CI now runs an end-to-end smoke test job that boots the Express, Fastify, and Koa example apps and hits their actuator and trace endpoints. Catches regressions in the meta-package against the real downstream packages.
- `scripts/smoke.js` and `npm run smoke:{express,fastify,koa}` for running the same checks locally.

### Changed

- Workflows opt into the Node 24 actions runtime via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to silence the `actions/checkout@v4` and `actions/setup-node@v4` Node 20 deprecation warning.


## 0.2.0 - 2026-05-02

### Added

- `observability.fastify(app, options)` — one-line setup for Fastify apps. Registers the trace plugin, optional `preHandler` auth hook, the actuator plugin, and a `/trace/*` route.
- `observability.koa(app, options)` — one-line setup for Koa apps. Mounts the Koa trace middleware after `instrumentKoa`, optional auth middleware, an Express-to-Koa adapter for the actuator middleware, and the `/trace/*` route.
- `examples/` directory with runnable Express, Fastify, and Koa demos that include a `/stall` endpoint to exercise the watchdog.
- `USAGE.md` covering deeper option overrides, custom dependency injection, and shutdown handling.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- GitHub issue and pull request templates under `.github/`.
- README badges: npm downloads, coverage, Node version, npm provenance.
- README "Supply chain" section explaining provenance and how to verify.

### Changed

- `package.json#peerDependencies` now lists `express`, `fastify`, and `koa` as optional peer dependencies; install only the framework you use.
- Published tarball now ships `USAGE.md` and `CODE_OF_CONDUCT.md` alongside the existing docs.

## 0.1.0 - 2026-05-02

### Added

- Initial release. One-line ecosystem wiring for Express via `observability.express(app, options)`.
- Built-in presets: `production`, `development`, and `minimal`.
- Auto-mounts `node-actuator-lite`, starts `node-eventloop-watchdog`, and initialises `node-request-trace`.
- Auto-adds an `eventLoop` health indicator backed by watchdog stats and an `info.contributors.ecosystem` block listing bundled package versions.
- Optional bearer-style `auth(req)` guard for `/actuator/*` and `/trace/*` paths.
- TypeScript declarations bundled via `index.d.ts`.
- npm releases published with provenance.
