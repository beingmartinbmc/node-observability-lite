'use strict';

const { getPreset } = require('./presets');

/**
 * Deep merge two plain objects without mutating either input. Arrays and
 * non-plain values from `override` replace the values in `base`. This keeps
 * preset merging predictable for users overriding, e.g., `health.groups`.
 */
function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (typeof override !== 'object' || Array.isArray(override)) return override;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return { ...override };
  }

  const result = { ...base };
  for (const key of Object.keys(override)) {
    result[key] = deepMerge(base[key], override[key]);
  }
  return result;
}

/**
 * Build a resolved options object by layering: preset -> user overrides.
 *
 * @param {object} [userOptions]
 * @param {string} [userOptions.preset]
 * @param {object} [userOptions.actuator]
 * @param {object} [userOptions.watchdog]
 * @param {object} [userOptions.trace]
 * @param {string} [userOptions.basePath]
 * @param {function} [userOptions.auth]
 * @param {boolean} [userOptions.requireAuth]
 * @param {boolean} [userOptions.includeEventLoopHealthIndicator]
 */
function resolveOptions(userOptions = {}) {
  if (typeof userOptions !== 'object' || userOptions === null) {
    throw new TypeError('Options must be an object.');
  }

  const preset = getPreset(userOptions.preset);

  const actuator = deepMerge(preset.actuator, userOptions.actuator);
  const watchdog = deepMerge(preset.watchdog, userOptions.watchdog);
  const trace = deepMerge(preset.trace, userOptions.trace);

  const requireAuth = userOptions.requireAuth !== undefined
    ? Boolean(userOptions.requireAuth)
    : preset.requireAuth;

  if (requireAuth && typeof userOptions.auth !== 'function') {
    throw new Error(
      'preset requires authentication; provide an `auth(req)` function or set `requireAuth: false` to disable.',
    );
  }

  return {
    preset: userOptions.preset || 'production',
    basePath: userOptions.basePath || '/actuator',
    actuator,
    watchdog,
    trace,
    auth: userOptions.auth || null,
    requireAuth,
    includeEventLoopHealthIndicator:
      userOptions.includeEventLoopHealthIndicator !== false,
  };
}

module.exports = { resolveOptions, deepMerge };
