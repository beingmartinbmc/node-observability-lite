# Contributing

Thanks for helping improve `node-observability-lite`.

## Development Setup

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run test:coverage:check
npm run build
```

## Pull Request Checklist

- Keep changes focused on one behaviour or documentation improvement.
- Add or update tests for public API changes.
- Maintain at least 90% line, function, branch, and statement coverage.
- Update `README.md` and `CHANGELOG.md` when behaviour changes.
- Avoid adding runtime dependencies unless they are essential to the ecosystem wiring.
- Treat any change that exposes or weakens an actuator endpoint as security-sensitive.

## Release Checks

Before tagging:

```bash
npm install
npm run lint
npm run typecheck
npm run test:coverage:check
npm run build
```

The release workflow runs on tag push (`v*.*.*`) and publishes with `npm publish --provenance --access public`.

## Style

- CommonJS, no transpiler.
- Prefer small, single-purpose modules in `src/`.
- Public API stays framework-agnostic where possible. Framework adapters live in their own files (`src/express.js`, etc.).
