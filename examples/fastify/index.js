'use strict';

/**
 * Minimal Fastify app demonstrating one-line ecosystem wiring.
 *
 *   node examples/fastify
 *
 * Then visit the same URLs documented in examples/express.
 */
const Fastify = require('fastify');
const observability = require('../..');

async function main() {
  const app = Fastify({ logger: false });

  const handle = await observability.fastify(app, { preset: 'development' });

  app.get('/', async () => ({ ok: true, hint: 'Visit /actuator and /trace/ui' }));

  app.get('/stall', async () => {
    const start = Date.now();
    while (Date.now() - start < 500) {
      // Simulate a synchronous block to exercise the watchdog.
    }
    return { stalledMs: Date.now() - start };
  });

  const port = Number(process.env.PORT || 3001);
  await app.listen({ port });
  // eslint-disable-next-line no-console
  console.log(`Fastify example listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log('Watchdog stats:', handle.watchdog && handle.watchdog.getStats());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
