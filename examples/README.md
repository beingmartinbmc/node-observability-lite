# Examples

Three minimal apps demonstrating one-line ecosystem wiring with the `development` preset.

## Run

```bash
# Express
npm install express
node examples/express

# Fastify
npm install fastify
node examples/fastify

# Koa
npm install koa
node examples/koa
```

Each example exposes:

| Path | Purpose |
|---|---|
| `/` | Sanity check |
| `/stall` | Synchronously blocks the event loop for ~500ms so the watchdog records a block |
| `/actuator` | Index of all actuator endpoints |
| `/actuator/health`, `/info`, `/metrics`, `/prometheus` | Standard actuator endpoints |
| `/actuator/eventloop`, `/eventloop/history`, `/eventloop/hotspots`, `/eventloop/metrics` | Watchdog-backed actuator endpoints |
| `/trace/recent`, `/trace/slow`, `/trace/stats`, `/trace/ui` | Per-request timelines and dashboard |

## Switching presets

Change `preset: 'development'` to `'production'` and add an `auth` function:

```js
observability.express(app, {
  preset: 'production',
  auth: req => req.get('authorization') === `Bearer ${process.env.OPS_TOKEN}`,
});
```

The `production` preset disables `/actuator/env`, `/actuator/threaddump`, and `/actuator/heapdump` and requires the auth function before any actuator or trace path is served.
