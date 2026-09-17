---
title: Discovering chains
---

Most consumers want the library to find the right patches itself.
This is the discovery layer: a `SourceStrategy` that resolves a
patch chain given `(currentVersion, targetVersion)`.

## Built-in sources

### `ghcrSource()`

```ts
import { ghcrSource } from "binpatch";

const source = ghcrSource({
  registry: "https://ghcr.io",
  repo: "your-org/your-app",
  userAgent: "myapp/1.2.3",
  binaryName: "myapp-linux-x64",
  targetTag: (version) => `nightly-${version}`,
  compareVersions: (a, b) => semver.compare(a, b),
});
```

For nightly / canary updates. Patches are stored as OCI manifests
in the GHCR (or any OCI registry).

`compareVersions` is consumer-supplied — the library never depends
on `semver` directly. Pass whatever comparator you use elsewhere
(`semver.compare`, your own comparator, etc.). The library wraps
your comparator in a `try/catch` so a malformed tag cannot crash
the chain.

Optional fields:
- `fetch?: typeof fetch` — defaults to `globalThis.fetch`
- `instrument?: InstrumentHook` — wraps each HTTP step in your tracing

### `githubReleaseSource()`

```ts
import { githubReleaseSource } from "binpatch";

const source = githubReleaseSource({
  releasesUrl: "https://api.github.com/repos/your-org/your-app/releases",
  binaryName: "myapp-linux-x64",
  userAgent: "myapp/1.2.3",
});
```

For stable updates. Patches are attached to GitHub Releases.

Same optional `fetch` and `instrument` fields as `ghcrSource`.

## Custom sources

If neither built-in fits, implement `SourceStrategy` directly:

```ts
import type { SourceStrategy, PatchChain } from "binpatch";

const mySource: SourceStrategy = {
  async resolveChain(currentVersion, targetVersion, signal, report) {
    // 1. Find the chain in your registry.
    const patches = await myRegistry.listPatchesBetween(currentVersion, targetVersion);
    if (patches.length === 0) {
      report?.("no_patches");
      return null;
    }

    // 2. Download each patch.
    let totalSize = 0;
    const data: Uint8Array[] = [];
    for (const p of patches) {
      try {
        const bytes = new Uint8Array(await myRegistry.fetch(p.url, { signal }));
        data.push(bytes);
        totalSize += bytes.byteLength;
      } catch (e) {
        report?.("network");
        return null;
      }
    }

    // 3. Return in apply order. expectedSha256 is verified by your consumer
    //    against registry-supplied metadata; the library does not verify it.
    return {
      patches: data.map((d, i) => ({ data: d, size: d.byteLength })),
      totalSize,
      expectedSha256: patches[patches.length - 1].expectedSha256,
      // Optional but recommended — used by the offline cache to key
      // saved chains by their version endpoints. Without this, the
      // cache cannot save your chain.
      steps: patches.map((p) => ({ fromVersion: p.from, toVersion: p.to })),
    };
  },
};
```

A 30-line custom source is enough for most bespoke registries.

## `resolveAndApply`

Once you have a source, `resolveAndApply` does the rest:

```ts
import { resolveAndApply, type ProgressEvent } from "binpatch";

const result = await resolveAndApply({
  source,
  currentVersion: "1.2.2",
  targetVersion: "1.2.5",
  oldPath: "/usr/local/bin/myapp",
  destPath: "/usr/local/bin/myapp.new",
  onProgress: (event: ProgressEvent) => { /* ... */ },
  signal: AbortSignal.timeout(60_000),
});
```

`result` is one of:

- `null` — no chain usable. Fall back to a full download.
- `{ sha256, patchBytes, chainLength }` — apply succeeded; consumers
  should still verify `sha256` against the expected hash from the
  registry metadata.

The library **does not** throw on "no chain available". A throw means
a genuine apply or verification failure (SHA mismatch, corrupt
patch), and consumers should treat it the same as `null` — fall
back to a full download.

## Unavailability reasons

`resolveAndApply` accepts an optional `telemetry` field with three
hooks:

```ts
const result = await resolveAndApply({
  // ...
  telemetry: {
    onResolved: ({ source }) => {
      // source: "cache" | "network" | "offline_miss"
      // (where the chain came from — `offline_miss` means a cache miss
      //  when `offline: true` was set, so no network was contacted).
    },
    onOfflineMiss: () => {
      // Offline mode, no cache hit — fall back to full download.
    },
    onUnavailable: (reason) => {
      // Why the chain was unusable. Alert on "malformed_chain".
      // "no_patches" | "malformed_chain" | "too_long" | "over_budget" | "network"
    },
  },
});
```

`reason` is one of:
- `"no_patches"` — chain is empty (no patches between versions)
- `"too_long"` — chain exceeded `MAX_NIGHTLY_CHAIN_DEPTH` / `MAX_STABLE_CHAIN_DEPTH`
- `"malformed_chain"` — a patch in the chain is structurally invalid
- `"over_budget"` — patches sum to >`SIZE_THRESHOLD_RATIO` of new binary
- `"network"` — registry fetch failed (transient)

**Alert on `"malformed_chain"`** — it means a published-but-broken
patch (a poisoned publish), not a benign "no_patches".

## Chain validation

Per hop, the library validates:

1. **From-version match** — the patch's `from-version` annotation
   equals the previous hop's output version.
2. **Layer presence** — the patch manifest has a layer for the
   current platform (`<binaryName>.patch`).
3. **Size** — the patch's compressed size is below
   `SIZE_THRESHOLD_RATIO × newSize` (the budget check).

A failure on any of these returns `null` with reason
`"malformed_chain"`.

## Cache

`resolveAndApply` caches resolved chains on disk via `makeCache`:

```ts
import { makeCache } from "binpatch";
import { join } from "node:path";
import { homedir } from "node:os";

const cacheRoot = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
const cache = makeCache(join(cacheRoot, "myapp", "patches"));

const result = await resolveAndApply({
  // ...
  cache, // optional — omit to disable caching
  offline: false,             // optional — when true, never touch the network
});
```

Cache entries are keyed by `(currentVersion, targetVersion)` and
expire after 7 days (use `cache.cleanup()` to evict).

## Next

- [Progress & events →](/progress/) — observe `resolveAndApply` step-by-step
- [Custom fetch / CA →](/custom-fetch/) — pass your TLS config to OCI/GitHub calls
- [Architecture →](/architecture/) — why pluggable discovery
