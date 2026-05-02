# Security Policy

## Supported Versions

Security fixes are provided for the latest published minor version of `node-observability-lite`.

## Reporting A Vulnerability

Please report suspected vulnerabilities privately by opening a [GitHub security advisory](https://github.com/beingmartinbmc/node-observability-lite/security/advisories/new) for this repository. Do not disclose sensitive findings in a public issue before a fix is available.

Include:

- Affected version
- Reproduction steps
- Impact and affected entry point, if known
- Suggested mitigation, if available

## Production Guidance

This package wraps three observability tools that can expose operational data:

- `node-actuator-lite` exposes process and runtime data over HTTP.
- `node-request-trace` exposes recent request timelines.
- `node-eventloop-watchdog` exposes block events that may include request context.

The `production` preset already:

- Disables `/actuator/env`, `/actuator/threaddump`, and `/actuator/heapdump`.
- Requires an `auth` function before any actuator or trace path is served.
- Defers all sensitive endpoints to opt-in.

If you customise the configuration, treat the following as privileged operator-only endpoints:

- `/actuator/env`
- `/actuator/threaddump`
- `/actuator/heapdump`
- `/actuator/eventloop/*`
- `/trace/*`

Pair them with authentication, network allowlists, private service networking, or reverse-proxy rules. Heap dumps in particular can contain secrets and personally identifiable data, and generating them can temporarily block the Node.js event loop.

## Supply Chain

Released versions are published from a tagged commit in this repository and signed with [npm provenance](https://docs.npmjs.com/generating-provenance-statements). Verify provenance with:

```bash
npm view node-observability-lite --json
```
