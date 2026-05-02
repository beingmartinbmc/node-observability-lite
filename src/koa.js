'use strict';

const { buildActuatorOptions } = require('./integrations');

/**
 * Mount the full ecosystem onto a Koa application:
 *
 * 1. `node-request-trace` Koa middleware (if enabled, after `instrumentKoa`)
 * 2. Optional auth guard middleware for ops paths
 * 3. `node-actuator-lite` Express middleware wrapped in a Koa adapter
 * 4. `node-request-trace` JSON/UI router wrapped in the same Koa adapter
 *
 * Returns the underlying actuator instance plus references to the watchdog
 * and trace singletons so callers can register custom metrics, indicators,
 * or stop them on shutdown.
 */
function koa(app, opts, deps) {
  if (!app || typeof app.use !== 'function') {
    throw new TypeError('observability.koa(app, options) requires a Koa application.');
  }

  const actuatorOpts = buildActuatorOptions(opts, deps);
  const { handler, actuator } = deps.actuatorMiddleware(actuatorOpts);

  if (opts.trace.enabled && typeof deps.trace.instrumentKoa === 'function') {
    deps.trace.instrumentKoa(app);
  }
  if (opts.trace.enabled && typeof deps.trace.koaMiddleware === 'function') {
    app.use(deps.trace.koaMiddleware());
  }

  if (typeof opts.auth === 'function') {
    app.use(createKoaGuard(opts));
  }

  app.use(expressToKoa(handler, opts.basePath, '/trace'));

  if (opts.trace.enabled && typeof deps.trace.routes === 'function') {
    app.use(expressToKoa(deps.trace.routes(), '/trace'));
  }

  return {
    actuator,
    watchdog: opts.watchdog.enabled ? deps.watchdog : null,
    trace: opts.trace.enabled ? deps.trace : null,
  };
}

function createKoaGuard(opts) {
  const opsPrefixes = [opts.basePath, '/trace'];
  return async function observabilityAuthGuard(ctx, next) {
    if (!opsPrefixes.some((p) => ctx.path.startsWith(p))) {
      return next();
    }
    let allowed;
    try {
      allowed = await opts.auth(ctx);
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: 'Auth handler error' };
      return;
    }
    if (!allowed) {
      ctx.status = 401;
      ctx.body = { error: 'Unauthorized' };
      return;
    }
    return next();
  };
}

/**
 * Adapt an Express-style middleware `(req, res, next)` to a Koa middleware
 * `(ctx, next)`. The wrapped middleware is only invoked when `ctx.path`
 * starts with one of the supplied prefixes; otherwise control passes
 * straight through.
 */
function expressToKoa(handler, ...prefixes) {
  return function adaptedMiddleware(ctx, next) {
    if (prefixes.length > 0 && !prefixes.some((p) => ctx.path.startsWith(p))) {
      return next();
    }
    return new Promise((resolve, reject) => {
      let consumed = false;
      let settled = false;
      const settle = (cb) => {
        if (settled) return;
        settled = true;
        cb();
      };
      const fakeRes = createKoaResShim(ctx, () => {
        consumed = true;
        // If the handler consumed the response without calling next(), the
        // adapter is finished and the outer promise can resolve.
        settle(resolve);
      });

      const fakeReq = {
        method: ctx.method,
        url: ctx.originalUrl || ctx.url,
        originalUrl: ctx.originalUrl || ctx.url,
        path: ctx.path,
        query: ctx.query,
        headers: ctx.headers,
        get(name) { return ctx.get ? ctx.get(name) : ctx.headers[name.toLowerCase()]; },
      };

      try {
        const result = handler(fakeReq, fakeRes, (err) => {
          if (err) return settle(() => reject(err));
          if (consumed) return settle(resolve);
          settle(() => next().then(resolve, reject));
        });
        if (result && typeof result.then === 'function') {
          result.then(
            () => {
              if (consumed) return settle(resolve);
              settle(() => next().then(resolve, reject));
            },
            (err) => settle(() => reject(err)),
          );
        }
      } catch (err) {
        settle(() => reject(err));
      }
    });
  };
}

function createKoaResShim(ctx, markConsumed) {
  let pendingType = null;
  const shim = {
    _statusCode: 200,
    statusCode: 200,
    status(code) {
      this._statusCode = code;
      ctx.status = code;
      return shim;
    },
    json(body) {
      markConsumed();
      ctx.status = this._statusCode;
      ctx.type = 'application/json';
      ctx.body = body;
      return shim;
    },
    send(body) {
      markConsumed();
      ctx.status = this._statusCode;
      if (pendingType) ctx.type = pendingType;
      ctx.body = body;
      return shim;
    },
    set(name, value) {
      if (typeof name === 'string' && name.toLowerCase() === 'content-type') {
        pendingType = value;
      }
      ctx.set(name, value);
      return shim;
    },
    setHeader(name, value) {
      if (typeof name === 'string' && name.toLowerCase() === 'content-type') {
        pendingType = value;
      }
      ctx.set(name, value);
    },
    getHeader(name) {
      return ctx.response.get ? ctx.response.get(name) : undefined;
    },
    writeHead(code, headers) {
      this._statusCode = code;
      ctx.status = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) ctx.set(k, v);
      }
    },
    end(body) {
      markConsumed();
      ctx.status = this._statusCode;
      ctx.body = body;
    },
  };
  return shim;
}

module.exports = { koa, createKoaGuard, expressToKoa };
