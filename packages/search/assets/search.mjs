// Browser-side search (sorane SSG).
//
// FTS mount: <div data-search data-index=".../assets/search-index.json">
import { registerContentTools, registerTool } from "./webmcp.mjs";

const TOP_K = 10;
const MAX_RESULTS = 20;
const MAX_QUERY_LENGTH = 512;
const DOC_TYPES = ["article", "dataset", "reference", "glossary", "glossary-term", "faq"];
const SOURCE_FACETS = ["ai-generated", "human", "disclosed"];

const LABELS = {
  ja: {
    loadingIndex: "検索インデックスを読み込み中…",
    searching: "検索中…",
    noResults: "一致するページは見つかりませんでした。キーワードを変えてお試しください。",
    emptyQuery: "検索キーワードを入力してください。",
    resultCount: (n) => `${n} 件`,
    error: (msg) => `エラー: ${msg}`,
    offline: "オフライン — キャッシュした索引で検索します",
    indexReady: "索引を読み込みました（オフライン利用可）",
    cancelled: "検索をキャンセルしました。",
    types: ["記事", "データセット", "参照", "用語集", "用語", "FAQ"],
    sources: ["AI生成・合成", "人間作成", "開示あり"],
  },
  en: {
    loadingIndex: "Loading search index…",
    searching: "Searching…",
    noResults: "No matching pages. Try different keywords.",
    emptyQuery: "Enter a search keyword.",
    resultCount: (n) => `${n} result${n === 1 ? "" : "s"}`,
    error: (msg) => `Error: ${msg}`,
    offline: "Offline — searching cached index",
    indexReady: "Index loaded (available offline)",
    cancelled: "Search cancelled.",
    types: ["Articles", "Datasets", "Reference", "Glossary", "Term", "FAQ"],
    sources: ["AI-generated", "Human-created", "Disclosed"],
  },
};

function labelsFor(lang) {
  return lang && lang.startsWith("ja") ? LABELS.ja : LABELS.en;
}

function tokenizeQuery(query) {
  const normalized = normalizeText(query);
  const terms = normalized.split(/[\s、。・，．:：;；!！?？()（）「」『』【】\[\]]+/).filter(Boolean);
  const words = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("ja", { granularity: "word" }).segment(normalized)]
      .filter((word) => word.isWordLike && word.segment.length >= 2).map((word) => word.segment)
    : [];
  return [...new Set([...terms, ...words])];
}

function normalizeText(text) {
  return String(text).normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

const AI_SOURCE_CODES = [
  "trainedAlgorithmicMedia",
  "compositeWithTrainedAlgorithmicMedia",
  "algorithmicMedia",
  "compositeSynthetic",
  "algorithmicallyEnhanced",
];
const HUMAN_SOURCE_CODES = [
  "digitalCapture",
  "digitalCreation",
  "humanEdits",
  "compositeCapture",
  "dataDrivenMedia",
  "negativeFilm",
  "positiveFilm",
  "print",
];

function matchesSourceFacet(digitalSourceType, facet) {
  if (!facet) return true;
  const dst = (digitalSourceType || "").trim();
  if (facet === "disclosed") return dst.length > 0;
  if (dst.length === 0) return false;
  const lower = dst.toLowerCase();
  if (facet === "ai-generated") {
    return AI_SOURCE_CODES.some((code) => lower.includes(code.toLowerCase()));
  }
  if (facet === "human") {
    return HUMAN_SOURCE_CODES.some((code) => lower.includes(code.toLowerCase()));
  }
  return true;
}

function ftsSearch(index, query, type, source, k = TOP_K, filters = {}) {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];
  const hits = [];
  for (let i = 0; i < index.chunks.length; i++) {
    const chunk = index.chunks[i];
    if (type && chunk.doc_type !== type) continue;
    if (!matchesSourceFacet(chunk.digital_source_type, source)) continue;
    const tags = String(chunk.tags || "").split(/[,\n]/).map((tag) => normalizeText(tag.trim()));
    if (filters.tags?.some((tag) => !tags.includes(normalizeText(tag)))) continue;
    if (filters.lang && (chunk.lang || "").toLowerCase() !== filters.lang.toLowerCase()) continue;
    const updated = chunk.updated?.slice(0, 10);
    if (filters.updated_after && (!updated || updated < filters.updated_after)) continue;
    if (filters.updated_before && (!updated || updated > filters.updated_before)) continue;
    const hay = normalizeText([
      chunk.text || chunk.snippet || "",
      chunk.title || "",
      chunk.heading_path || "",
      chunk.tags || "",
    ]
      .join(" "));
    let score = 0;
    for (const term of terms) {
      const needle = term;
      if (hay.includes(needle)) score += 1;
      if (normalizeText(chunk.title || "").includes(needle)) score += 2;
      if (normalizeText(chunk.heading_path || "").includes(needle)) score += 1;
    }
    if (score > 0) hits.push({ index: i, score, chunk });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}

function makeSnippet(text, query, max = 160) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const q = query.trim();
  let start = 0;
  if (q) {
    const idx = flat.indexOf(q);
    if (idx >= 0) start = Math.max(0, idx - Math.floor(max / 4));
  }
  const end = Math.min(flat.length, start + max);
  const body = flat.slice(start, end);
  return (start > 0 ? "…" : "") + body + (end < flat.length ? "…" : "");
}

function showEmptyState(resultsEl, root, message) {
  resultsEl.replaceChildren();
  const empty = document.createElement("li");
  empty.className = "search-empty";
  empty.setAttribute("role", "status");
  empty.textContent = message;
  resultsEl.appendChild(empty);
  root.setAttribute("aria-expanded", "true");
}

function setup(root) {
  const form = root.querySelector(".search-form");
  const input = root.querySelector(".search-input");
  const facet = root.querySelector(".search-facet:not(.search-facet--source)");
  const sourceFacet = root.querySelector(".search-facet--source");
  const status = root.querySelector("[data-search-status]");
  const resultsEl = root.querySelector("[data-search-results]");
  const indexUrl = root.getAttribute("data-index");
  const labels = labelsFor(root.getAttribute("data-lang"));
  if (!form || !input || !indexUrl || !resultsEl) return;
  // Index URLs are site-relative, even when this mount is on a nested page.
  const siteUrl = new URL("../", new URL(indexUrl, document.baseURI));

  let index = null;
  let active = null;

  const setStatus = (msg) => {
    if (!status) return;
    status.textContent = msg;
  };

  async function loadIndex(signal) {
    signal?.throwIfAborted();
    if (index) return index;
    setStatus(labels.loadingIndex);
    // Service Worker serves cache-first for search-index.json after install.
    let res;
    try {
      res = await fetch(indexUrl, { signal });
    } catch {
      signal?.throwIfAborted();
      throw new Error(
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "offline and search index is not cached yet"
          : "failed to fetch search-index.json (network)",
      );
    }
    if (!res.ok) {
      throw new Error(`failed to fetch search-index.json (${res.status})`);
    }
    const json = await res.json();
    signal?.throwIfAborted();
    if (!Array.isArray(json.chunks)) throw new Error("invalid search index");
    index = json;
    const hint = root.querySelector("[data-search-offline-hint]");
    if (hint && typeof navigator !== "undefined" && navigator.onLine === false) {
      hint.textContent = labels.offline;
    }
    return index;
  }

  function render(results, type, source, extra) {
    resultsEl.replaceChildren();
    const filters = [
      labels.types[DOC_TYPES.indexOf(type)],
      labels.sources[SOURCE_FACETS.indexOf(source)],
      ...(extra.tags || []), extra.lang, extra.updated_after, extra.updated_before,
    ].filter(Boolean).join(" / ");
    if (root.classList.contains("search--header") && status) {
      status.classList.toggle("search-status--sr", !filters);
    }
    const summary = results.length ? labels.resultCount(results.length) : labels.noResults;
    setStatus(filters ? `${summary} · ${filters}` : summary);
    if (results.length === 0) {
      showEmptyState(resultsEl, root, labels.noResults);
      return;
    }
    root.setAttribute("aria-expanded", "true");
    for (const result of results) {
      const li = document.createElement("li");
      li.className = "search-hit";

      const a = document.createElement("a");
      a.className = "search-hit-title";
      a.href = result.url;
      a.textContent = result.heading || result.title;
      li.appendChild(a);

      const meta = document.createElement("p");
      meta.className = "search-hit-meta";
      const scoreLabel = String(result.score);
      meta.textContent = `${result.doc_type || "-"} · ${result.source} · ${scoreLabel}`;
      li.appendChild(meta);

      const snippet = result.snippet;
      if (snippet) {
        const snip = document.createElement("p");
        snip.className = "search-hit-snippet";
        snip.textContent = snippet;
        li.appendChild(snip);
      }
      resultsEl.appendChild(li);
    }
  }

  async function search({ query, type = "", source = "", limit = TOP_K, tags = [], lang = "", updated_after = "", updated_before = "" }, { signal } = {}) {
    signal?.throwIfAborted();
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const requestSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    input.value = query;
    if (facet) facet.value = type;
    if (sourceFacet) sourceFacet.value = source;
    const extra = { tags, lang, updated_after, updated_before };
    for (const [name, value] of Object.entries(extra)) {
      const field = form.elements.namedItem(name);
      if (field) field.value = Array.isArray(value) ? value.join(", ") : value;
    }
    root.setAttribute("aria-busy", "true");
    try {
      const idx = await loadIndex(requestSignal);
      requestSignal.throwIfAborted();
      setStatus(labels.searching);
      const results = ftsSearch(idx, query, type, source, limit, extra).map(({ chunk, score }) => {
        const url = new URL(chunk.url || chunk.source.replace(/\.md$/i, ".html"), siteUrl);
        if (url.origin !== siteUrl.origin) throw new Error("invalid search result URL");
        if (chunk.heading_slug) url.hash = chunk.heading_slug;
        return {
          title: chunk.title || chunk.source,
          url: url.href,
          heading: chunk.heading_path || "",
          snippet: chunk.snippet || (chunk.text ? makeSnippet(chunk.text, query) : ""),
          doc_type: chunk.doc_type,
          source: chunk.source,
          score,
          tags: String(chunk.tags || "").split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean),
          ...(chunk.lang ? { lang: chunk.lang } : {}),
          ...(chunk.updated ? { updated: chunk.updated } : {}),
          ...(chunk.digital_source_type ? { digital_source_type: chunk.digital_source_type } : {}),
        };
      });
      render(results, type, source, extra);
      return { query, type, source, ...extra, count: results.length, results };
    } catch (err) {
      if (active === controller) {
        const message = requestSignal.aborted
          ? labels.cancelled
          : labels.error(err instanceof Error ? err.message : String(err));
        showEmptyState(resultsEl, root, message);
        setStatus(message);
      }
      throw err;
    } finally {
      if (active === controller) {
        root.removeAttribute("aria-busy");
        active = null;
      }
    }
  }

  function run(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      active?.abort();
      active = null;
      root.removeAttribute("aria-busy");
      showEmptyState(resultsEl, root, labels.emptyQuery);
      setStatus(labels.emptyQuery);
      return;
    }
    // Errors are already visible in the UI; tool calls instead reject to their caller.
    const value = (name) => form.elements.namedItem(name)?.value || "";
    let request;
    try {
      request = validateToolInput({ query: trimmed, type: facet?.value || "", source: sourceFacet?.value || "",
        tags: value("tags").split(",").map((tag) => tag.trim()).filter(Boolean),
        lang: value("lang"), updated_after: value("updated_after"), updated_before: value("updated_before") });
    } catch (err) {
      setStatus(labels.error(err.message));
      return;
    }
    search(request)
      .catch(() => {});
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(input.value);
  });

  document.addEventListener("click", (e) => {
    if (!root.classList.contains("search--header")) return;
    if (root.contains(e.target)) return;
    resultsEl.replaceChildren();
    root.removeAttribute("aria-expanded");
    if (status) status.textContent = "";
  });

  const initialQuery = new URLSearchParams(window.location.search).get("q");
  if (initialQuery) {
    input.value = initialQuery;
    run(initialQuery);
  } else if (root.classList.contains("search--header") === false) {
    // Warm the index (and SW cache) on the full search page without a query.
    loadIndex()
      .then(() => {
        if (!input.value.trim() && !active) setStatus(labels.indexReady);
      })
      .catch(() => {
        /* ignore warm-up errors until the user searches */
      });
  }

  window.addEventListener("offline", () => {
    const hint = root.querySelector("[data-search-offline-hint]");
    if (hint) hint.textContent = labels.offline;
  });
  return { root, search };
}

function validateToolInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("search_site input must be an object");
  }
  if (Object.keys(input).some((key) => !["query", "type", "source", "limit", "tags", "lang", "updated_after", "updated_before"].includes(key))) {
    throw new TypeError("Unknown search_site input field");
  }
  if (typeof input.query !== "string" || !input.query.trim() || input.query.length > MAX_QUERY_LENGTH) {
    throw new TypeError(`query must be a non-empty string of at most ${MAX_QUERY_LENGTH} characters`);
  }
  for (const [key, values] of [["type", DOC_TYPES], ["source", SOURCE_FACETS]]) {
    if (input[key] !== undefined && input[key] !== "" && !values.includes(input[key])) {
      throw new TypeError(`invalid ${key} filter`);
    }
  }
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RESULTS)) {
    throw new TypeError(`limit must be an integer between 1 and ${MAX_RESULTS}`);
  }
  if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.length > 10 ||
    input.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 64))) throw new TypeError("tags must be up to 10 non-empty strings, each at most 64 characters");
  if (input.lang !== undefined && (typeof input.lang !== "string" || input.lang.length > 35 ||
    (input.lang && !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(input.lang)))) throw new TypeError("Invalid language code");
  for (const name of ["updated_after", "updated_before"]) {
    const date = input[name];
    if (date !== undefined && (typeof date !== "string" || (date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)))) throw new TypeError(`Invalid ${name} date`);
  }
  if (input.updated_after && input.updated_before && input.updated_after > input.updated_before) throw new TypeError("Invalid updated date range");
  return { ...input, query: input.query.trim(), ...(input.tags ? { tags: input.tags.map((tag) => tag.trim()) } : {}) };
}

const mounts = [...document.querySelectorAll("[data-search]")].map(setup).filter(Boolean);
const enabledMounts = mounts.filter(({ root }) => root.getAttribute("data-webmcp") === "true");
// One tool per document, preferring the full search UI if a theme supplies both mounts.
const toolMount = enabledMounts.find(({ root }) => !root.classList.contains("search--header")) || enabledMounts[0];
if (toolMount && typeof document.modelContext?.registerTool === "function") {
  registerTool({
    name: "search_site",
    description: "Search this site's published content by keyword. Returns titles, heading URLs and excerpts, and displays the same results in the page's search UI. Filter by content type, source disclosure, tags, language or inclusive updated date range. Normalizes width, case and Japanese kana spelling.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: MAX_QUERY_LENGTH, description: "Keywords to search for in this site." },
        type: { type: "string", enum: ["", ...DOC_TYPES], description: "Content type; omit or use an empty string for all types." },
        source: { type: "string", enum: ["", ...SOURCE_FACETS], description: "Source disclosure filter; omit or use an empty string for all sources." },
        limit: { type: "integer", minimum: 1, maximum: MAX_RESULTS, default: TOP_K, description: "Maximum number of matching sections to return." },
        tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 64 }, maxItems: 10, description: "Require all these tags. Width, case and kana variants are normalized." },
        lang: { type: "string", maxLength: 35, description: "Exact language code, e.g. ja or en. Omit or use an empty string for all languages." },
        updated_after: { type: "string", description: "Inclusive earliest updated date, YYYY-MM-DD. Pages without dates are excluded." },
        updated_before: { type: "string", description: "Inclusive latest updated date, YYYY-MM-DD. Pages without dates are excluded." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, options) => toolMount.search(validateToolInput(input), options),
  });
  registerContentTools(toolMount.root);
}
