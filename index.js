'use strict';

const { resolveOptions } = require('./src/options');
const { express: applyToExpress } = require('./src/express');
const { fastify: applyToFastify } = require('./src/fastify');
const { koa: applyToKoa } = require('./src/koa');
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

/**
 * One-line setup for a Fastify app.
 *
 *   const fastify = require('fastify')();
 *   const observability = require('node-observability-lite');
 *   await observability.fastify(fastify, {
 *     preset: 'production',
 *     auth: req => req.headers.authorization === `Bearer ${process.env.OPS_TOKEN}`,
 *   });
 */
async function fastify(app, options, dependencies) {
  const opts = resolveOptions(options);
  const deps = dependencies || defaultDeps();
  return applyToFastify(app, opts, deps);
}

/**
 * One-line setup for a Koa app.
 *
 *   const Koa = require('koa');
 *   const observability = require('node-observability-lite');
 *   const app = new Koa();
 *   observability.koa(app, {
 *     preset: 'production',
 *     auth: ctx => ctx.headers.authorization === `Bearer ${process.env.OPS_TOKEN}`,
 *   });
 */
function koa(app, options, dependencies) {
  const opts = resolveOptions(options);
  const deps = dependencies || defaultDeps();
  return applyToKoa(app, opts, deps);
}

module.exports = {
  express,
  fastify,
  koa,
  resolveOptions,
  listPresets,
};

module.exports._internal = {
  defaultDeps,
};
