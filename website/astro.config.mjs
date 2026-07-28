import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Production serves from the root of the custom domain binpatch.p.byk.im.
// PR previews are built under `/_preview/pr-<n>/` (pr-preview-action's
// umbrella dir) — same root, so DOCS_BASE_PATH points there with no /binpatch/.
const base = process.env.DOCS_BASE_PATH || "/";

export default defineConfig({
  site: "https://binpatch.p.byk.im",
  base,
  integrations: [
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
    }),
  ],
});
