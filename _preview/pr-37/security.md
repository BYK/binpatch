---
title: Security
---

`binpatch` is the choke point between an attacker-controlled patch and
your binary. This page documents the threats we considered, the
controls we ship by default, and what you must add on top.

## Threat model

| Attacker | Capability | Defense |
|----------|------------|---------|
| Anyone with a write to your patch registry | Push a malicious TRDIFF10 patch | SHA-256 verification on the final output |
| Anyone with a write to your registry | Push a patch with a huge `newSize` to OOM the consumer | `MAX_OUTPUT_SIZE = 2 GiB` cap pre-allocation |
| Anyone with a write to your registry | Push a patch that causes an infinite apply loop | `MAX_NIGHTLY_CHAIN_DEPTH = 30`, `MAX_STABLE_CHAIN_DEPTH = 10` |
| Network attacker on TLS path | Stall blob downloads indefinitely | Per-HTTP `AbortSignal.timeout(30_000)` |
| Attacker on your user's machine | Swap the old binary to a smaller file mid-apply | Apply reads from in-memory `Uint8Array`, not the file |
| Attacker with a custom-CA TLS interception | Re-route your OCI requests to a fake registry | `OciClient` and `ghcrSource` accept an injected `fetch` — pass your TLS-aware fetch (e.g. `undici` with a custom `Agent` and your CA bundle) |
| **Compromised publish pipeline** | Publish a patch whose `from-version` annotation claims source A but whose bytes were actually generated from source B — silently bypasses the user's expected upgrade path | `binpatch` **cannot** detect this — see [`from-version` annotation trust](#from-version-annotation-trust) below. Your CI MUST guarantee the annotation matches the actual patch source. |

## SHA-256 verification (sole trust anchor)

`applyPatchChainInMemory` returns the SHA-256 (hex) of the final
output directly. Consumers compare it against the expected SHA-256
(from the patch manifest's `sha256-<binaryName>` annotation, or the
GitHub Release asset). If they don't match, **throw and fall back
to a full download**.

```ts
import { applyPatchChainInMemory } from "binpatch";

const sha256 = await applyPatchChainInMemory(
  "/usr/local/bin/myapp",          // oldPath: file on disk
  chain,                            // patches: Uint8Array[]
  "/usr/local/bin/myapp.new",       // destPath: written with the final binary
);
if (sha256 !== expectedSha256) {
  // Patch is corrupt OR a different patch than expected.
  // Throw, fall back to full download, alert.
  throw new Error(`SHA-256 mismatch: got ${sha256}, expected ${expectedSha256}`);
}
```

The library **does not** verify per-hop intermediate hashes; it
trusts the final result. This is intentional: each hop's
`from-version` annotation is a chain-pointer, not a content hash.
A malicious hop that corrupts intermediate output will fail the
final hash check anyway.

## `MAX_OUTPUT_SIZE` (2 GiB pre-allocation guard)

`parsePatchHeader` rejects any patch whose declared `newSize` exceeds
2 GiB (`MAX_OUTPUT_SIZE = 2_147_483_648` bytes) **before allocating
the output buffer**. Without this, a 2 GiB-attacker-controlled
`newSize` would force a pre-verification `Uint8Array` allocation
that OOMs the consumer.

```ts
import { parsePatchHeader, MAX_OUTPUT_SIZE } from "binpatch";

try {
  const header = parsePatchHeader(patchBytes);
  // header.newSize is guaranteed to be <= MAX_OUTPUT_SIZE
} catch (e) {
  // "Invalid TRDIFF10 patch: newSize exceeds maximum (2147483648)"
}
```

We chose 2 GiB because:
- Real-world self-updating CLI binaries are typically 100–500 MB.
- Even a hypothetical 10× growth from a 100 MB binary tops out at ~3 GB,
  which is above our cap — but legitimate patches in that range are
  not the consumers of `binpatch`'s simple apply path. If you ship
  multi-GB binaries, set `MAX_OUTPUT_SIZE` higher in your consumer
  (the constant is exported for this reason).

## Chain depth limits

A chain with 100 hops is a sign of either a runaway agent pushing
versions, or a malicious chain attempting to pin the consumer in a
long loop. We cap:

- `MAX_NIGHTLY_CHAIN_DEPTH = 30` — nightly publishes are frequent,
  30 hops covers a year of monthly releases.
- `MAX_STABLE_CHAIN_DEPTH = 10` — stable publishes are rare,
  10 hops covers a year of monthly releases.

If a chain exceeds the depth, the resolution returns `null` with
reason `"too_long"`. Consumers fall back to full download.

## Cumulative size ratio

`SIZE_THRESHOLD_RATIO = 0.6` — if the sum of patch sizes in a chain
exceeds 60% of the new binary size, the resolution returns `null`
with reason `"over_budget"`. This is a defense against a chain that
"looks like" a full re-derivation — if you're going to push 60%+
of the new binary anyway, the user might as well download it as a
single file.

## Per-HTTP timeouts

Every HTTP call inside the library (`fetchManifest`, `downloadBlob`,
redirect fetches) is wrapped in `buildSignal(timeout, externalSignal)`:

- Default request timeout: **10 seconds**
- Default blob timeout: **30 seconds** (gzipped binaries are larger)

If the external `signal` is passed (e.g. from a higher-level cancel),
the effective deadline is whichever fires first. Redirect fetches
that follow a `3xx` response carry the same timeout wrapper — a
stalled Azure redirect (or similar) cannot hang the apply.

## What's NOT covered

`binpatch` does not provide:

- **Patch authenticity** — that's the consumer's job (sign your
  patches, verify signatures on receipt).
- **TLS configuration** — pass an appropriate `fetch` implementation
  (`undici` with your CA bundle, `node-fetch` with a custom agent,
  etc.). See [Custom fetch / CA](/custom-fetch/).
- **Sandboxing the apply** — if you don't trust the patch data,
  run `resolveAndApply` in a worker thread with limited memory.

## `from-version` annotation trust

The OCI patch manifest carries a `from-version=<prev>` annotation that
chain discovery uses to walk backward from the target version to the
user's current version. **This annotation is a chain pointer, not a
content hash** — `applyPatchChainInMemory` only verifies the final
output's SHA-256. The library cannot detect a bug where the annotation
claims source `A` but the patch bytes were generated from source `B`.
A user at `A` would then receive a "patch" that silently produces a
different binary.

**Your CI must guarantee the annotation matches the actual patch
source.** Recomputing the previous tag independently in two CI jobs
(e.g. a `generate-patches` job and a `publish-nightly` job) is a
recipe for this exact bug — the two jobs can disagree if the tag list
state changes between them (e.g. a concurrent push), the sort comparator
mismatches what the upstream semver used, or a manual republish reuses
the same tag. Pass the source version from the job that actually
generated the bytes (artifact file, env var, or shared step output),
not from a re-derived tag listing.

## Output fd release

`applyReaderToFile` writes the patched binary to `destPath` and closes
the file descriptor **synchronously** before returning. Consumers can
immediately `spawn` (or otherwise `execve`) the output file without
risking `ETXTBSY` ("text file busy").

Why this matters: Node's `fs.createWriteStream(path).end()` callback
fires on the `'finish'` event — which signals data has been flushed,
not that the underlying fd has been released at the kernel level. On
Linux, `execve` checks the kernel's open-fd table; if any fd is still
open for write to the target file, `execve` returns `ETXTBSY`. The
window between the `finish` callback and the kernel fd release is
small but non-zero — enough to intermittently break self-updates that
chain `applyPatchChainInMemory` immediately into a `spawn` of the
result. We sidestep it by using `fs.openSync` + `fs.writeSync` +
`fs.closeSync` instead of the stream API.

## Next

- [Wire Contract →](/wire-contract/) — exact file format and tag scheme
- [Custom fetch / CA →](/custom-fetch/) — passing your TLS configuration
