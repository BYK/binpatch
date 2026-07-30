// Mermaid renderer integration.
//
// Bundles the Mermaid renderer into every page so fenced ```mermaid
// blocks render as SVG. The render target is any
// `pre[data-language="mermaid"]` block (Expressive Code's wrapping of
// a Mermaid fenced code block) — replaced with the rendered SVG.
export default function mermaidRenderer() {
  return {
    name: "mermaid-renderer",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        injectScript(
          "page",
          `
          import mermaid from "mermaid";
          mermaid.initialize({
            startOnLoad: false,
            theme: "neutral",
            securityLevel: "loose",
            fontFamily: "var(--sl-font)"
          });
          const blocks = document.querySelectorAll('pre[data-language="mermaid"]');
          for (const pre of blocks) {
            const source = Array.from(pre.querySelectorAll('.ec-line')).map((l) => l.textContent).join('\\n');
            if (!source.trim()) continue;
            const id = 'mermaid-' + Math.random().toString(36).slice(2, 9);
            try {
              const { svg } = await mermaid.render(id, source);
              const wrap = document.createElement('div');
              wrap.className = 'mermaid';
              wrap.innerHTML = svg;
              pre.replaceWith(wrap);
            } catch (err) {
              console.error('Mermaid render failed:', err);
              pre.textContent = source;
            }
          }
        `,
        );
      },
    },
  };
}
