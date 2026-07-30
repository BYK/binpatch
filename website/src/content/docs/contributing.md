---
title: Contributing
---

Thanks for considering a contribution to `binpatch`. This page
documents how we work, how to set up a dev environment, and what
to expect from review.

## Project shape

```
binpatch/
├── src/                    # Library source
│   ├── index.ts            # Public API barrel
│   ├── contract.ts         # Shared types + constants
│   ├── events.ts           # ProgressEvent + safeProgress
│   ├── errors.ts           # BinpatchError
│   ├── bspatch.ts          # TRDIFF10 parse + apply
│   ├── discover.ts         # resolveAndApply orchestration
│   ├── patch-cache.ts      # On-disk cache
│   └── sources/
│       ├── oci.ts          # Generic OCI client
│       ├── ghcr.ts         # GHCR source strategy
│       └── github-release.ts  # GitHub Releases source strategy
├── test/                   # Vitest suite
├── action/                 # GitHub Action YAML
├── website/                # Astro/Starlight docs site
├── .craft.yml              # Release config
└── .github/workflows/      # CI, release, publish, pages
```

## Dev setup

```bash
git clone https://github.com/BYK/binpatch
cd binpatch
npm install
npm test
npm run build
```

Node 22.15+ is required (the first Node release with `node:zlib` zstd support).

## Tests

We use [Vitest](https://vitest.dev/). The test suite covers:

- `test/bspatch.test.ts` — TRDIFF10 parse + apply (the main surface)
- `test/discover.test.ts` — `resolveAndApply` orchestration
- `test/sources.test.ts` — OCI / GHCR / GitHub Releases source strategies
- `test/progress.test.ts` — progress event formatting helpers

Run a single test file:

```bash
npm test -- test/bspatch.test.ts
```

Run with coverage:

```bash
npm run test:coverage
```

## Mutation-verify your fix

We treat every fix as a hypothesis to be falsified. Before opening a
PR:

1. Write the fix.
2. Write a regression test that fails on the bug.
3. **Revert the fix** (locally — never push). Confirm the test now
   fails ("never trust a fix without seeing it fail").
4. Restore the fix. Confirm the test passes.
5. Open the PR. The review will look for this discipline.

## Pull request workflow

1. Fork or branch.
2. Make your change with tests.
3. Run the full gate locally:
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
4. Open the PR against `main`.
5. Address review comments. We use the project's two-reviewer
   discipline — at least one approval from a maintainer.
6. A maintainer will merge (squash) once CI is green.

## Coding conventions

- **No barrel exports inside the library.** Import from the source
  module directly:
  ```ts
  // ✗ Avoid
  import { applyPatchChainInMemory } from "binpatch";
  // (this works, but...)
  // ✓ Prefer in test files
  import { applyPatchChainInMemory } from "../src/bspatch";
  ```
  Within the library, internal modules import each other directly
  (no barrel from `index.ts` to internal).
- **No native code.** No `node-gyp`, no `.node` addons, no WASM.
  Anything that requires native code is out of scope.
- **No third-party runtime deps.** The library's only runtime dep
  is Node.js itself.
- **`applyPatch()` always returns the SHA-256 inline.** Don't add a
  separate verify step.

## Security disclosures

Found a security issue? Open a private security advisory on GitHub
(Repository → Security → Advisories → "New draft security advisory").
**Do not** open a public issue.

## Code of conduct

Be kind. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).
Maintainers reserve the right to remove comments or close issues
that violate the standard.

## License

By contributing, you agree that your contributions will be
licensed under the project's MIT license.

## Next

- [Architecture →](/architecture/) — design decisions, why bsdiff, why SWAR
- [FAQ →](/faq/) — common questions
