'use strict';

/**
 * Built-in presets that bias the bundled actuator, watchdog, and trace
 * configurations toward common deployment shapes. Users can always override
 * any field through the matching options object.
 */
const PRESETS = {
  production: {
    actuator: {
      health: {
        showDetails: 'never',
        groups: {
          liveness: ['process', 'eventLoop'],
          readiness: ['diskSpace', 'eventLoop'],
        },
      },
      env: { enabled: false },
      threadDump: { enabled: false },
      heapDump: { enabled: false },
      info: { enabled: true },
      metrics: { enabled: true },
      prometheus: { enabled: true, defaultMetrics: true },
    },
    watchdog: {
      enabled: true,
      mode: 'observe',
      warningThreshold: 100,
      criticalThreshold: 500,
      logLevel: 'warn',
    },
    trace: {
      enabled: true,
      slowThreshold: 200,
      samplingRate: 1,
      traceOutgoing: true,
    },
    requireAuth: true,
  },
  development: {
    actuator: {
      health: { showDetails: 'always' },
      env: { enabled: true },
      threadDump: { enabled: true },
      heapDump: { enabled: true },
      info: { enabled: true },
      metrics: { enabled: true },
      prometheus: { enabled: true, defaultMetrics: true },
    },
    watchdog: {
      enabled: true,
      mode: 'observe',
      warningThreshold: 50,
      criticalThreshold: 200,
      logLevel: 'warn',
    },
    trace: {
      enabled: true,
      slowThreshold: 100,
      samplingRate: 1,
      traceOutgoing: true,
    },
    requireAuth: false,
  },
  minimal: {
    actuator: {
      env: { enabled: false },
      threadDump: { enabled: false },
      heapDump: { enabled: false },
      info: { enabled: true },
      metrics: { enabled: true },
      prometheus: { enabled: false },
    },
    watchdog: {
      enabled: false,
    },
    trace: {
      enabled: false,
    },
    requireAuth: false,
  },
};

function getPreset(name) {
  if (!name) return PRESETS.production;
  if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) {
    throw new Error(
      `Unknown preset '${name}'. Expected one of: ${Object.keys(PRESETS).join(', ')}.`,
    );
  }
  return PRESETS[name];
}

function listPresets() {
  return Object.keys(PRESETS);
}

module.exports = { PRESETS, getPreset, listPresets };
