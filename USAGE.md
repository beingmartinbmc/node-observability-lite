# Usage

Deeper documentation for advanced overrides. See [`README.md`](./README.md) for the quick start.

## Choosing an entry point

| Framework | Function | Returns |
|---|---|---|
| Express | `observability.express(app, options)` | `{ actuator, watchdog, trace }` |
| Fastify | `await observability.fastify(app, options)` | `{ actuator, watchdog, trace }` |
| Koa | `observability.koa(app, options)` | `{ actuator, watchdog, trace }` |

Each function returns the underlying actuator instance plus references to the watchdog and trace singletons (or `null` when those are disabled).

## Resolving options without mounting

```js
const observability = require('node-observability-lite');
const opts = observability.resolveOptions({ preset: 'production', auth: () => true });
console.log(opts.actuator.health.groups);
```

Useful for inspecting the merged configuration before wiring the framework, or for plugging the result into a custom integration.

## Customising actuator behaviour

Pass an `actuator` block; it is deep-merged onto the preset.

```js
observability.express(app, {
  preset: 'production',
  auth: req => true,
  actuator: {
    health: {
      groups: { liveness: ['process'], readiness: ['process', 'memory'] },
      showDetails: 'never',
    },
    info: { contributors: [{ name: 'app', collect: () => ({ version: '1.0.0' }) }] },
    prometheus: { enabled: true },
  },
});
```

Arrays in your override replace the preset values rather than concatenating.

## Customising the watchdog

```js
observability.express(app, {
  preset: 'production',
  auth: req => true,
  watchdog: {
    warningThreshold: 200,
    criticalThreshold: 1000,
    sampleInterval: 50,
    onBlock: (event) => console.log('block:', event),
  },
});
```

Set `watchdog: { enabled: false }` to skip the watchdog entirely; in that case the `eventLoop` health indicator is also omitted.

## Customising request tracing

```js
observability.express(app, {
  preset: 'production',
  auth: req => true,
  trace: {
    slowThreshold: 500,
    captureRequestBody: false,
    captureResponseBody: false,
    sampling: 1.0,
  },
});
```

Set `trace: { enabled: false }` to skip the tracer (and the `/trace/*` routes).

## Auth handler

The `auth` function receives the framework-native request:

- Express: `req` (Express request)
- Fastify: `request` (Fastify request)
- Koa: `ctx` (Koa context)

Return `true` (or a `Promise<true>`) to allow the call. Any falsy return triggers a 401, and any throw triggers a 500.

The guard runs on `/actuator/*` and `/trace/*` paths only. All other application routes are untouched.

## Disabling the auto eventLoop health indicator

```js
observability.express(app, {
  preset: 'production',
  auth: req => true,
  includeEventLoopHealthIndicator: false,
});
```

Useful if you want to register your own watchdog-backed indicator with custom thresholds.

## Custom basePath

```js
observability.express(app, {
  preset: 'production',
  auth: req => true,
  basePath: '/management',
});
```

The auth guard automatically follows `basePath`, so it now guards `/management/*` and `/trace/*`.

## Supplying your own dependencies

For testing or advanced wiring, you can inject the underlying packages explicitly via the third argument:

```js
observability.express(app, options, {
  actuatorMiddleware: require('node-actuator-lite').actuatorMiddleware,
  actuatorPlugin: require('node-actuator-lite').actuatorPlugin,
  NodeActuator: require('node-actuator-lite').NodeActuator,
  watchdog: require('node-eventloop-watchdog'),
  trace: require('node-request-trace'),
});
```

Most users do not need this. The default loader picks up the three packages automatically.

## Shutdown

The watchdog spins up a sampling timer. To stop it cleanly:

```js
const handle = observability.express(app, options);
process.on('SIGTERM', () => {
  handle.watchdog && handle.watchdog.stop();
  handle.trace && handle.trace.destroy && handle.trace.destroy();
});
```
