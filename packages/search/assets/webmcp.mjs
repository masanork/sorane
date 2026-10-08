// Native WebMCP helpers. Content comes from the build's public IR projection.
export function registerTool(tool, options) {
  Promise.resolve().then(() => document.modelContext.registerTool(tool, options)).catch((err) => {
    console.warn(`[sorane] WebMCP ${tool.name} registration failed`, err);
  });
}

function objectInput(input, keys) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !keys.includes(key))) {
    throw new TypeError(`Expected an object containing only ${keys.join(", ")}`);
  }
}

function textInput(value, name, max = 2048) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new TypeError(`${name} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

const urlSchema = { type: "string", minLength: 1, maxLength: 2048,
  description: "Published page URL returned by search_site; absolute or site-relative." };

export function registerContentTools(root) {
  const indexUrl = new URL(root.getAttribute("data-index"), document.baseURI);
  const siteUrl = new URL("../", indexUrl);
  const ja = root.getAttribute("data-lang")?.startsWith("ja");
  const manifestUrl = root.getAttribute("data-webmcp-content");
  let manifest;
  let panel;

  function display(title, body, links = []) {
    panel ??= document.createElement("aside");
    panel.className = "webmcp-preview";
    panel.setAttribute("aria-live", "polite");
    const heading = document.createElement("h2");
    heading.textContent = title;
    const text = document.createElement("pre");
    text.textContent = body;
    const list = document.createElement("ul");
    for (const { title, url } of links) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = url;
      a.textContent = title;
      li.append(a);
      list.append(li);
    }
    panel.replaceChildren(heading, text, list);
    (document.querySelector("main") || root.parentElement).append(panel);
  }

  async function load(signal) {
    signal?.throwIfAborted();
    if (manifest) return manifest;
    const response = await fetch(manifestUrl, { signal });
    if (!response.ok) throw new Error(`failed to fetch webmcp-content.json (${response.status})`);
    const data = await response.json();
    signal?.throwIfAborted();
    if (data.schema_version !== 1 || !Array.isArray(data.pages) || !Array.isArray(data.packs)) {
      throw new Error("Invalid WebMCP content manifest");
    }
    manifest = data;
    return data;
  }

  function localUrl(raw) {
    const url = new URL(textInput(raw, "url"), siteUrl);
    if (url.origin !== siteUrl.origin || !url.pathname.startsWith(siteUrl.pathname)) {
      throw new TypeError("URL must belong to this site");
    }
    return url;
  }

  function findPage(data, raw) {
    const url = localUrl(raw);
    const page = data.pages.find((entry) => new URL(entry.url, siteUrl).pathname === url.pathname);
    if (!page) throw new Error("Published page not found");
    return { page, url };
  }

  const enabled = (root.getAttribute("data-webmcp-tools") || "").split(" ");
  const annotations = { readOnlyHint: true, untrustedContentHint: true };
  if (enabled.includes("read_page")) registerTool({
    name: "read_page",
    description: "Read a published page or one heading section. Returns its complete content, table of contents, publication dates, sources, verification history and available AI disclosure. Displays the selected content in the page for review.",
    annotations,
    inputSchema: { type: "object", properties: { url: urlSchema,
      section: { type: "string", minLength: 1, maxLength: 512, description: "Heading anchor from the table of contents. A URL fragment also selects a section." } },
      required: ["url"], additionalProperties: false },
    execute: async (input, { signal } = {}) => {
      objectInput(input, ["url", "section"]);
      textInput(input.url, "url");
      const section = input.section === undefined ? undefined : textInput(input.section, "section", 512).replace(/^#/, "");
      const data = await load(signal);
      if (!data.features.read_page) throw new Error("Page reading is disabled");
      const { page, url } = findPage(data, input.url);
      const selected = section ?? (url.hash ? decodeURIComponent(url.hash.slice(1)) : undefined);
      const match = selected ? page.sections.find((entry) => entry.id === selected) : undefined;
      if (selected && !match) throw new Error("Heading section not found");
      const canonicalUrl = new URL(page.url, siteUrl);
      if (match) canonicalUrl.hash = match.id;
      const { dataset, sections, ...metadata } = page;
      const result = { ...metadata, url: canonicalUrl.href, body: match ? match.body : page.body,
        body_format: match ? "markdown" : page.body_format,
        ...(match ? { section: match.id } : {}),
        toc: sections.map(({ id, title, depth }) => ({ id, title, depth, url: `${new URL(page.url, siteUrl).href}#${encodeURIComponent(id)}` })) };
      signal?.throwIfAborted();
      display(match ? `${page.title} / ${match.title}` : page.title, result.body,
        [{ title: ja ? "ページを開く" : "Open page", url: result.url }]);
      return result;
    },
  });
  if (enabled.includes("get_dataset")) registerTool({
    name: "get_dataset", annotations,
    description: "Get published dataset metadata: distribution links, formats, media types, file sizes, checksums, license and publisher. Does not download the files. Displays the metadata and links in the page.",
    inputSchema: { type: "object", properties: { url: urlSchema }, required: ["url"], additionalProperties: false },
    execute: async (input, { signal } = {}) => {
      objectInput(input, ["url"]);
      textInput(input.url, "url");
      const data = await load(signal);
      if (!data.features.datasets) throw new Error("Dataset lookup is disabled");
      const { page } = findPage(data, input.url);
      if (!page.dataset) throw new Error("Page is not a published dataset");
      const pageUrl = new URL(page.url, siteUrl);
      function distributionUrl(raw) {
        const url = new URL(raw.startsWith("/") ? raw.slice(1) : raw, raw.startsWith("/") ? siteUrl : pageUrl);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid distribution URL");
        return url.href;
      }
      const distributions = page.dataset.distributions.map((item) => ({ ...item,
        accessURL: distributionUrl(item.accessURL),
        ...(item.downloadURL ? { downloadURL: distributionUrl(item.downloadURL) } : {}),
      }));
      const result = { title: page.title, url: pageUrl.href, updated: page.updated, lang: page.lang,
        ...page.dataset, distributions };
      signal?.throwIfAborted();
      display(page.title, [result.description, result.license?.id, result.publisher?.name,
        ...distributions.map((d) => `${d.title} (${d.format})`)].filter(Boolean).join("\n"),
        distributions.map((d) => ({ title: d.title, url: d.downloadURL || d.accessURL })));
      return result;
    },
  });
  if (enabled.includes("get_knowledge_pack")) registerTool({
    name: "get_knowledge_pack", annotations,
    description: "Find available OKFC knowledge packs for offline use. Optionally provide a published page URL to return only packs containing that page, most specific first. Returns download links and each pack's content scope without downloading it.",
    inputSchema: { type: "object", properties: { url: urlSchema }, additionalProperties: false },
    execute: async (input, { signal } = {}) => {
      objectInput(input, ["url"]);
      if (input.url !== undefined) textInput(input.url, "url");
      const data = await load(signal);
      if (!data.features.knowledge_packs) throw new Error("Knowledge pack lookup is disabled");
      const target = input.url === undefined ? undefined : findPage(data, input.url).page.url;
      const packs = data.packs.filter((pack) => !target || pack.pages.includes(target))
        .sort((a, b) => a.concept_count - b.concept_count || a.id.localeCompare(b.id))
        .map((pack) => {
          const pages = data.pages.filter((page) => pack.pages.includes(page.url));
          const unique = (key) => [...new Set(pages.flatMap((page) => page[key] || []))].sort();
          return { id: pack.id, title: pack.title, description: pack.description,
            url: localUrl(pack.path).href, format: "okfc", concept_count: pack.concept_count,
            scope: { pages: pack.pages.map((url) => localUrl(url).href),
              types: unique("doc_type"), tags: unique("tags"), languages: unique("lang") } };
        });
      signal?.throwIfAborted();
      display(ja ? "オフラインで使う知識パック" : "Knowledge packs for offline use",
        packs.length ? packs.map((pack) => `${pack.title || pack.id}: ${pack.concept_count}`).join("\n")
          : (ja ? "該当する知識パックはありません。" : "No matching knowledge packs."),
        packs.map((pack) => ({ title: pack.title || pack.id, url: pack.url })));
      return { count: packs.length, packs };
    },
  });
  if (root.getAttribute("data-webmcp-contact-enabled") === "true") registerContactTool(ja);
}

function registerContactTool(ja) {
  let active;
  let signature;
  function refresh() {
    const form = document.querySelector("form[data-webmcp-contact], [data-webmcp-contact] form");
    const fields = form ? [...form.elements].filter((element) =>
      (element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement &&
        ["text", "email", "tel", "url"].includes(element.type))) &&
      element.name && !element.disabled && !element.readOnly && element.getClientRects().length > 0) : [];
    const next = fields.map((field) => `${field.name}:${field.maxLength}`).join("|");
    if (active?.form === form && signature === next) return;
    active?.controller.abort();
    active = undefined;
    signature = next;
    if (!fields.length || new Set(fields.map((field) => field.name)).size !== fields.length) return;
    const controller = new AbortController();
    active = { form, controller };
    const limit = (field) => field.maxLength > 0 ? Math.min(field.maxLength, 8000) : 4000;
    registerTool({
      name: "prepare_contact",
      description: "Fill the visible contact form with a draft for the user to review and send manually. Never submits, authenticates or sends a message. Existing non-empty values are preserved unless overwrite is explicitly true. Only available while an editable contact form is visible.",
      annotations: { readOnlyHint: false, untrustedContentHint: true, consequentialHint: false },
      inputSchema: { type: "object", properties: {
        fields: { type: "object", properties: Object.fromEntries(fields.map((field) => [field.name,
          { type: "string", maxLength: limit(field), description: field.labels?.[0]?.textContent?.trim() || field.name }])),
          minProperties: 1, additionalProperties: false },
        overwrite: { type: "boolean", default: false },
      }, required: ["fields"], additionalProperties: false },
      execute: async (input, { signal } = {}) => {
        signal?.throwIfAborted();
        objectInput(input, ["fields", "overwrite"]);
        objectInput(input.fields, fields.map((field) => field.name));
        if (!Object.keys(input.fields).length) throw new TypeError("Provide at least one field");
        if (input.overwrite !== undefined && typeof input.overwrite !== "boolean") throw new TypeError("overwrite must be boolean");
        controller.signal.throwIfAborted();
        for (const field of fields) {
          if (!(field.name in input.fields)) continue;
          const value = input.fields[field.name];
          if (!field.isConnected || field.disabled || field.readOnly || !field.getClientRects().length) throw new Error("Contact form is no longer editable");
          if (typeof value !== "string" || value.length > limit(field)) throw new TypeError(`Invalid ${field.name} value`);
          if (!input.overwrite && field.value && field.value !== value) throw new Error(`Field ${field.name} already contains text; review it or explicitly allow overwrite`);
        }
        for (const field of fields) {
          if (!(field.name in input.fields)) continue;
          field.value = input.fields[field.name];
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        }
        let status = form.querySelector("[data-webmcp-contact-status]");
        if (!status) {
          status = document.createElement("p");
          status.setAttribute("data-webmcp-contact-status", "");
          status.setAttribute("role", "status");
          form.append(status);
        }
        status.textContent = ja ? "下書きを入力しました。内容を確認し、ご自身で送信してください。" : "Draft filled. Review the content and send it yourself.";
        fields.find((field) => field.name in input.fields)?.focus();
        return { prepared: Object.keys(input.fields), submitted: false, requires_user_submission: true };
      },
    }, { signal: controller.signal });
  }
  // Authentication / tab changes may add or remove a contact form after page load.
  new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true,
    attributes: true, attributeFilter: ["disabled", "readonly", "hidden", "class", "style", "name", "maxlength"] });
  refresh();
}
