# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic versioning.

## Unreleased

## 0.1.0 - 2026-05-02

### Added

- Initial release. One-line ecosystem wiring for Express via `observability.express(app, options)`.
- Built-in presets: `production`, `development`, and `minimal`.
- Auto-mounts `node-actuator-lite`, starts `node-eventloop-watchdog`, and initialises `node-request-trace`.
- Auto-adds an `eventLoop` health indicator backed by watchdog stats and an `info.contributors.ecosystem` block listing bundled package versions.
- Optional bearer-style `auth(req)` guard for `/actuator/*` and `/trace/*` paths.
- TypeScript declarations bundled via `index.d.ts`.
- npm releases published with provenance.
