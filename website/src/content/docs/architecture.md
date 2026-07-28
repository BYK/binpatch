---
title: Architecture
---

`binpatch` is a small library by design. This page documents the design
decisions and trade-offs so contributors don't accidentally regress them.

## High-level shape

```
                          ┌──────────────────────────┐
   your code              │  binpatch (this library) │
   ─────────────────────► │                          │
                          │  resolveAndApply:        │
                          │   ┌────────────────────┐ │
                          │   │ SourceStrategy     │ │  ← pluggable
                          │   │  .resolveChain()   │ │
                          │   └────────┬───────────┘ │
                          │            ▼             │
                          │   fetch patches           │
                          │   apply each hop          │
                          │   verify SHA-256          │
                          │   emit ProgressEvents     │
                          │   return result           │
                          └──────────────────────────┘
```

`resolveAndApply` is the single entry point for the discovery + apply
flow. The pure apply functions (`applyPatchChainInMemory`, etc.) are
exposed for callers who want to do their own discovery.

## Layer boundaries

The library is split into four concerns:

1. **Apply** (`src/bspatch.ts`, ~770 lines) — TRDIFF10 parse + apply.
   Pure logic, no I/O. `applyPatchChainInMemory` is the only entry
   point most consumers need.
2. **Cache** (`src/patch-cache.ts`, ~430 lines) — on-disk patch cache
   keyed by `(fromVersion, toVersion)`. Cache directory is injected
   via `makeCache(cacheDir)` — the library never reads config files
   itself.
3. **Discover** (`src/discover.ts`, `src/sources/*`) — `SourceStrategy`
   abstraction with `ghcrSource` and `githubReleaseSource` built-ins.
   Pluggable for custom registries.
4. **Events** (`src/events.ts`, ~50 lines) — `ProgressEvent` stream
   emitted during `resolveAndApply`. Library never renders progress
   — consumers plug in their own indicator.

A small `index.ts` barrel exports the public surface. The `contract.ts`
file holds shared types (constants, chain limits, etc.).

## Apply: why SWAR?

The dominant cost in `applyPatch` is the **diff-add** loop: XOR the diff
block into the destination window. We use SWAR (SIMD-within-a-register)
to process 4 bytes at a time on 32-bit words:

```ts
// 32-bit SWAR: 4 bytes added in one cycle
const mask = 0x7f7f7f7f;
const sign = 0x80808080;
((a & mask) + (b & mask)) ^ ((a ^ b) & sign);
```

For a 100 MB binary where ~99% of diff blocks are zero-dominated and
bsdiff has already crushed them into the high 8-12 KB of the patch,
this 4-byte-per-cycle approach takes ~220 ms vs ~883 ms for the
naive byte loop on the same machine (~4× faster).

We do **not** use `BigUint64Array` for SWAR. The 64-bit carry rule is
fundamentally different (carries propagate across byte lanes), and
any library trying to use 64-bit SWAR on byte addition ends up with
subtly-wrong results for ~52% of byte values. A `byteOffset % 4`
alignment guard falls back to the byte loop when the buffer is not
4-byte aligned — keeps the SWAR fast path safe.

## Apply: why not Courgette-style executable-aware diffing?

[Courgette](https://chromium.googlesource.com/chromium/src/+/master/components/courgette/README.md)
normalizes pointer relocations in machine code before diffing, which
gives Chrome ~10× patch-size wins on full Chromium updates. We do
not use it because:

- The bsdiff seek mechanism already collapses most pointer churn
  into small seek distances. We measured: a 100 MB binary with
  constant `-605 byte` offset shift in the bundled JS payload
  produces a 189 KB patch — that's 0.066% of the binary.
- Courgette requires understanding the executable format in detail
  (PE/ELF/Mach-O + relocations). Supporting all three platforms
  we ship for (linux/darwin/windows) would multiply maintenance cost.
- For our use case the bottleneck is full-download fallback latency,
  not patch size. A 189 KB patch vs a 50 KB patch is a ~3 second
  difference at normal network speeds, not a "the user waited 30
  seconds for a full download" difference.

If you have small enough binaries that even the bsdiff patch is
size-bottlenecked (sub-100 MB), or you ship embedded native code with
heavy relocation churn, consider Courgette. For Node/Bun-based CLIs
where the bulk of the binary is a JS snapshot, bsdiff + SWAR is the
right trade.

## Apply: why no native code?

We considered bundling a native `mmap`-based reader for the old binary
to avoid loading it fully into RAM. We chose not to because:

- Bun's native mmap is unavailable — we migrated off Bun.
- `mmap-io` and similar native addons break esbuild + Node SEA
  bundling, which several shipped CLI consumers rely on.
- For a 100 MB binary, an in-memory `Uint8Array` is fine: it's about
  1% of a typical CI runner's RAM budget.

If your binary is much larger (>1 GB), the public
`applyPatchChainInMemory` is still the right entry point — it reads
the on-disk base via positional reads (`pread`) on demand, so a 4 GB
binary uses ~1 MiB of read-ahead buffer rather than 4 GiB of RAM.
You only need a custom reader if you want to apply from a stream
(network-mounted storage, an archive, etc.); that's an internal
seam today, not a public export.

## Discover: why pluggable discovery?

Discovery is the most consumer-specific part of the upgrade flow:
nightly vs stable, GHCR vs custom OCI, GitHub Releases vs S3, etc.
Pushing that into the library would force every consumer to either
accept a default they can't change or reimplement it themselves.

`SourceStrategy.resolveChain(currentVersion, targetVersion, signal?, report?)`
returns a `PatchChain` (or null). The library handles the chain
validation, ordering, and per-hop download. Consumers ship a 30-line
strategy object and get the rest.

## Discover: why both GHCR and GitHub Releases?

Same library, two channels:

- **Nightly / canary**: stored in GHCR (or any OCI registry). OCI
  gives us content-addressable storage, multi-arch, and the `:nightly`
  → `:nightly-<version>` zero-copy tag pattern. Standard tooling
  (oras, docker, crane) can interact with it.
- **Stable / released**: stored in GitHub Releases. Native UI for
  signed releases, asset downloads via `gh release download`. Stable
  channels typically have fewer versions and don't benefit from OCI
  machinery.

The two channels share the wire format and the apply core — they
only differ in discovery.

## Telemetry: events, not spans

`resolveAndApply` emits `ProgressEvent`s (`{ type: "phase", phase }`,
`{ type: "bytes", phase, written, total }`, `{ type: "done", phase }`).
It does not emit OpenTelemetry / Sentry / StatsD spans. That's
deliberate: span shape varies wildly between consumers (Sentry's
per-HTTP `withTracingSpan`, OTel's `startActiveSpan`, StatsD's
`timing` distribution). Consumers wire the events into whatever their
tracing system is.

For per-HTTP-step granularity, an `InstrumentHook` lets you wrap
each OCI request in your own span without leaking fetch details into
the library. See [Instrumentation](./telemetry/).

## Next

- [Security →](./security/) — verification, OOM guard, timeouts
- [Applying patches →](./apply/) — apply API surface
- [Discovering chains →](./discover/) — `SourceStrategy` interface
