---
title: Quickstart
---

Apply a chain of TRDIFF10 patches in three lines:

```ts
import { applyPatchChainInMemory } from "binpatch";

// Apply a sequence of TRDIFF10 patches to an on-disk binary.
const sha256 = await applyPatchChainInMemory(
  "/path/to/old/binary",
  patches,                          // Uint8Array[]
  "/path/to/new/binary",
);
```

That's the lowest-friction entry point. The library handles
intermediate-hop memory retention (no temp files), writes only the
final binary to `destPath`, and returns its SHA-256 inline.

## A slightly richer example

```ts
import { applyPatchChainInMemory } from "binpatch";
import { readFile, writeFile } from "node:fs/promises";

// 1. Load the patch bytes (e.g. downloaded from your release server).
const patchRes = await fetch("https://updates.example.com/myapp-1.2.3.patch");
const patches = [new Uint8Array(await patchRes.arrayBuffer())];

// 2. Apply. `applyPatchChainInMemory` reads the old binary at oldPath
//    on demand (positional reads — safe even when oldPath === destPath),
//    keeps intermediate hops in RAM, and writes only the final binary
//    to destPath. Returns the SHA-256 of the final output.
const sha256 = await applyPatchChainInMemory(
  "/usr/local/bin/myapp",      // currently-installed binary
  patches,                      // ordered chain (oldest first)
  "/usr/local/bin/myapp.new",   // final output path
  (bytes) => console.log(`${bytes} bytes applied`),  // per-chunk callback
);

// 3. Verify (you compare against the expected SHA-256 from your release
//    metadata; `applyPatchChainInMemory` does not know what you expected).
if (sha256 !== expectedSha256) {
  throw new Error(`SHA-256 mismatch: got ${sha256}, expected ${expectedSha256}`);
}

// 4. Install (atomic rename from your side).
await writeFile("/usr/local/bin/myapp", await readFile("/usr/local/bin/myapp.new"));
```

## With discovery

If you don't want to fetch the patch yourself, hand `binpatch` a
`SourceStrategy` and let it do the work:

```ts
import {
  resolveAndApply,
  ghcrSource,
  type ProgressEvent,
} from "binpatch";

const source = ghcrSource({
  registry: "https://ghcr.io",
  repo: "your-org/your-app",
  userAgent: "myapp/1.2.3",
  binaryName: "myapp-linux-x64",
  targetTag: (version) => `nightly-${version}`,
  compareVersions: (a, b) => semver.compare(a, b),
});

const result = await resolveAndApply({
  source,
  currentVersion: "1.2.2",
  targetVersion: "1.2.3",
  oldPath: "/usr/local/bin/myapp",
  destPath: "/usr/local/bin/myapp.new",
  onProgress: (event: ProgressEvent) => {
    if (event.type === "phase") console.log(`→ ${event.phase}`);
    if (event.type === "bytes") console.log(`  bytes: ${event.written}/${event.total ?? "?"}`);
    if (event.type === "done") console.log(`✓ ${event.phase}`);
  },
});

if (result) {
  console.log(
    `patched ${result.chainLength} hop(s) — ${result.patchBytes} bytes — sha256: ${result.sha256}`,
  );
} else {
  // No chain usable — fall back to a full download.
  console.log("no delta available, falling back to full download");
}
```

`resolveAndApply` returns `null` when no chain is usable. Consumers
should fall back to a full download in that case. The result shape
on success is `{ sha256, patchBytes, chainLength }`.

## Next

- [Applying patches →](./apply/) — full apply API surface, error handling
- [Discovering chains →](./discover/) — `SourceStrategy` details and
  custom source implementations
- [Wire Contract →](./wire-contract/) — when you need to write patches yourself
