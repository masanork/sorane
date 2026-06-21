// sorane-mermaid-loader.mjs — client-side Mermaid rendering (bunsen 013 pattern).

function sanitizeSvgMarkup(svg) {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

(async () => {
  const fences = document.querySelectorAll("pre > code.language-mermaid");
  if (fences.length === 0) return;

  let mermaid;
  try {
    const mod = await import(
      new URL("./mermaid-{{ MERMAID_VERSION }}/mermaid.esm.min.mjs", import.meta.url).href
    );
    mermaid = mod.default;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  } catch (err) {
    console.error("[sorane-mermaid] failed to load mermaid module:", err);
    return;
  }

  const lang = document.documentElement.lang ?? "";
  const defaultAlt = lang.startsWith("ja") ? "図" : "Diagram";

  let i = 0;
  for (const code of fences) {
    const pre = code.parentElement;
    if (!pre) continue;
    const source = code.textContent ?? "";
    const alt =
      pre.dataset.soraneAlt && pre.dataset.soraneAlt.length > 0
        ? pre.dataset.soraneAlt
        : defaultAlt;
    try {
      const { svg } = await mermaid.render(`sorane-mermaid-${i}`, source);
      const figure = document.createElement("figure");
      figure.setAttribute("role", "img");
      figure.setAttribute("aria-label", alt);
      figure.innerHTML = sanitizeSvgMarkup(svg);
      pre.replaceWith(figure);
    } catch (err) {
      console.error(`[sorane-mermaid] render failed (idx=${i}):`, err);
    } finally {
      i += 1;
    }
  }
})();