---
title: Installation
---

`binpatch` ships as a single ESM package on npm. It has zero runtime
dependencies beyond Node.js itself — no native addons, no WASM, no
shelled-out processes.

## Requirements

- Node.js >= 22.5 (matches the project's minimum)
- A consumer that supplies an apply path (old binary on disk) and
  destination path (new binary on disk)

## Install

```bash
# pnpm
pnpm add binpatch

# npm
npm install binpatch

# yarn
yarn add binpatch
```

## TypeScript

The package ships its own `.d.ts` declarations. No `@types/binpatch`
package exists; the package self-types.

```ts
import {
  applyPatchChainInMemory,
  resolveAndApply,
  type ProgressEvent,
} from "binpatch";
```

## ESM only

`binpatch` is published as an ES module. If you need CJS, you can either
import via `import()` from CJS, or set `"type": "module"` in your
project and use the synchronous `require` shim that modern Node provides
for ESM.

## What's in the box

```
binpatch
├── applyPatchChainInMemory   — apply a chain of TRDIFF10 patches in RAM
├── applyPatchToMemory        — apply a single TRDIFF10 patch in RAM
├── applyPatch                — apply a single TRDIFF10 patch to a file
├── parsePatchHeader          — peek at TRDIFF10 metadata (controlLen, newSize, etc.)
├── offtin                    — decode TRDIFF10's sign-magnitude i64 LE
├── MAX_OUTPUT_SIZE           — 2 GiB cap on attacker-controlled newSize
├── resolveAndApply           — discover + download + apply + verify (one call)
├── ghcrSource                — discover patches in any OCI registry (GHCR / generic)
├── githubReleaseSource       — discover patches in GitHub Releases
├── makeCache(cacheDir)       — on-disk patch cache factory
├── events                    — ProgressEvent type (phase/bytes/done)
└── SourceStrategy            — interface for plugging in your own discovery
```

## Next

- [Quickstart →](./getting-started/) — first patch applied in 30 lines
- [Wire Contract →](./wire-contract/) — the file format and OCI tag scheme
