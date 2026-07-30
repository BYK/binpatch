import type { APIRoute, GetStaticPaths } from "astro";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCollection } from "astro:content";

export const prerender = true;

// `process.cwd()` is the website/ directory at build time — robust across
// dev, `astro build`, and the bundled chunk locations.
const docsDir = join(process.cwd(), "src", "content", "docs");

export const getStaticPaths: GetStaticPaths = async () => {
  const entries = await getCollection("docs");
  // Each `id` is the entry's path-without-extension under the docs dir.
  // Astro appends the literal segment after the bracket, so the generated
  // URL is `/<slug>.md` — we just need the slug part without `.md`.
  //
  // We emit every URL form Starlight itself uses, so a MarkdownLink using
  // a relative href resolves no matter where the link sits in the tree:
  //   - `wire-contract.md`        → `/wire-contract.md`
  //   - `wire-contract/index.md`  → `/wire-contract/index.md`
  //   - `wire-contract/wire-contract.md` (the form a relative `wire-contract.md`
  //     href resolves to from `/wire-contract/`)
  const seen = new Set<string>();
  const paths: { params: { slug: string } }[] = [];
  for (const entry of entries) {
    for (const slug of expandSlug(entry.id)) {
      const forms = new Set([slug, join(slug, basename(slug))]);
      for (const form of forms) {
        if (seen.has(form)) continue;
        seen.add(form);
        paths.push({ params: { slug: form } });
      }
    }
  }
  return paths;
};

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function expandSlug(id: string): string[] {
  if (!id || id === "index") return ["index"];
  const stripped = id.replace(/\.(md|mdx)$/, "");
  return [stripped, join(stripped, "index")];
}

export const GET: APIRoute = async ({ params }) => {
  const slugParam = params.slug ?? "";
  if (!slugParam) {
    return new Response("not found", { status: 404 });
  }

  // The slug can arrive as:
  //   `wire-contract`            → source is `wire-contract.md`
  //   `wire-contract/index`      → source is `wire-contract/index.md` (same content)
  //   `wire-contract/wire-contract` → produced by Starlight's relative-href
  //     resolution; resolves back to `wire-contract.md` on disk.
  // Try the literal path first, then progressively back off to basename.
  const bases = [slugParam, basename(slugParam)];
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const b of bases) {
    for (const ext of ["mdx", "md"]) {
      for (const form of [b, join(b, "index")]) {
        const rel = `${form}.${ext}`;
        if (seen.has(rel)) continue;
        seen.add(rel);
        candidates.push(rel);
      }
    }
  }

  for (const rel of candidates) {
    const full = join(docsDir, rel);
    try {
      const body = await readFile(full, "utf8");
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    } catch {
      // try next candidate
    }
  }

  return new Response(`# not found\n\nno source for ${slugParam}\n`, {
    status: 404,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};