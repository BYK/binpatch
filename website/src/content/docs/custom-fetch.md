---
title: Custom fetch / CA
---

`binpatch` ships with `OciClient` (low-level OCI client) and the
`ghcrSource` / `githubReleaseSource` factories (high-level discovery
strategies). All three wrap a configurable `fetch`. Pass your own
implementation to support corporate proxies, custom CA bundles,
or test fixtures.

## Why this matters

The default `fetch` is `globalThis.fetch`. If your environment
requires a CA bundle (corporate TLS interception, mTLS to GHCR
Enterprise, etc.), `globalThis.fetch` won't work — you need to
inject a `fetch` that loads your CA store.

The library never imports `undici`, `node-fetch`, or any HTTP
client directly. This is intentional: HTTP client choice is
infrastructure, not business logic, and we don't want to take a
position.

## Injecting a fetch

### Via `OciClient`

```ts
import { OciClient } from "binpatch";
import { Agent } from "undici";

const dispatcher = new Agent({
  connect: {
    ca: await readFile("/etc/ssl/certs/corporate-ca.pem", "utf8"),
    rejectUnauthorized: true,
  },
});

const customFetch: typeof fetch = (input, init) => {
  // Wrap global fetch with the dispatcher.
  // undici's fetch accepts a dispatcher via the init.dispatcher field.
  return fetch(input, { ...init, dispatcher } as RequestInit);
};

const client = new OciClient({
  registry: "https://ghcr.example.internal",
  repo: "your-org/your-app",
  fetch: customFetch,
  userAgent: "myapp/1.2.3",
});
```

### Via `ghcrSource` / `githubReleaseSource`

Both built-in sources accept `fetch` in their config:

```ts
const source = ghcrSource({
  registry: "https://ghcr.io",
  repo: "your-org/your-app",
  binaryName: "myapp",
  targetTag: (version) => `nightly-${version}`,
  compareVersions: semver.compare,
  fetch: customFetch, // <-- here
});
```

`fetch` is optional — defaults to `globalThis.fetch`.

### Via `resolveAndApply`

`resolveAndApply` does **not** take a top-level `fetch`. The `fetch`
is configured on the source object (e.g. `ghcrSource({ fetch })`),
and `resolveAndApply` uses whatever the source provides. If you need
proxy/CA support, configure it once on the source and pass the
source to `resolveAndApply`.

## Timeout semantics

Every HTTP call inside the library is wrapped in
`buildSignal(timeout, externalSignal)`:

- Default request timeout: **10 seconds**
- Default blob timeout: **30 seconds**

If you pass an `AbortSignal` (via `resolveAndApply`'s `signal` field
or a source's `signal` parameter), the effective deadline is
**whichever fires first**. A stalled Azure redirect cannot hang
the apply because the redirect fetch also carries the timeout.

```ts
await resolveAndApply({
  // ...
  signal: AbortSignal.timeout(60_000), // hard cap on the whole flow
});
```

## Test injection

For unit tests, a custom `fetch` is how you fake the registry. Pass
it to the source's config:

```ts
import { vi } from "vitest";
import { resolveAndApply, ghcrSource } from "binpatch";

const mockFetch = vi.fn().mockImplementation(async (input) => {
  const url = input.toString();
  if (url.endsWith("/token")) {
    return new Response("", { status: 200 });
  }
  if (url.includes("/manifests/")) {
    return new Response(JSON.stringify(fakeManifest), {
      status: 200,
      headers: { "content-type": "application/vnd.oci.image.manifest.v1+json" },
    });
  }
  return new Response(Buffer.from(fakeBlob), { status: 200 });
});

const source = ghcrSource({
  // ...other config...
  fetch: mockFetch,
});

await resolveAndApply({
  source,
  // ...other opts...
});
```

The library never calls `globalThis.fetch` directly when `fetch` is
injected — your test fixture is the only HTTP path.

## Common pitfalls

**Forgot to inject on the source vs. on `resolveAndApply`.**
`resolveAndApply`'s `fetch` flows to its internal calls; sources
manage their own HTTP. If you inject only on `resolveAndApply`,
the source's HTTP still uses global fetch. Inject on the source's
config object (`ghcrSource({ fetch })`) when you need to cover
discovery too.

**Forgot about HTTPS-vs-HTTP redirect upgrades.**
If you use `undici`'s `Agent` with `connect.rejectUnauthorized`,
it applies to all redirects too. Your injected `fetch` wrapper
must preserve this — pass the dispatcher on every redirect, not
just the initial request.

**`globalThis.fetch` isn't loaded yet.**
In Node < 18 or some test environments, `globalThis.fetch` is
`undefined`. The library treats `undefined` as "use global", which
throws. Pass an explicit `fetch` from `node-fetch`, `undici`, or
your own polyfill.

## Next

- [Progress & events →](./progress/) — `ProgressEvent` lifecycle
- [Discovering chains →](./discover/) — `SourceStrategy` interface
