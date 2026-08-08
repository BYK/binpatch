---
title: Wire Contract
---

The wire contract has three pieces. Implementers (the GitHub Action, your
custom CI, third-party patchers) need to follow them; consumers (just
calling `applyPatchChainInMemory`) only need to know they exist.

## 1. TRDIFF10 patch file format

A patch is a single binary file with this layout:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 8 bytes | Magic | ASCII string `"TRDIFF10"`. |
| 8 | 8 bytes | `controlLen` | Size of the uncompressed control block (LE int64). |
| 16 | 8 bytes | `diffLen` | Size of the uncompressed diff block (LE int64). |
| 24 | 8 bytes | `newSize` | Total size of the post-apply file (LE int64, sign-magnitude). |
| 32 | `controlLen` | `control` | zstd-compressed control block (tuples). |
| 32 + controlLen | `diffLen` | `diff` | zstd-compressed diff block (XOR-differences). |
| 32 + controlLen + diffLen | (compressed) | `extra` | zstd-compressed literal output. |

The **control block** is a series of 24-byte tuples (little-endian):

```c
struct Control {
  int64_t readDiffBy;   // bytes to read from the "diff" stream
  int64_t readExtraBy;  // bytes to read from the "extra" stream
  int64_t seekBy;       // bytes to seek forward in the "old" stream
};
```

The **diff block** is the XOR-difference of the matching region.
The **extra block** is literal bytes appended when the new file is
longer than the old one.

`newSize` is sign-magnitude encoded. Positive magnitudes are common,
but negative values are permitted (means "seek backward in old").

### `MAX_OUTPUT_SIZE`

`newSize` is bounded by `MAX_OUTPUT_SIZE = 2 GiB` (2,147,483,648
bytes). `parsePatchHeader` rejects any value greater than this BEFORE
allocating the output buffer, defending against a malicious patch that
would otherwise force a pre-verification OOM.

## 2. OCI / GHCR tag scheme

For nightly updates, patches are stored in an OCI registry
([GHCR](https://ghcr.io), [Docker Hub](https://hub.docker.com),
[ACR](https://azure.microsoft.com/en-us/products/container-registry/), …).

### Binaries

| Tag | Mutable? | Purpose |
|-----|----------|---------|
| `<repo>:nightly` | Yes | Latest nightly. Repointed on each publish. |
| `<repo>:nightly-<version>` | No (immutable) | Versioned copy. Preserved for chain discovery. |

Manifest annotation:
- `org.opencontainers.image.title` = `<binaryName>.gz` (per layer)
- `application/vnd.oci.image.layer.v1.tar+gzip` (media type for gzipped blobs)

### Patches

| Tag | Purpose |
|-----|---------|
| `<repo>:patch-<version>` | Manifest for version `<version>`, pointing back to previous version via `from-version` annotation. |

Manifest annotations:
- `from-version=<prevVersion>` — chain back-pointer. **This is a pointer, not a content hash** — the library verifies only the final output SHA. The publish pipeline MUST guarantee the annotation matches the actual patch source. See [Security → `from-version` annotation trust](/security/#from-version-annotation-trust).
- `sha256-<binaryName>=<hex-sha256-of-uncompressed-new-binary>` — integrity anchor
- `org.opencontainers.image.title` (per layer) = `<binaryName>.patch`

Artifact type:
- `application/vnd.<prefix>.patch` (e.g. `application/vnd.lore.cli.patch`)

The patch manifest contains one layer per supported platform. Each
layer's content is a single TRDIFF10 patch file. Consumers pick the
layer matching their current platform (linux-x64, darwin-arm64,
windows-x64.exe, etc.).

## 3. GitHub Releases tag scheme (stable channel)

For stable updates, patches are attached to GitHub Releases.

Each release has assets named `<binaryName>.patch` plus the gzipped
binary itself (e.g. `myapp-linux-x64.gz`). The patch's expected
SHA-256 is the SHA-256 of the *uncompressed* new binary, stored in the
release's tag-name annotation by the consumer's CI (the GitHub Action
takes care of this).

Stable channel discovery uses `extractStableChain`, which slices the
list of recent releases to find the chain `(currentVersion, targetVersion]`
in version order, capped at `MAX_STABLE_CHAIN_DEPTH = 10` hops.

## Versions and chains

A **chain** is an ordered sequence of patches spanning consecutive
versions. For a user on `1.2.2` upgrading to `1.2.5` with three
patches published (1.2.2→1.2.3, 1.2.3→1.2.4, 1.2.4→1.2.5), the
chain is all three. The library applies them in order; only the
**final** binary's SHA-256 is verified against the target's expected
hash. Intermediate hops are trusted (a corrupt intermediate hop
will fail the final hash check anyway). See [Security →](/security/#sha-256-verification-sole-trust-anchor)
for the rationale.

Chain depth limits (defensive — caller can override):
- `MAX_STABLE_CHAIN_DEPTH = 10` (GitHub Releases channel)
- `MAX_NIGHTLY_CHAIN_DEPTH = 30` (OCI / GHCR channel)

Cumulative budget:
- `SIZE_THRESHOLD_RATIO = 0.6` — patches summing to more than 60% of
  the final binary size trigger a full-download fallback. Defends
  against chains that essentially re-derive the binary from patches.

## Next

- [Architecture →](/architecture/) — design decisions, why bsdiff vs Courgette, why SWAR
- [Security →](/security/) — SHA-256 verification, OOM guards, timeout signals
