'use strict';

/**
 * Cross-package wiring shared by every framework integration.
 *
 * - Initialises `node-request-trace` when enabled.
 * - Starts `node-eventloop-watchdog` when enabled.
 * - Builds the actuator options, optionally adding an `eventLoop` health
 *   indicator backed by watchdog stats and an info contributor that surfaces
 *   the bundled package versions.
 */
function buildActuatorOptions(opts, deps) {
  const { actuator, watchdog, trace, includeEventLoopHealthIndicator } = opts;
  const actuatorOpts = cloneOptions(actuator);

  if (trace.enabled) {
    deps.trace.init(trace);
  }

  if (watchdog.enabled) {
    deps.watchdog.start(watchdog);
  }

  if (watchdog.enabled && includeEventLoopHealthIndicator) {
    actuatorOpts.health = actuatorOpts.health || {};
    actuatorOpts.health.custom = (actuatorOpts.health.custom || []).concat({
      name: 'eventLoop',
      critical: true,
      check: async () => {
        const stats = deps.watchdog.getStats();
        const avgLag = stats.avgLag || 0;
        const maxLag = stats.maxLag || 0;
        const blocksLastMinute = stats.blocksLastMinute || 0;
        const status = blocksLastMinute > 5 || maxLag > 1000 ? 'DOWN' : 'UP';
        return {
          status,
          details: { avgLag, maxLag, blocksLastMinute },
        };
      },
    });
  }

  actuatorOpts.info = actuatorOpts.info || {};
  if (actuatorOpts.info.enabled !== false) {
    const ecosystemContributor = {
      name: 'ecosystem',
      collect: () => ({
        actuator: safeVersion('node-actuator-lite'),
        watchdog: safeVersion('node-eventloop-watchdog'),
        trace: safeVersion('node-request-trace'),
        observability: safeVersion(__dirname + '/../package.json', true),
      }),
    };
    actuatorOpts.info.contributors = (actuatorOpts.info.contributors || []).concat(
      ecosystemContributor,
    );
  }

  return actuatorOpts;
}

function cloneOptions(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneOptions);
  const out = {};
  for (const key of Object.keys(value)) {
    out[key] = cloneOptions(value[key]);
  }
  return out;
}

function safeVersion(spec, isPath) {
  try {
    if (isPath) {
      return require(spec).version;
    }
    return require(`${spec}/package.json`).version;
  } catch (err) {
    return null;
  }
}

module.exports = { buildActuatorOptions };
