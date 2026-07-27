---
title: FAQ
---

Common questions about `binpatch`.

## Is `binpatch` production-ready?

Yes. It's the apply/discovery core used by [`@loreai/gateway`](https://www.npmjs.com/package/@loreai/gateway)
and [`sentry-cli`](https://github.com/getsentry/cli), both of which
ship to thousands of users.

## What patch format does it support?

[TRDIFF10](https://github.com/getsentry/cli/blob/main/src/lib/bspatch.ts).
This is the format `sentry-cli`'s bspatch uses. The wire format is
documented on the [Wire Contract](./wire-contract/) page.

## Can I use my own patch generator?

Yes, as long as it produces TRDIFF10. The apply functions
(`applyPatchChainInMemory`, `applyPatchToMemory`) accept raw
TRDIFF10 bytes — they don't care who produced them.

Common off-the-shelf generators:

- [`blackboardsh/zig-bsdiff`](https://github.com/blackboardsh/zig-bsdiff)
  — the one the GitHub Action uses. Pure Zig, small prebuilts.
- [`kairi003/bsdiff-wasm`](https://www.npmjs.com/package/bsdiff-wasm)
  — npm package, WASM-based. Not wire-compatible (uses classic
  bsdiff+bzip2 instead of TRDIFF10+zstd).

## Does it support multi-platform binaries?

Yes. Each platform's patch is a separate OCI manifest layer with
its own `org.opencontainers.image.title` annotation
(`<binaryName>-<platform>.patch`). Consumers pick the layer
matching their platform.

## Can I use it offline / without a registry?

Yes. Call `applyPatchChainInMemory` directly with patch bytes you
already have on disk. Discovery is optional.

## What's the overhead vs. shipping full binaries?

For a typical CLI update (small code change), the patch is ~0.07%
of the binary size. For a 310 MB binary, that's ~220 KB. Bandwidth
savings at scale: 99.93%.

## Why not Courgette-style executable-aware diffing?

See the [Architecture →](./architecture/#why-not-courgette-style-executable-aware-diff)
page. Short answer: for our use case (Node/Bun-based CLIs where the
bulk of the binary is a JS snapshot), bsdiff already crushes pointer
churn via its seek mechanism, and the rest of the binary is too
small for executable-aware diffing to matter.

## Why no native code?

See [Architecture →](./architecture/#apply-why-no-native-code).
Briefly: mmap-based readers break esbuild + Node SEA bundling, and
in-memory apply is fast enough for typical binaries.

## How do I integrate this into my own CI?

See [CI integration →](./ci-integration/) for a complete example,
or use the bundled [GitHub Action →](./github-action/) for the
end-to-end generate-and-publish flow.

## What's the npm package name?

`binpatch`. Install via:

```bash
npm install binpatch
```

## What's the difference between `applyPatch`, `applyPatchToMemory`, and `applyPatchChainInMemory`?

- `applyPatch` — single patch, file-based. Writes to disk.
- `applyPatchToMemory` — single patch, in-memory.
- `applyPatchChainInMemory` — chain of patches, in-memory.
  Intermediate hops stay in RAM; only the final hop writes.

`applyPatchChainInMemory` is what `resolveAndApply` uses internally
and is the right entry point for most consumers.

## Why are there both `ghcrSource` and `githubReleaseSource`?

Different update channels with different storage:

- `ghcrSource` — nightly / canary. OCI registry, content-addressable.
- `githubReleaseSource` — stable. GitHub Releases, asset downloads.

The wire format is shared; only discovery differs.

## Does it work in Bun?

The library is ESM and pure Node.js; it runs in Bun. We've not
done extensive testing on Bun's networking quirks. The `customFetch`
escape hatch lets you inject Bun-native `fetch` if needed.

## Can I use my own registry (not GHCR, not GitHub Releases)?

Yes. Implement `SourceStrategy` directly — see
[Discovering chains →](./discover/#custom-sources). A 30-line
custom source is enough for most bespoke registries.

## How is the project released?

Craft-driven. See `.craft.yml` and the release workflow at
`.github/workflows/release.yml`. A maintainer runs
`gh workflow run release.yml -f version=<x.y.z>`, Craft opens a
release-request issue, a second maintainer labels it `accepted`,
and `publish.yml` (with OIDC trusted publishing) ships the npm tarball.

## Why is my install hanging?

Most likely: your registry's redirects are stalling. Check your
`fetch` implementation — every HTTP call inside the library is
wrapped in a 10-second request timeout (30 seconds for blob
downloads). If your `fetch` doesn't honor `AbortSignal.timeout(...)`,
the library's timeout wrapper won't fire.

See [Custom fetch / CA →](./custom-fetch/#timeout-semantics).

## Where can I get help?

- Open an [issue](https://github.com/BYK/binpatch/issues)
- Search [discussions](https://github.com/BYK/binpatch/discussions)
- For security issues, see [Contributing →](./contributing/#security-disclosures)
