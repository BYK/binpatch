import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { fileURLToPath } from "node:url";
import mermaidRenderer from "./integrations/mermaid-renderer.mjs";
import {
  socialAssets,
  generateAssetsEagerly,
} from "./integrations/social-assets.ts";

// Production serves from the root of the custom domain binpatch.p.byk.im.
// PR previews are built under `/_preview/pr-<n>/` (pr-preview-action's
// umbrella dir) — same root, so DOCS_BASE_PATH points there with no /binpatch/.
const base = process.env.DOCS_BASE_PATH || "/";

// Run the OG image generation synchronously at config-load time so the
// Starlight head array can reference the (content-hashed) OG image
// filename. Without this, the static head array would hardcode a stale
// URL and social platforms could cache the wrong image indefinitely.
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const { ogFilename } = await generateAssetsEagerly(projectRoot);

export default defineConfig({
  site: "https://binpatch.p.byk.im",
  base,
  integrations: [
    // Bundles the Mermaid renderer into every page so fenced ```mermaid
    // blocks render as SVG. See ./integrations/mermaid-renderer.mjs.
    mermaidRenderer(),
    // Generates the 1200x630 OG image at build time with a content-hashed
    // filename. See ./integrations/social-assets.ts.
    socialAssets(),
    starlight({
      title: "binpatch",
      description:
        "Stop re-downloading the entire binary on every CLI update. binpatch generates and applies small binary delta patches — the same engine sentry-cli uses.",
      logo: {
        src: "./src/assets/logo.svg",
        replacesTitle: true,
      },
      head: [
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.googleapis.com",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: "anonymous",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: "/favicon.svg",
            type: "image/svg+xml",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: "/favicon-32.png",
            sizes: "32x32",
            type: "image/png",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            href: "/apple-touch-icon.png",
            sizes: "180x180",
          },
        },
        // Open Graph + Twitter Card. The OG image is content-hashed at
        // build time so the URL changes whenever the image does — see
        // integrations/social-assets.ts for the generation logic.
        {
          tag: "meta",
          attrs: {
            property: "og:title",
            content: "binpatch",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:description",
            content:
              "Ship binary updates that download a patch instead of the whole file. binpatch generates and applies small binary delta patches — the same engine getsentry/cli uses to self-update.",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: `https://binpatch.p.byk.im${base}${ogFilename}`,
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:width",
            content: "1200",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:height",
            content: "630",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content: "binpatch — Patch only what moved. Up to 96% smaller updates for any binary.",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:url",
            content: "https://binpatch.p.byk.im",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:type",
            content: "website",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:site_name",
            content: "binpatch",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:card",
            content: "summary_large_image",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:title",
            content: "binpatch",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:description",
            content: "Patch only what moved. Up to 96% smaller updates for any binary.",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image",
            content: `https://binpatch.p.byk.im${base}${ogFilename}`,
          },
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/BYK/binpatch",
        },
        { icon: "npm", label: "npm", href: "https://www.npmjs.com/package/binpatch" },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "" },
            { label: "Installation", slug: "installation" },
            { label: "Quickstart", slug: "getting-started" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Wire Contract", slug: "wire-contract" },
            { label: "Architecture", slug: "architecture" },
            { label: "Security", slug: "security" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Applying patches", slug: "apply" },
            { label: "Discovering chains", slug: "discover" },
            { label: "Progress & events", slug: "progress" },
            { label: "Custom fetch / CA", slug: "custom-fetch" },
            { label: "Instrumentation hook", slug: "telemetry" },
          ],
        },
        {
          label: "CI Integration",
          items: [
            { label: "GitHub Action", slug: "github-action" },
            { label: "Library integration", slug: "ci-integration" },
          ],
        },
        {
          label: "Resources",
          items: [
            { label: "FAQ", slug: "faq" },
            { label: "Contributing", slug: "contributing" },
          ],
        },
      ],
      customCss: ["./src/custom.css"],
      components: {
        Footer: "./src/components/Footer.astro",
      },
    }),
  ],
});
