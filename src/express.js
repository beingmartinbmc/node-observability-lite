'use strict';

const { buildActuatorOptions } = require('./integrations');

/**
 * Mount the full ecosystem onto an Express application:
 *
 * 1. `node-request-trace` middleware (if enabled)
 * 2. Optional bearer-style auth guard for ops paths
 * 3. `node-actuator-lite` middleware (with watchdog health + info contributor)
 * 4. `node-request-trace` JSON/UI router (if enabled)
 *
 * Returns the underlying actuator instance plus references to the watchdog
 * and trace singletons so callers can register custom metrics, indicators,
 * or stop them on shutdown.
 */
function express(app, opts, deps) {
  if (!app || typeof app.use !== 'function') {
    throw new TypeError('observability.express(app, options) requires an Express application.');
  }

  const actuatorOpts = buildActuatorOptions(opts, deps);
  const { handler, actuator } = deps.actuatorMiddleware(actuatorOpts);

  if (opts.trace.enabled) {
    app.use(deps.trace.middleware());
  }

  if (typeof opts.auth === 'function') {
    app.use(createGuard(opts));
  }

  app.use(handler);

  if (opts.trace.enabled && typeof deps.trace.routes === 'function') {
    app.use(deps.trace.routes());
  }

  return {
    actuator,
    watchdog: opts.watchdog.enabled ? deps.watchdog : null,
    trace: opts.trace.enabled ? deps.trace : null,
  };
}

function createGuard(opts) {
  const opsPrefixes = [opts.basePath, '/trace'];

  return function observabilityAuthGuard(req, res, next) {
    const path = req.path || req.url || '';
    if (!opsPrefixes.some((p) => path.startsWith(p))) {
      return next();
    }
    let allowed;
    try {
      allowed = opts.auth(req);
    } catch (err) {
      return res.status(500).json({ error: 'Auth handler error' });
    }
    if (!allowed) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  };
}

module.exports = { express, createGuard };
