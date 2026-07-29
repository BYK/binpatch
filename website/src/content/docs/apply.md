---
title: Applying patches
---

The apply functions are file-path or `Uint8Array`-based, depending
on which you call. They make no I/O assumptions beyond that — you
control where the old binary comes from and where the new one
goes.

## `applyPatch` — single patch, file-based

```ts
import { applyPatch } from "binpatch";

const sha256 = await applyPatch(
  "/path/to/old/binary",      // old binary (read on demand)
  patchData,                   // Uint8Array
  "/path/to/new/binary",       // final output
);
```

Returns the SHA-256 of the final binary. Internally just calls
`applyPatchChainInMemory` with `[patchData]`.

## `applyPatchChainInMemory` — chain of patches, file-based

```ts
import { applyPatchChainInMemory } from "binpatch";

const sha256 = await applyPatchChainInMemory(
  "/path/to/old/binary",      // read on demand
  [patch1, patch2, patch3],    // ordered chain (oldest first)
  "/path/to/new/binary",       // final output
  (bytes) => console.log(`${bytes} bytes applied`), // optional progress
);
```

Returns the SHA-256 of the final binary. Each hop is applied in
sequence. Intermediate hops stay in RAM (no disk I/O). Only the
final binary is written to `destPath` and SHA-256'd.

`applyPatchChainInMemory` does **not** verify the SHA-256 against
an expected value — the expected SHA-256 comes from the registry
metadata (e.g. the OCI manifest's `sha256-<binaryName>` annotation),
not the patch itself. Consumers compare and reject on mismatch.

## `applyPatchToMemory` — single patch, in-memory

```ts
import { applyPatchToMemory } from "binpatch";

const result: Uint8Array = await applyPatchToMemory(oldBinary, patchData);
```

For callers that already hold the old binary in RAM (e.g. tests,
or callers that read the binary via `fs.readFile`). Returns the
new binary as a `Uint8Array`.

`applyPatchToMemory` does not return a SHA-256 — wrap it in
`crypto.subtle.digest("SHA-256", result)` if you need one.

## Inspecting a patch header

```ts
import { parsePatchHeader } from "binpatch";

const header = parsePatchHeader(patchBytes);
// {
//   controlLen: 1234,
//   diffLen: 5678,
//   newSize: 310000000,
// }
```

`parsePatchHeader` reads only the 32-byte header (and verifies the
`"TRDIFF10"` magic in the process). Useful for metadata before
committing to a full apply. Throws on magic mismatch, malformed
header, or `newSize > MAX_OUTPUT_SIZE` (2 GiB).

## `MAX_OUTPUT_SIZE` (exported constant)

```ts
import { MAX_OUTPUT_SIZE } from "binpatch";
// 2_147_483_648
```

The cap on attacker-controlled `newSize`. Exported so consumers
can override or surface it in their own error messages.

## Error handling

All apply functions throw on:
- Invalid magic ("TRDIFF10" mismatch)
- `newSize > MAX_OUTPUT_SIZE`
- `newSize < 0` (sign-magnitude encoded; negative is reserved)
- zstd decompression error
- A genuine apply failure (corrupt patch, etc.)

There is no "soft" error mode — apply either succeeds and the
returned SHA-256 matches expectations, or it throws. Consumers
catch and fall back to full download.

## Progress callback

`applyPatchChainInMemory` accepts an optional `onBytes` callback
that fires once per output chunk with that chunk's byte count
(not a cumulative total):

```ts
let cumulative = 0;
applyPatchChainInMemory(oldPath, chain, destPath, (bytes) => {
  // `bytes` is the size of THIS chunk; sum it yourself for progress %
  cumulative += bytes;
  console.log(`${cumulative} applied`);
});
```

This is a low-level callback for the per-chunk apply loop. For
lifecycle events (resolve / apply / verify) and cumulative
`{ written, total }` updates, use `resolveAndApply`'s `ProgressEvent`
stream instead — see [Progress & events](/progress/).

## Performance

Benchmarks on a 2021 M1 MacBook Pro, ~100 MB binary, narrow-gap
consecutive-nightly diff:

| Implementation | Time |
|----------------|------|
| Naive byte loop | 883 ms |
| `Uint32Array` SWAR (4×4-byte) | 221 ms |
| `BigUint64Array` (8-byte) | WRONG (carry propagates across byte lanes) |

The SWAR speedup applies to the diff-add loop, which is ~95% of
apply time on a typical narrow-gap diff. Wide-gap diffs are
dominated by extra-block writes, where the speedup is smaller
(~10-15%) because the bottleneck is zstd decode, not XOR.

## Next

- [Progress & events →](/progress/) — `ProgressEvent` lifecycle
- [Discovering chains →](/discover/) — when you want the library to fetch patches
- [Custom fetch / CA →](/custom-fetch/) — TLS / proxy configuration
