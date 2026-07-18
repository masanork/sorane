// Browser-side search (sorane SSG).
//
// FTS mount:  <div data-search data-mode="fts" data-index=".../assets/search-index.json">
// Hybrid:     + data-model-base, data-lib-base

const MODEL_ID = "ruri-v3-30m";

function sanitizeSvgMarkup(svg) {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const QUERY_PREFIX = "検索クエリ: ";
const TOP_K = 10;

const LABELS = {
  ja: {
    loadingIndex: "検索インデックスを読み込み中…",
    loadingModel: "埋め込みモデルを読み込み中…（初回のみ）",
    searching: "検索中…",
    noResults: "該当するページは見つかりませんでした。キーワードを変えてお試しください。",
    emptyQuery: "検索キーワードを入力してください。",
    resultCount: (n) => `${n} 件`,
    error: (msg) => `エラー: ${msg}`,
  },
  en: {
    loadingIndex: "Loading search index…",
    loadingModel: "Loading embedding model… (first time only)",
    searching: "Searching…",
    noResults: "No matching pages. Try different keywords.",
    emptyQuery: "Enter a search keyword.",
    resultCount: (n) => `${n} result${n === 1 ? "" : "s"}`,
    error: (msg) => `Error: ${msg}`,
  },
};

function labelsFor(lang) {
  return lang && lang.startsWith("ja") ? LABELS.ja : LABELS.en;
}

function tokenizeQuery(query) {
  const segs = query
    .split(/[぀-ゟ]+|[\s、。・，．:：;；!！?？()（）「」『』【】\[\]]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  if (segs.length === 0) {
    const flat = query.trim();
    return flat.length >= 1 ? [flat] : [];
  }
  return segs;
}

function decodeVectors(b64, dim) {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  const i8 = new Int8Array(buf.buffer);
  if (i8.length % dim !== 0) throw new Error(`vector length ${i8.length} is not a multiple of dim ${dim}`);
  return i8;
}

function topK(query, vectors, dim, k, allow) {
  const n = vectors.length / dim;
  const heap = [];
  for (let i = 0; i < n; i++) {
    if (allow && !allow(i)) continue;
    let s = 0;
    const off = i * dim;
    for (let j = 0; j < dim; j++) s += query[j] * vectors[off + j];
    if (heap.length < k) {
      heap.push({ index: i, score: s });
      heap.sort((a, b) => a.score - b.score);
    } else if (s > heap[0].score) {
      heap[0] = { index: i, score: s };
      heap.sort((a, b) => a.score - b.score);
    }
  }
  return heap.sort((a, b) => b.score - a.score);
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

function ftsSearch(index, query, type, source, k = TOP_K) {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];
  const hits = [];
  for (let i = 0; i < index.chunks.length; i++) {
    const chunk = index.chunks[i];
    if (type && chunk.doc_type !== type) continue;
    if (!matchesSourceFacet(chunk.digital_source_type, source)) continue;
    const hay = [
      chunk.text || "",
      chunk.title || "",
      chunk.heading_path || "",
      chunk.tags || "",
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const term of terms) {
      const needle = term.toLowerCase();
      if (hay.includes(needle)) score += 1;
      if ((chunk.title || "").toLowerCase().includes(needle)) score += 2;
      if ((chunk.heading_path || "").toLowerCase().includes(needle)) score += 1;
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

function showEmptyState(resultsEl, root, message, labels) {
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
  const mode = root.getAttribute("data-mode") || "fts";
  const modelBase = root.getAttribute("data-model-base");
  const libBase = root.getAttribute("data-lib-base");
  const labels = labelsFor(root.getAttribute("data-lang"));
  if (!form || !input || !indexUrl || !resultsEl) return;

  let index = null;
  let embed = null;
  let busy = false;

  const setStatus = (msg) => {
    if (!status) return;
    status.textContent = msg;
  };

  async function loadIndex() {
    if (index) return index;
    setStatus(labels.loadingIndex);
    const res = await fetch(indexUrl);
    if (!res.ok) throw new Error(`failed to fetch search-index.json (${res.status})`);
    const json = await res.json();
    const resolvedMode = json.mode === "hybrid" && json.embeddings ? "hybrid" : "fts";
    if (resolvedMode === "hybrid") {
      const dim = json.embeddings.dim;
      index = { ...json, mode: "hybrid", vectors: decodeVectors(json.embeddings.vectors_b64, dim) };
    } else {
      index = { ...json, mode: "fts" };
    }
    return index;
  }

  async function verifyModelSha(modelSha) {
    if (!modelSha || !modelBase) return;
    const onnxUrl = new URL(`${MODEL_ID}/onnx/model_quantized.onnx`, modelBase).href;
    const res = await fetch(onnxUrl);
    if (!res.ok) throw new Error(`model fetch failed (${res.status})`);
    const buf = await res.arrayBuffer();
    const actual = await sha256Hex(buf);
    if (actual !== modelSha) {
      throw new Error(`model SHA-256 mismatch (expected ${modelSha.slice(0, 12)}…)`);
    }
  }

  async function loadEmbedder() {
    if (embed) return embed;
    setStatus(labels.loadingModel);
    if (index?.model?.sha256) {
      await verifyModelSha(index.model.sha256);
    }
    const libUrl = new URL(libBase, document.baseURI).href;
    const tjs = await import(`${libUrl}transformers.web.js`);
    const { env, pipeline } = tjs;
    env.useBrowserCache = false;
    const isRemoteBase = /^https?:\/\//i.test(modelBase || "");
    if (isRemoteBase) {
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.remoteHost = modelBase;
      env.remotePathTemplate = "{model}/";
    } else {
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = modelBase;
    }
    const onnxWasm = env.backends?.onnx?.wasm;
    if (onnxWasm) onnxWasm.wasmPaths = libUrl;
    const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
    embed = async (query) => {
      const out = await extractor(QUERY_PREFIX + query, { pooling: "mean", normalize: true });
      return new Float32Array(out.data);
    };
    return embed;
  }

  function render(hits, query) {
    resultsEl.replaceChildren();
    if (hits.length === 0) {
      showEmptyState(resultsEl, root, labels.noResults, labels);
      setStatus(labels.noResults);
      return;
    }
    root.setAttribute("aria-expanded", "true");
    setStatus(labels.resultCount(hits.length));
    for (const { chunk, score } of hits) {
      const li = document.createElement("li");
      li.className = "search-hit";

      const a = document.createElement("a");
      a.className = "search-hit-title";
      const anchor = chunk.heading_slug ? `#${chunk.heading_slug}` : "";
      a.href = `${chunk.url || chunk.source.replace(/\.md$/i, ".html")}${anchor}`;
      a.textContent = chunk.heading_path || chunk.title || chunk.source;
      li.appendChild(a);

      const meta = document.createElement("p");
      meta.className = "search-hit-meta";
      const scoreLabel = typeof score === "number" && score % 1 !== 0 ? score.toFixed(3) : String(score);
      meta.textContent = `${chunk.doc_type || "-"} · ${chunk.source} · ${scoreLabel}`;
      li.appendChild(meta);

      const snippet = chunk.snippet || (chunk.text ? makeSnippet(chunk.text, query) : "");
      if (snippet) {
        const snip = document.createElement("p");
        snip.className = "search-hit-snippet";
        snip.textContent = snippet;
        li.appendChild(snip);
      }
      resultsEl.appendChild(li);
    }
  }

  async function runFts(query) {
    const idx = await loadIndex();
    setStatus(labels.searching);
    const type = facet ? facet.value : "";
    const source = sourceFacet ? sourceFacet.value : "";
    const ranked = ftsSearch(idx, query, type, source);
    render(
      ranked.map((r) => ({ chunk: r.chunk, score: r.score })),
      query,
    );
  }

  async function runHybrid(query) {
    const idx = await loadIndex();
    const e = await loadEmbedder();
    setStatus(labels.searching);
    const qv = await e(query);
    const type = facet ? facet.value : "";
    const source = sourceFacet ? sourceFacet.value : "";
    const allow = (i) => {
      const chunk = idx.chunks[i];
      if (type && chunk.doc_type !== type) return false;
      if (!matchesSourceFacet(chunk.digital_source_type, source)) return false;
      return true;
    };
    const ranked = topK(qv, idx.vectors, idx.embeddings.dim, TOP_K, allow);
    const scale = idx.embeddings.scale || 1;
    render(
      ranked.map((r) => ({ chunk: idx.chunks[r.index], score: r.score / scale })),
      query,
    );
  }

  async function run(query) {
    const trimmed = query.trim();
    if (!trimmed) {
      showEmptyState(resultsEl, root, labels.emptyQuery, labels);
      setStatus(labels.emptyQuery);
      return;
    }
    if (busy) return;
    busy = true;
    root.setAttribute("aria-busy", "true");
    try {
      const idx = await loadIndex();
      const useHybrid = (idx.mode || mode) === "hybrid";
      if (useHybrid) await runHybrid(trimmed);
      else await runFts(trimmed);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      showEmptyState(resultsEl, root, labels.error(message), labels);
      setStatus(labels.error(message));
    } finally {
      root.removeAttribute("aria-busy");
      busy = false;
    }
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
  }
}

for (const root of document.querySelectorAll("[data-search]")) setup(root);