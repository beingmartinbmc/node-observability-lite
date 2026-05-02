#!/usr/bin/env node
'use strict';

/**
 * Smoke runner for the Express, Fastify, and Koa example apps.
 *
 *   node scripts/smoke.js <express|fastify|koa> [port]
 *
 * Spawns the matching example, waits for it to come up, hits a fixed list
 * of public + actuator + trace endpoints, and exits non-zero on any
 * failure. Used by CI to catch regressions in the meta-package against
 * the real downstream packages.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const framework = process.argv[2];
const port = Number(process.argv[3] || 3000);

if (!framework || !['express', 'fastify', 'koa'].includes(framework)) {
  console.error('Usage: smoke.js <express|fastify|koa> [port]');
  process.exit(2);
}

const examplePath = path.join(__dirname, '..', 'examples', framework, 'index.js');

const child = spawn(process.execPath, [examplePath], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port) },
});

child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

const baseUrl = `http://localhost:${port}`;

async function waitForReady(maxMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) return;
    } catch (_) {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become ready within ${maxMs}ms`);
}

async function check(method, urlPath, expectStatus = 200) {
  const res = await fetch(`${baseUrl}${urlPath}`, { method });
  if (res.status !== expectStatus) {
    throw new Error(`${method} ${urlPath} returned ${res.status}, expected ${expectStatus}`);
  }
  return res;
}

async function main() {
  await waitForReady();

  await check('GET', '/');
  await check('GET', '/actuator');
  await check('GET', '/actuator/health');
  await check('GET', '/actuator/info');
  await check('GET', '/actuator/metrics');
  await check('GET', '/actuator/eventloop');

  // Trigger a synchronous block so the watchdog records something.
  await check('GET', '/stall');

  await check('GET', '/trace/recent');
  await check('GET', '/trace/stats');

  console.log(`SMOKE OK [${framework}] all endpoints responded`);
}

function cleanup(code) {
  if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250);
}

main().then(
  () => cleanup(0),
  (err) => {
    console.error(`SMOKE FAIL [${framework}] ${err.message}`);
    cleanup(1);
  },
);
