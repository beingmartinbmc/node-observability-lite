# node-observability-lite

[![npm version](https://img.shields.io/npm/v/node-observability-lite.svg)](https://www.npmjs.com/package/node-observability-lite)
[![npm downloads](https://img.shields.io/npm/dm/node-observability-lite.svg)](https://www.npmjs.com/package/node-observability-lite)
[![CI](https://github.com/beingmartinbmc/node-observability-lite/actions/workflows/ci.yml/badge.svg)](https://github.com/beingmartinbmc/node-observability-lite/actions/workflows/ci.yml)
[![Coverage: >=90%](https://img.shields.io/badge/coverage-%3E%3D90%25-brightgreen)](./.github/workflows/ci.yml)
[![Node >= 18](https://img.shields.io/node/v/node-observability-lite.svg)](https://nodejs.org)
[![Provenance](https://img.shields.io/badge/npm-provenance-blue?logo=npm)](https://docs.npmjs.com/generating-provenance-statements)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

One-line lightweight observability for Node.js. Wires together three small, independent packages so you get health, info, metrics, request timelines, and event-loop watchdog without OpenTelemetry, agents, collectors, or vendor tooling.

## What you get

- **`node-actuator-lite`** — Spring Boot-style `/actuator/health`, `/info`, `/metrics`, `/env`, `/threaddump`, `/heapdump`, and `/prometheus` endpoints.
- **`node-eventloop-watchdog`** — Detects event-loop stalls, captures stack traces and hotspots, and triggers recovery.
- **`node-request-trace`** — Per-request timelines, browser dashboard, and CLI without OpenTelemetry.

When all three are wired together by this package:

- The watchdog auto-registers `/actuator/eventloop`, `/actuator/eventloop/history`, `/actuator/eventloop/hotspots`, and `/actuator/eventloop/metrics`.
- Block events include the active request id, route, and method captured by `node-request-trace`.
- A custom `eventLoop` health indicator marks the process `DOWN` when blocks pile up.
- An `info.contributors.ecosystem` block surfaces the bundled package versions.

## Install

```bash
npm install node-observability-lite
```

> Requires **Node.js >= 18**. Express is an optional peer dependency.

## Quick start (Express)

```js
const express = require('express');
const observability = require('node-observability-lite');

const app = express();

observability.express(app, {
  preset: 'production',
  auth: (req) => req.get('authorization') === `Bearer ${process.env.OPS_TOKEN}`,
});

app.get('/', (_req, res) => res.json({ ok: true }));

app.listen(3000);
```

That gives you, behind the bearer token:

```
GET  /actuator
GET  /actuator/health
GET  /actuator/info
GET  /actuator/metrics
GET  /actuator/prometheus
GET  /actuator/eventloop
GET  /actuator/eventloop/history
GET  /actuator/eventloop/hotspots
GET  /actuator/eventloop/metrics
GET  /trace/recent
GET  /trace/slow
GET  /trace/stats
GET  /trace/ui
```

## Presets

| Preset | Sensitive endpoints | Watchdog | Trace | Auth required |
|---|---|---|---|---|
| `production` (default) | env / heapdump / threaddump disabled | observe mode | enabled | yes |
| `development` | all enabled | observe mode | enabled | no |
| `minimal` | env / heapdump / threaddump disabled | disabled | disabled | no |

Override anything per-package:

```js
observability.express(app, {
  preset: 'production',
  auth: req => true,
  basePath: '/management',
  actuator: {
    health: { groups: { liveness: ['process'] } },
  },
  watchdog: {
    warningThreshold: 200,
    criticalThreshold: 1000,
  },
  trace: {
    slowThreshold: 500,
  },
});
```

## API

### `observability.express(app, options): { actuator, watchdog, trace }`

Mounts the trace middleware, optional auth guard, the actuator middleware, and the trace dashboard router on an Express app, and starts the event-loop watchdog. Returns the underlying actuator instance plus references to the watchdog and trace singletons (or `null` when those are disabled by the resolved preset).

### `observability.resolveOptions(options): ResolvedOptions`

Resolves a user options object against the chosen preset. Useful for inspection or for plugging the result into a custom integration.

### `observability.listPresets(): string[]`

Returns the names of built-in presets.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `preset` | `'production' \| 'development' \| 'minimal'` | `'production'` | Built-in baseline. |
| `basePath` | `string` | `'/actuator'` | Actuator base path; also used by the auth guard. |
| `auth` | `(req) => boolean \| Promise<boolean>` | none | Required when the preset enforces auth. Receives the Express request. |
| `requireAuth` | `boolean` | preset value | Force-enable or disable the auth guard. |
| `includeEventLoopHealthIndicator` | `boolean` | `true` | Add the auto-generated `eventLoop` health indicator. |
| `actuator` | object | preset values | Deep-merged onto the preset actuator options. See `node-actuator-lite`. |
| `watchdog` | object | preset values | Deep-merged onto the preset watchdog options. See `node-eventloop-watchdog`. |
| `trace` | object | preset values | Deep-merged onto the preset trace options. See `node-request-trace`. |

## Production safety

- `production` preset disables `env`, `threaddump`, and `heapdump` endpoints.
- `production` preset requires an `auth` function before any actuator or trace path is served.
- The auth guard runs before any actuator/trace middleware.

## Supply chain

Releases are published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements) so you can verify the origin of every published version:

```bash
npm view node-observability-lite --json | jq '.dist'
```

The release workflow runs on tagged commits in this repository, executes lint/typecheck/coverage gate, and only then publishes to npm with `--provenance --access public`.

See [`SECURITY.md`](./SECURITY.md) for how to report vulnerabilities.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Issues and PRs are welcome.

## License

MIT
