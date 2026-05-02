'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const { resolveOptions } = require('../src/options');
const { listPresets, getPreset, PRESETS } = require('../src/presets');
const { buildActuatorOptions } = require('../src/integrations');
const { express, createGuard } = require('../src/express');

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
});
