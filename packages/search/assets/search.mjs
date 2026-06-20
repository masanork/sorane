// Browser-side search (sorane SSG).
//
// FTS mount:  <div data-search data-mode="fts" data-index=".../assets/search-index.json">
// Hybrid:     + data-model-base, data-lib-base

const MODEL_ID = "ruri-v3-30m";
const QUERY_PREFIX = "検索クエリ: ";
const TOP_K = 10;

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

function ftsSearch(index, query, type, k = TOP_K) {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];
  const hits = [];
  for (let i = 0; i < index.chunks.length; i++) {
    const chunk = index.chunks[i];
    if (type && chunk.doc_type !== type) continue;
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

function setup(root) {
  const form = root.querySelector(".search-form");
  const input = root.querySelector(".search-input");
  const facet = root.querySelector(".search-facet");
  const status = root.querySelector("[data-search-status]");
  const resultsEl = root.querySelector("[data-search-results]");
  const indexUrl = root.getAttribute("data-index");
  const mode = root.getAttribute("data-mode") || "fts";
  const modelBase = root.getAttribute("data-model-base");
  const libBase = root.getAttribute("data-lib-base");
  const compact = root.classList.contains("search--header");
  if (!form || !input || !indexUrl) return;

  let index = null;
  let embed = null;
  let busy = false;

  const setStatus = (msg) => {
    if (compact || !status) return;
    status.textContent = msg;
  };

  async function loadIndex() {
    if (index) return index;
    setStatus("検索インデックスを読み込み中…");
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

  async function loadEmbedder() {
    if (embed) return embed;
    setStatus("埋め込みモデルを読み込み中…（初回のみ）");
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
      setStatus("該当なし。語を変えてお試しください。");
      return;
    }
    setStatus(`${hits.length} 件`);
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
    setStatus("検索中…");
    const type = facet ? facet.value : "";
    const ranked = ftsSearch(idx, query, type);
    render(
      ranked.map((r) => ({ chunk: r.chunk, score: r.score })),
      query,
    );
  }

  async function runHybrid(query) {
    const idx = await loadIndex();
    const e = await loadEmbedder();
    setStatus("検索中…");
    const qv = await e(query);
    const type = facet ? facet.value : "";
    const allow = type ? (i) => idx.chunks[i].doc_type === type : null;
    const ranked = topK(qv, idx.vectors, idx.embeddings.dim, TOP_K, allow);
    const scale = idx.embeddings.scale || 1;
    render(
      ranked.map((r) => ({ chunk: idx.chunks[r.index], score: r.score / scale })),
      query,
    );
  }

  async function run(query) {
    if (busy || !query.trim()) return;
    busy = true;
    try {
      const idx = await loadIndex();
      const useHybrid = (idx.mode || mode) === "hybrid";
      if (useHybrid) await runHybrid(query);
      else await runFts(query);
    } catch (err) {
      setStatus(`エラー: ${err && err.message ? err.message : err}`);
    } finally {
      busy = false;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(input.value);
  });
}

for (const root of document.querySelectorAll("[data-search]")) setup(root);