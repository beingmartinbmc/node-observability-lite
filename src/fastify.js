'use strict';

const { buildActuatorOptions } = require('./integrations');

/**
 * Mount the full ecosystem onto a Fastify application:
 *
 * 1. `node-request-trace` Fastify plugin (if enabled)
 * 2. Optional auth `preHandler` hook for ops paths
 * 3. `node-actuator-lite` actuator plugin (with watchdog health + info contributor)
 * 4. `node-request-trace` JSON/UI router exposed via a `preHandler` route hook
 *
 * Returns the underlying actuator instance plus references to the watchdog
 * and trace singletons so callers can register custom metrics, indicators,
 * or stop them on shutdown.
 */
async function fastify(app, opts, deps) {
  if (!app || typeof app.register !== 'function' || typeof app.addHook !== 'function') {
    throw new TypeError('observability.fastify(app, options) requires a Fastify instance.');
  }

  const actuatorOpts = buildActuatorOptions(opts, deps);

  if (opts.trace.enabled && typeof deps.trace.fastifyPlugin === 'function') {
    await app.register(deps.trace.fastifyPlugin());
  }

  if (typeof opts.auth === 'function') {
    app.addHook('preHandler', createFastifyGuard(opts));
  }

  await app.register(deps.actuatorPlugin, actuatorOpts);

  // Expose the trace JSON endpoints (recent, slow, stats, single, chrome,
  // timeline, /trace/ui) under their default `/trace/*` paths. The trace
  // router is Express-compatible, so wrap it as a Fastify "all" route.
  if (opts.trace.enabled && typeof deps.trace.routes === 'function') {
    const router = deps.trace.routes();
    app.all('/trace/*', traceRouterAdapter(router));
  }

  return {
    actuator: app.actuator || null,
    watchdog: opts.watchdog.enabled ? deps.watchdog : null,
    trace: opts.trace.enabled ? deps.trace : null,
  };
}

function createFastifyGuard(opts) {
  const opsPrefixes = [opts.basePath, '/trace'];

  return async function observabilityAuthGuard(request, reply) {
    const url = request.url || request.raw?.url || '';
    if (!opsPrefixes.some((p) => url.startsWith(p))) return;

    let allowed;
    try {
      allowed = await opts.auth(request);
    } catch (err) {
      reply.code(500).send({ error: 'Auth handler error' });
      return reply;
    }
    if (!allowed) {
      reply.code(401).send({ error: 'Unauthorized' });
      return reply;
    }
  };
}

function traceRouterAdapter(router) {
  return function traceRouteHandler(request, reply) {
    return new Promise((resolve, reject) => {
      const fakeRes = createExpressResShim(reply, resolve);
      try {
        router(request.raw, fakeRes, () => {
          if (!fakeRes._consumed) {
            reply.code(404).send({ error: 'Not found' });
          }
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  };
}

function createExpressResShim(reply, resolve) {
  const shim = {
    _consumed: false,
    _statusCode: 200,
    _headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this._headers[name] = value;
      reply.header(name, value);
    },
    getHeader(name) {
      return this._headers[name];
    },
    writeHead(code, headers) {
      this._statusCode = code;
      reply.code(code);
      if (headers) {
        for (const [k, v] of Object.entries(headers)) reply.header(k, v);
      }
    },
    end(body) {
      if (this._consumed) return;
      this._consumed = true;
      reply.send(body);
      resolve();
    },
  };
  return shim;
}

module.exports = { fastify, createFastifyGuard, traceRouterAdapter };
