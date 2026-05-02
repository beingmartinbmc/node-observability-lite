'use strict';

const { resolveOptions } = require('./src/options');
const { express: applyToExpress } = require('./src/express');
const { listPresets } = require('./src/presets');

/**
 * Default dependency map. Tests inject a custom set so they can verify wiring
 * without spinning up the real packages.
 */
function defaultDeps() {
  // Lazily required so consumers without the optional deps can still load
  // the module surface (e.g. read presets) without crashing.
  const actuator = require('node-actuator-lite');
  const watchdog = require('node-eventloop-watchdog');
  const trace = require('node-request-trace');
  return {
    actuatorMiddleware: actuator.actuatorMiddleware,
    actuatorPlugin: actuator.actuatorPlugin,
    NodeActuator: actuator.NodeActuator,
    watchdog,
    trace,
  };
}

/**
 * One-line setup for an Express app:
 *
 *   const observability = require('node-observability-lite');
 *   observability.express(app, {
 *     preset: 'production',
 *     auth: req => req.get('authorization') === `Bearer ${process.env.OPS_TOKEN}`,
 *   });
 */
function express(app, options, dependencies) {
  const opts = resolveOptions(options);
  const deps = dependencies || defaultDeps();
  return applyToExpress(app, opts, deps);
}

module.exports = {
  express,
  resolveOptions,
  listPresets,
};

module.exports._internal = {
  defaultDeps,
};
