'use strict';

/**
 * Minimal Express app demonstrating one-line ecosystem wiring.
 *
 *   node examples/express
 *
 * Then visit:
 *   http://localhost:3000/
 *   http://localhost:3000/actuator
 *   http://localhost:3000/actuator/health
 *   http://localhost:3000/actuator/info
 *   http://localhost:3000/actuator/metrics
 *   http://localhost:3000/actuator/eventloop
 *   http://localhost:3000/trace/recent
 *   http://localhost:3000/trace/ui
 *
 * The example uses the `development` preset so no auth is required.
 * Swap in `production` plus an `auth` function for a real deployment.
 */
const express = require('express');
const observability = require('../..');

const app = express();

const handle = observability.express(app, { preset: 'development' });

app.get('/', (_req, res) => {
  res.json({ ok: true, hint: 'Visit /actuator and /trace/ui' });
});

app.get('/stall', (_req, res) => {
  const start = Date.now();
  while (Date.now() - start < 500) {
    // Simulate a synchronous block to exercise the watchdog.
  }
  res.json({ stalledMs: Date.now() - start });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Express example listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log('Watchdog stats:', handle.watchdog && handle.watchdog.getStats());
});
