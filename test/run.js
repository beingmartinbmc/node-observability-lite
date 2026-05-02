'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { resolveOptions } = require('../src/options');
const { listPresets, getPreset, PRESETS } = require('../src/presets');
const { buildActuatorOptions } = require('../src/integrations');
const { express, createGuard } = require('../src/express');
const { fastify, createFastifyGuard, traceRouterAdapter } = require('../src/fastify');
const { koa, createKoaGuard, expressToKoa } = require('../src/koa');

// =============================================================================
// Presets
// =============================================================================

describe('presets', () => {
  test('listPresets returns all built-in presets', () => {
    assert.deepEqual(listPresets().sort(), ['development', 'minimal', 'production']);
  });

  test('getPreset returns production by default', () => {
    const p = getPreset();
    assert.equal(p, PRESETS.production);
  });

  test('getPreset throws on unknown preset', () => {
    assert.throws(() => getPreset('nope'), /Unknown preset/);
  });

  test('production preset enforces auth and disables sensitive endpoints', () => {
    const p = PRESETS.production;
    assert.equal(p.requireAuth, true);
    assert.equal(p.actuator.env.enabled, false);
    assert.equal(p.actuator.heapDump.enabled, false);
    assert.equal(p.actuator.threadDump.enabled, false);
    assert.equal(p.actuator.prometheus.enabled, true);
    assert.equal(p.watchdog.enabled, true);
    assert.equal(p.trace.enabled, true);
  });

  test('minimal preset disables watchdog and trace', () => {
    const p = PRESETS.minimal;
    assert.equal(p.watchdog.enabled, false);
    assert.equal(p.trace.enabled, false);
    assert.equal(p.requireAuth, false);
  });

  test('development preset enables sensitive endpoints', () => {
    const p = PRESETS.development;
    assert.equal(p.actuator.env.enabled, true);
    assert.equal(p.actuator.heapDump.enabled, true);
    assert.equal(p.actuator.threadDump.enabled, true);
    assert.equal(p.requireAuth, false);
  });
});

// =============================================================================
// Options resolution
// =============================================================================

describe('resolveOptions', () => {
  test('throws when options is not an object', () => {
    assert.throws(() => resolveOptions(42), /Options must be an object/);
  });

  test('throws when production preset has no auth handler', () => {
    assert.throws(() => resolveOptions({ preset: 'production' }), /requires authentication/);
  });

  test('production preset accepts an auth handler', () => {
    const auth = () => true;
    const opts = resolveOptions({ preset: 'production', auth });
    assert.equal(opts.preset, 'production');
    assert.equal(opts.requireAuth, true);
    assert.equal(opts.auth, auth);
    assert.equal(opts.basePath, '/actuator');
  });

  test('user overrides deep-merge into the preset', () => {
    const opts = resolveOptions({
      preset: 'development',
      actuator: { health: { showDetails: 'never' } },
      watchdog: { warningThreshold: 999 },
    });

    assert.equal(opts.actuator.health.showDetails, 'never');
    assert.equal(opts.actuator.env.enabled, true);
    assert.equal(opts.watchdog.warningThreshold, 999);
    assert.equal(opts.watchdog.enabled, true);
  });

  test('arrays in overrides replace preset values rather than merging', () => {
    const opts = resolveOptions({
      preset: 'production',
      auth: () => true,
      actuator: { health: { groups: { liveness: ['process'] } } },
    });
    assert.deepEqual(opts.actuator.health.groups.liveness, ['process']);
  });

  test('requireAuth: false bypasses production preset enforcement', () => {
    const opts = resolveOptions({ preset: 'production', requireAuth: false });
    assert.equal(opts.requireAuth, false);
    assert.equal(opts.auth, null);
  });

  test('basePath override is honored', () => {
    const opts = resolveOptions({
      preset: 'production',
      auth: () => true,
      basePath: '/management',
    });
    assert.equal(opts.basePath, '/management');
  });

  test('includeEventLoopHealthIndicator defaults to true and can be disabled', () => {
    const opts = resolveOptions({ preset: 'minimal' });
    assert.equal(opts.includeEventLoopHealthIndicator, true);

    const off = resolveOptions({ preset: 'minimal', includeEventLoopHealthIndicator: false });
    assert.equal(off.includeEventLoopHealthIndicator, false);
  });
});

// =============================================================================
// Integration helper
// =============================================================================

function createMockDeps() {
  const calls = { traceInit: 0, watchdogStart: 0, traceMiddleware: 0, traceRoutes: 0 };
  const watchdog = {
    start: () => { calls.watchdogStart += 1; },
    stop: () => {},
    getStats: () => ({ avgLag: 1, maxLag: 1, blocksLastMinute: 0 }),
    getRecentBlocks: () => [],
    getBlockingHotspots: () => [],
  };
  const trace = {
    init: () => { calls.traceInit += 1; },
    middleware: () => { calls.traceMiddleware += 1; return function traceMw(_req, _res, next) { next(); }; },
    routes: () => { calls.traceRoutes += 1; return function traceRoutes(_req, _res, next) { next(); }; },
    destroy: () => {},
  };
  let lastActuatorOptions = null;
  const deps = {
    actuatorMiddleware: (options) => {
      lastActuatorOptions = options;
      return {
        handler: function handler(_req, _res, next) { next(); },
        actuator: {
          opts: options,
          registerEndpoint: () => {},
          getInfo: () => ({}),
        },
      };
    },
    NodeActuator: function NodeActuator() {},
    watchdog,
    trace,
    _calls: calls,
    _last: () => lastActuatorOptions,
  };
  return deps;
}

describe('buildActuatorOptions', () => {
  test('initialises trace and watchdog when enabled', () => {
    const deps = createMockDeps();
    const opts = resolveOptions({ preset: 'production', auth: () => true });
    buildActuatorOptions(opts, deps);
    assert.equal(deps._calls.traceInit, 1);
    assert.equal(deps._calls.watchdogStart, 1);
  });

  test('skips trace and watchdog initialisation when disabled', () => {
    const deps = createMockDeps();
    const opts = resolveOptions({ preset: 'minimal' });
    buildActuatorOptions(opts, deps);
    assert.equal(deps._calls.traceInit, 0);
    assert.equal(deps._calls.watchdogStart, 0);
  });

  test('adds eventLoop health indicator when watchdog is enabled', async () => {
    const deps = createMockDeps();
    const opts = resolveOptions({ preset: 'production', auth: () => true });
    const actuatorOpts = buildActuatorOptions(opts, deps);
    const indicator = actuatorOpts.health.custom.find((c) => c.name === 'eventLoop');
    assert.ok(indicator);
    const result = await indicator.check();
    assert.equal(result.status, 'UP');
    assert.equal(result.details.avgLag, 1);
  });

  test('eventLoop indicator returns DOWN when blocks pile up', async () => {
    const deps = createMockDeps();
    deps.watchdog.getStats = () => ({ avgLag: 5, maxLag: 1500, blocksLastMinute: 10 });
    const opts = resolveOptions({ preset: 'production', auth: () => true });
    const actuatorOpts = buildActuatorOptions(opts, deps);
    const indicator = actuatorOpts.health.custom.find((c) => c.name === 'eventLoop');
    const result = await indicator.check();
    assert.equal(result.status, 'DOWN');
  });

  test('skips eventLoop indicator when includeEventLoopHealthIndicator is false', () => {
    const deps = createMockDeps();
    const opts = resolveOptions({
      preset: 'production',
      auth: () => true,
      includeEventLoopHealthIndicator: false,
    });
    const actuatorOpts = buildActuatorOptions(opts, deps);
    const indicators = (actuatorOpts.health && actuatorOpts.health.custom) || [];
    assert.equal(indicators.find((c) => c.name === 'eventLoop'), undefined);
  });

  test('adds ecosystem info contributor with package versions', async () => {
    const deps = createMockDeps();
    const opts = resolveOptions({ preset: 'production', auth: () => true });
    const actuatorOpts = buildActuatorOptions(opts, deps);
    const contributor = actuatorOpts.info.contributors.find((c) => c.name === 'ecosystem');
    assert.ok(contributor);
    const collected = await contributor.collect();
    assert.ok('actuator' in collected);
    assert.ok('watchdog' in collected);
    assert.ok('trace' in collected);
    assert.ok('observability' in collected);
  });

  test('skips ecosystem contributor when info is disabled', () => {
    const deps = createMockDeps();
    const opts = resolveOptions({
      preset: 'production',
      auth: () => true,
      actuator: { info: { enabled: false } },
    });
    const actuatorOpts = buildActuatorOptions(opts, deps);
    assert.equal((actuatorOpts.info.contributors || []).length, 0);
  });
});

// =============================================================================
// Express integration
// =============================================================================

function createMockApp() {
  const stack = [];
  return {
    use: (mw) => stack.push(mw),
    _stack: stack,
  };
}

describe('observability.express', () => {
  test('throws when app is not an Express-like object', () => {
    const deps = createMockDeps();
    assert.throws(
      () => express({}, resolveOptions({ preset: 'minimal' }), deps),
      /requires an Express application/,
    );
  });

  test('mounts trace, guard, actuator, and trace routes in order', () => {
    const app = createMockApp();
    const deps = createMockDeps();
    const opts = resolveOptions({ preset: 'production', auth: () => true });
    const handle = express(app, opts, deps);

    assert.equal(app._stack.length, 4);
    assert.equal(deps._calls.traceMiddleware, 1);
    assert.equal(deps._calls.traceRoutes, 1);
    assert.ok(handle.actuator);
    assert.equal(handle.watchdog, deps.watchdog);
    assert.equal(handle.trace, deps.trace);
  });

  test('omits trace middleware and routes when trace is disabled', () => {
    const app = createMockApp();
    const deps = createMockDeps();
    const opts = resolveOptions({ preset: 'minimal' });
    const handle = express(app, opts, deps);

    assert.equal(app._stack.length, 1);
    assert.equal(deps._calls.traceMiddleware, 0);
    assert.equal(deps._calls.traceRoutes, 0);
    assert.equal(handle.trace, null);
    assert.equal(handle.watchdog, null);
  });

  test('skips guard when auth is not provided', () => {
    const app = createMockApp();
    const deps = createMockDeps();
    const opts = resolveOptions({ preset: 'development' });
    const handle = express(app, opts, deps);

    assert.equal(app._stack.length, 3);
    assert.ok(handle.actuator);
  });
});

// =============================================================================
// Auth guard
// =============================================================================

function createReqRes(path) {
  const calls = { status: null, body: null };
  const req = { path, url: path, get: () => undefined };
  const res = {
    status: (code) => { calls.status = code; return res; },
    json: (body) => { calls.body = body; return res; },
  };
  return { req, res, calls };
}

describe('createGuard', () => {
  test('passes through non-ops paths without invoking auth', () => {
    let invoked = 0;
    const guard = createGuard({
      basePath: '/actuator',
      auth: () => { invoked += 1; return true; },
    });
    const { req, res } = createReqRes('/api/users');
    let nextCalled = false;
    guard(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(invoked, 0);
  });

  test('passes when auth returns truthy', () => {
    const guard = createGuard({
      basePath: '/actuator',
      auth: () => true,
    });
    const { req, res } = createReqRes('/actuator/health');
    let nextCalled = false;
    guard(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test('returns 401 when auth returns falsy', () => {
    const guard = createGuard({
      basePath: '/actuator',
      auth: () => false,
    });
    const { req, res, calls } = createReqRes('/actuator/health');
    guard(req, res, () => { throw new Error('next should not run'); });
    assert.equal(calls.status, 401);
    assert.deepEqual(calls.body, { error: 'Unauthorized' });
  });

  test('returns 500 when auth handler throws', () => {
    const guard = createGuard({
      basePath: '/actuator',
      auth: () => { throw new Error('boom'); },
    });
    const { req, res, calls } = createReqRes('/actuator/health');
    guard(req, res, () => { throw new Error('next should not run'); });
    assert.equal(calls.status, 500);
    assert.deepEqual(calls.body, { error: 'Auth handler error' });
  });

  test('also guards the /trace prefix', () => {
    const guard = createGuard({
      basePath: '/actuator',
      auth: () => false,
    });
    const { req, res, calls } = createReqRes('/trace/ui');
    guard(req, res, () => { throw new Error('next should not run'); });
    assert.equal(calls.status, 401);
  });
});

// =============================================================================
// Public API surface
// =============================================================================

describe('public API', () => {
  test('listPresets and resolveOptions are re-exported from index', () => {
    const observability = require('..');
    assert.equal(typeof observability.express, 'function');
    assert.equal(typeof observability.fastify, 'function');
    assert.equal(typeof observability.koa, 'function');
    assert.equal(typeof observability.resolveOptions, 'function');
    assert.equal(typeof observability.listPresets, 'function');
    assert.deepEqual(observability.listPresets().sort(), ['development', 'minimal', 'production']);
  });

  test('default deps loader returns expected shape when packages exist', () => {
    const observability = require('..');
    const deps = observability._internal.defaultDeps();
    assert.equal(typeof deps.actuatorMiddleware, 'function');
    assert.equal(typeof deps.actuatorPlugin, 'function');
    assert.equal(typeof deps.NodeActuator, 'function');
    assert.equal(typeof deps.watchdog.start, 'function');
    assert.equal(typeof deps.trace.init, 'function');
  });

  test('public express() resolves options and applies to express via injected deps', () => {
    const observability = require('..');
    const app = createMockApp();
    const deps = createMockDeps();

    const handle = observability.express(app, { preset: 'minimal' }, deps);

    assert.ok(handle.actuator);
  });

  test('public fastify() resolves options and applies to fastify via injected deps', async () => {
    const observability = require('..');
    const app = createMockFastify();
    const deps = createFastifyDeps();

    const handle = await observability.fastify(app, { preset: 'minimal' }, deps);

    assert.equal(handle.actuator.id, 'mock-actuator');
  });

  test('public koa() resolves options and applies to koa via injected deps', () => {
    const observability = require('..');
    const app = createMockKoa();
    const deps = createKoaDeps();

    const handle = observability.koa(app, { preset: 'minimal' }, deps);

    assert.equal(handle.actuator.id, 'mock-actuator');
  });
});

// =============================================================================
// Fastify integration
// =============================================================================

function createMockFastify() {
  const calls = {
    plugins: [],
    hooks: {},
    routes: [],
  };
  const app = {
    actuator: { id: 'mock-actuator' },
    register: async (plugin, opts) => {
      calls.plugins.push({ plugin, opts });
    },
    addHook: (name, fn) => {
      calls.hooks[name] = (calls.hooks[name] || []).concat(fn);
    },
    all: (path, fn) => {
      calls.routes.push({ method: 'ALL', path, fn });
    },
    _calls: calls,
  };
  return app;
}

function createFastifyDeps() {
  const calls = { traceInit: 0, watchdogStart: 0, fastifyPluginInvoked: 0, routesInvoked: 0 };
  const watchdog = {
    start: () => { calls.watchdogStart += 1; },
    getStats: () => ({ avgLag: 0, maxLag: 0, blocksLastMinute: 0 }),
  };
  const trace = {
    init: () => { calls.traceInit += 1; },
    fastifyPlugin: () => {
      calls.fastifyPluginInvoked += 1;
      return function tracePlugin() {};
    },
    routes: () => {
      calls.routesInvoked += 1;
      return function traceRoutes(_req, _res, next) { next(); };
    },
  };
  const deps = {
    actuatorPlugin: function actuatorPlugin() {},
    actuatorMiddleware: () => ({ handler() {}, actuator: {} }),
    watchdog,
    trace,
    _calls: calls,
  };
  return deps;
}

describe('observability.fastify', () => {
  test('throws when app is not a Fastify-like instance', async () => {
    const deps = createFastifyDeps();
    const opts = resolveOptions({ preset: 'minimal' });
    await assert.rejects(() => fastify({}, opts, deps), /requires a Fastify instance/);
  });

  test('registers trace plugin, actuator plugin, and trace routes when enabled', async () => {
    const app = createMockFastify();
    const deps = createFastifyDeps();
    const opts = resolveOptions({ preset: 'production', auth: () => true });

    const handle = await fastify(app, opts, deps);

    assert.equal(deps._calls.traceInit, 1);
    assert.equal(deps._calls.watchdogStart, 1);
    assert.equal(deps._calls.fastifyPluginInvoked, 1);
    assert.equal(deps._calls.routesInvoked, 1);
    // Two register calls: trace plugin + actuator plugin
    assert.equal(app._calls.plugins.length, 2);
    // preHandler hook for the auth guard
    assert.equal(app._calls.hooks.preHandler.length, 1);
    // Trace router mounted under /trace/*
    assert.deepEqual(app._calls.routes.map((r) => r.path), ['/trace/*']);
    assert.equal(handle.actuator.id, 'mock-actuator');
    assert.equal(handle.watchdog, deps.watchdog);
    assert.equal(handle.trace, deps.trace);
  });

  test('skips trace plugin and routes when trace is disabled', async () => {
    const app = createMockFastify();
    const deps = createFastifyDeps();
    const opts = resolveOptions({ preset: 'minimal' });

    const handle = await fastify(app, opts, deps);

    assert.equal(deps._calls.fastifyPluginInvoked, 0);
    assert.equal(deps._calls.routesInvoked, 0);
    assert.equal(app._calls.plugins.length, 1);
    assert.equal(handle.trace, null);
    assert.equal(handle.watchdog, null);
  });

  test('skips auth hook when no auth function is provided', async () => {
    const app = createMockFastify();
    const deps = createFastifyDeps();
    const opts = resolveOptions({ preset: 'development' });

    await fastify(app, opts, deps);

    assert.equal(app._calls.hooks.preHandler, undefined);
  });
});

// =============================================================================
// Fastify auth guard
// =============================================================================

function createFastifyReply() {
  const reply = {
    statusCode: 200,
    body: undefined,
    code(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; return this; },
    header() { return this; },
  };
  return reply;
}

describe('createFastifyGuard', () => {
  test('passes through when path is not an ops path', async () => {
    let invoked = 0;
    const guard = createFastifyGuard({
      basePath: '/actuator',
      auth: () => { invoked += 1; return true; },
    });
    const reply = createFastifyReply();
    await guard({ url: '/api/users' }, reply);
    assert.equal(invoked, 0);
    assert.equal(reply.statusCode, 200);
  });

  test('replies 401 when auth returns falsy', async () => {
    const guard = createFastifyGuard({ basePath: '/actuator', auth: () => false });
    const reply = createFastifyReply();
    await guard({ url: '/actuator/health' }, reply);
    assert.equal(reply.statusCode, 401);
    assert.deepEqual(reply.body, { error: 'Unauthorized' });
  });

  test('replies 500 when auth throws', async () => {
    const guard = createFastifyGuard({
      basePath: '/actuator',
      auth: () => { throw new Error('boom'); },
    });
    const reply = createFastifyReply();
    await guard({ url: '/actuator/health' }, reply);
    assert.equal(reply.statusCode, 500);
    assert.deepEqual(reply.body, { error: 'Auth handler error' });
  });

  test('also guards /trace prefix', async () => {
    const guard = createFastifyGuard({ basePath: '/actuator', auth: () => false });
    const reply = createFastifyReply();
    await guard({ url: '/trace/ui' }, reply);
    assert.equal(reply.statusCode, 401);
  });

  test('passes when auth returns truthy', async () => {
    const guard = createFastifyGuard({ basePath: '/actuator', auth: () => true });
    const reply = createFastifyReply();
    const result = await guard({ url: '/actuator/health' }, reply);
    assert.equal(result, undefined);
    assert.equal(reply.statusCode, 200);
  });

  test('falls back to request.raw.url when url is missing', async () => {
    const guard = createFastifyGuard({ basePath: '/actuator', auth: () => false });
    const reply = createFastifyReply();
    await guard({ raw: { url: '/actuator/health' } }, reply);
    assert.equal(reply.statusCode, 401);
  });
});

// =============================================================================
// Trace router adapter (Express -> Fastify)
// =============================================================================

describe('traceRouterAdapter', () => {
  test('passes request.raw and response shim into the Express router', async () => {
    let received;
    const router = (req, res, next) => {
      received = { req, res };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      next();
    };
    const reply = createFastifyReply();
    const handler = traceRouterAdapter(router);
    await handler({ raw: { url: '/trace/recent' } }, reply);
    assert.ok(received);
    assert.equal(received.req.url, '/trace/recent');
    assert.equal(reply.body, '{"ok":true}');
  });

  test('falls back to 404 when the router does not consume the response', async () => {
    const router = (_req, _res, next) => next();
    const reply = createFastifyReply();
    const handler = traceRouterAdapter(router);
    await handler({ raw: { url: '/trace/missing' } }, reply);
    assert.equal(reply.statusCode, 404);
    assert.deepEqual(reply.body, { error: 'Not found' });
  });

  test('rejects when the router throws synchronously', async () => {
    const handler = traceRouterAdapter(() => { throw new Error('boom'); });
    const reply = createFastifyReply();
    await assert.rejects(() => handler({ raw: {} }, reply), /boom/);
  });

  test('shim getHeader returns previously set value', async () => {
    const router = (_req, res, next) => {
      res.setHeader('Content-Type', 'text/plain');
      assert.equal(res.getHeader('Content-Type'), 'text/plain');
      res.end('ok');
      next();
    };
    const reply = createFastifyReply();
    const handler = traceRouterAdapter(router);
    await handler({ raw: {} }, reply);
    assert.equal(reply.body, 'ok');
  });
});

// =============================================================================
// Koa integration
// =============================================================================

function createMockKoa() {
  const stack = [];
  const app = {
    _stack: stack,
    use(mw) { stack.push(mw); return app; },
  };
  return app;
}

function createKoaDeps() {
  const calls = {
    traceInit: 0,
    watchdogStart: 0,
    instrumentKoa: 0,
    koaMiddleware: 0,
    routesInvoked: 0,
    actuatorMiddleware: 0,
  };
  const watchdog = {
    start: () => { calls.watchdogStart += 1; },
    getStats: () => ({ avgLag: 0, maxLag: 0, blocksLastMinute: 0 }),
  };
  const trace = {
    init: () => { calls.traceInit += 1; },
    instrumentKoa: (app) => { calls.instrumentKoa += 1; return app; },
    koaMiddleware: () => {
      calls.koaMiddleware += 1;
      return async function traceKoa(_ctx, next) { return next(); };
    },
    routes: () => {
      calls.routesInvoked += 1;
      return function traceRoutes(_req, res, _next) {
        res.statusCode = 200;
        res.end('routes');
      };
    },
  };
  const deps = {
    actuatorMiddleware: () => {
      calls.actuatorMiddleware += 1;
      return {
        handler: function actuatorHandler(_req, res, next) {
          res.status(200).json({ ok: true });
          next();
        },
        actuator: { id: 'mock-actuator' },
      };
    },
    watchdog,
    trace,
    _calls: calls,
  };
  return deps;
}

describe('observability.koa', () => {
  test('throws when app is not a Koa-like instance', () => {
    const deps = createKoaDeps();
    const opts = resolveOptions({ preset: 'minimal' });
    assert.throws(() => koa({}, opts, deps), /requires a Koa application/);
  });

  test('mounts trace, guard, actuator, and trace routes when enabled', () => {
    const app = createMockKoa();
    const deps = createKoaDeps();
    const opts = resolveOptions({ preset: 'production', auth: () => true });

    const handle = koa(app, opts, deps);

    assert.equal(deps._calls.traceInit, 1);
    assert.equal(deps._calls.watchdogStart, 1);
    assert.equal(deps._calls.instrumentKoa, 1);
    assert.equal(deps._calls.koaMiddleware, 1);
    assert.equal(deps._calls.actuatorMiddleware, 1);
    assert.equal(deps._calls.routesInvoked, 1);
    // trace + guard + actuator-adapter + trace-routes-adapter
    assert.equal(app._stack.length, 4);
    assert.equal(handle.actuator.id, 'mock-actuator');
    assert.equal(handle.watchdog, deps.watchdog);
    assert.equal(handle.trace, deps.trace);
  });

  test('skips trace integration when disabled', () => {
    const app = createMockKoa();
    const deps = createKoaDeps();
    const opts = resolveOptions({ preset: 'minimal' });

    const handle = koa(app, opts, deps);

    assert.equal(deps._calls.instrumentKoa, 0);
    assert.equal(deps._calls.koaMiddleware, 0);
    assert.equal(deps._calls.routesInvoked, 0);
    // only actuator-adapter
    assert.equal(app._stack.length, 1);
    assert.equal(handle.trace, null);
  });

  test('skips guard middleware when no auth is provided', () => {
    const app = createMockKoa();
    const deps = createKoaDeps();
    const opts = resolveOptions({ preset: 'development' });

    koa(app, opts, deps);

    // trace + actuator + trace-routes (no guard)
    assert.equal(app._stack.length, 3);
  });
});

// =============================================================================
// Koa auth guard
// =============================================================================

function createKoaCtx(path) {
  const ctx = {
    method: 'GET',
    path,
    url: path,
    originalUrl: path,
    query: {},
    headers: {},
    status: 200,
    body: undefined,
    type: undefined,
    response: { get() { return undefined; } },
    set() {},
    get() { return undefined; },
  };
  return ctx;
}

describe('createKoaGuard', () => {
  test('non-ops paths pass through without invoking auth', async () => {
    let invoked = 0;
    const guard = createKoaGuard({
      basePath: '/actuator',
      auth: () => { invoked += 1; return true; },
    });
    const ctx = createKoaCtx('/api/users');
    let nextCalled = false;
    await guard(ctx, async () => { nextCalled = true; });
    assert.equal(invoked, 0);
    assert.equal(nextCalled, true);
  });

  test('passes when auth returns truthy', async () => {
    const guard = createKoaGuard({ basePath: '/actuator', auth: () => true });
    const ctx = createKoaCtx('/actuator/health');
    let nextCalled = false;
    await guard(ctx, async () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test('returns 401 when auth returns falsy', async () => {
    const guard = createKoaGuard({ basePath: '/actuator', auth: () => false });
    const ctx = createKoaCtx('/actuator/health');
    await guard(ctx, async () => { throw new Error('next should not run'); });
    assert.equal(ctx.status, 401);
    assert.deepEqual(ctx.body, { error: 'Unauthorized' });
  });

  test('returns 500 when auth throws', async () => {
    const guard = createKoaGuard({
      basePath: '/actuator',
      auth: () => { throw new Error('boom'); },
    });
    const ctx = createKoaCtx('/actuator/health');
    await guard(ctx, async () => { throw new Error('next should not run'); });
    assert.equal(ctx.status, 500);
    assert.deepEqual(ctx.body, { error: 'Auth handler error' });
  });

  test('also guards /trace prefix', async () => {
    const guard = createKoaGuard({ basePath: '/actuator', auth: () => false });
    const ctx = createKoaCtx('/trace/ui');
    await guard(ctx, async () => { throw new Error('next should not run'); });
    assert.equal(ctx.status, 401);
  });
});

// =============================================================================
// expressToKoa adapter
// =============================================================================

describe('expressToKoa', () => {
  test('skips wrapped handler when path does not match prefixes', async () => {
    const handler = () => { throw new Error('should not run'); };
    const adapter = expressToKoa(handler, '/actuator');
    const ctx = createKoaCtx('/api/users');
    let nextCalled = false;
    await adapter(ctx, async () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test('invokes the wrapped handler and consumes via shim.json', async () => {
    const handler = (_req, res, next) => {
      res.status(202).json({ ok: true });
      next();
    };
    const adapter = expressToKoa(handler, '/actuator');
    const ctx = createKoaCtx('/actuator/health');
    await adapter(ctx, async () => { throw new Error('next should not run when consumed'); });
    assert.equal(ctx.status, 202);
    assert.deepEqual(ctx.body, { ok: true });
    assert.equal(ctx.type, 'application/json');
  });

  test('sets content-type via shim.set then send', async () => {
    const handler = (_req, res, next) => {
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.status(200).send('hello');
      next();
    };
    const adapter = expressToKoa(handler, '/actuator');
    const ctx = createKoaCtx('/actuator/prometheus');
    await adapter(ctx, async () => { throw new Error('next should not run'); });
    assert.equal(ctx.body, 'hello');
    assert.equal(ctx.type, 'text/plain; charset=utf-8');
  });

  test('falls through to next when handler does not consume', async () => {
    const handler = (_req, _res, next) => next();
    const adapter = expressToKoa(handler, '/actuator');
    const ctx = createKoaCtx('/actuator/missing');
    let nextCalled = false;
    await adapter(ctx, async () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test('rejects when handler invokes next with an error', async () => {
    const handler = (_req, _res, next) => next(new Error('boom'));
    const adapter = expressToKoa(handler, '/actuator');
    const ctx = createKoaCtx('/actuator/anything');
    await assert.rejects(() => adapter(ctx, async () => {}), /boom/);
  });

  test('writeHead + end pipe through shim', async () => {
    const handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('ok');
    };
    const adapter = expressToKoa(handler, '/trace');
    const ctx = createKoaCtx('/trace/recent');
    await adapter(ctx, async () => { throw new Error('next should not run'); });
    assert.equal(ctx.status, 200);
    assert.equal(ctx.body, 'ok');
  });

  test('runs always when no prefixes are supplied', async () => {
    const handler = (_req, res, next) => { res.status(200).json({}); next(); };
    const adapter = expressToKoa(handler);
    const ctx = createKoaCtx('/anything');
    await adapter(ctx, async () => { throw new Error('next should not run when consumed'); });
    assert.equal(ctx.status, 200);
  });
});
