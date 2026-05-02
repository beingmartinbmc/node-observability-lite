'use strict';

/**
 * Minimal Koa app demonstrating one-line ecosystem wiring.
 *
 *   node examples/koa
 *
 * Then visit the same URLs documented in examples/express.
 */
const Koa = require('koa');
const observability = require('../..');

const app = new Koa();

const handle = observability.koa(app, { preset: 'development' });

app.use(async (ctx, next) => {
  if (ctx.path === '/') {
    ctx.body = { ok: true, hint: 'Visit /actuator and /trace/ui' };
    return;
  }
  if (ctx.path === '/stall') {
    const start = Date.now();
    while (Date.now() - start < 500) {
      // Simulate a synchronous block to exercise the watchdog.
    }
    ctx.body = { stalledMs: Date.now() - start };
    return;
  }
  await next();
});

const port = Number(process.env.PORT || 3002);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Koa example listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log('Watchdog stats:', handle.watchdog && handle.watchdog.getStats());
});
