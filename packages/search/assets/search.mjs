// Browser-side vector search (sorane SSG).
//
// Mount: <div data-search data-index=".../assets/search-index.json"
//             data-model-base=".../models/" data-lib-base=".../assets/search/lib/">

const MODEL_ID = "ruri-v3-30m";
const QUERY_PREFIX = "検索クエリ: ";
const TOP_K = 10;

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

function setup(root) {
  const form = root.querySelector(".search-form");
  const input = root.querySelector(".search-input");
  const facet = root.querySelector(".search-facet");
  const status = root.querySelector("[data-search-status]");
  const resultsEl = root.querySelector("[data-search-results]");
  const indexUrl = root.getAttribute("data-index");
  const modelBase = root.getAttribute("data-model-base");
  const libBase = root.getAttribute("data-lib-base");
  if (!form || !input || !indexUrl) return;

  let index = null;
  let embed = null;
  let busy = false;

  const setStatus = (msg) => {
    if (status) status.textContent = msg;
  };

  async function loadIndex() {
    if (index) return index;
    setStatus("検索インデックスを読み込み中…");
    const res = await fetch(indexUrl);
    if (!res.ok) throw new Error(`failed to fetch search-index.json (${res.status})`);
    const json = await res.json();
    const dim = json.embeddings.dim;
    index = { ...json, vectors: decodeVectors(json.embeddings.vectors_b64, dim) };
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

  function render(hits) {
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
      meta.textContent = `${chunk.doc_type || "-"} · ${chunk.source} · ${score.toFixed(3)}`;
      li.appendChild(meta);

      if (chunk.snippet) {
        const snip = document.createElement("p");
        snip.className = "search-hit-snippet";
        snip.textContent = chunk.snippet;
        li.appendChild(snip);
      }
      resultsEl.appendChild(li);
    }
  }

  async function run(query) {
    if (busy || !query.trim()) return;
    busy = true;
    try {
      const idx = await loadIndex();
      const e = await loadEmbedder();
      setStatus("検索中…");
      const qv = await e(query);
      const type = facet ? facet.value : "";
      const allow = type ? (i) => idx.chunks[i].doc_type === type : null;
      const ranked = topK(qv, idx.vectors, idx.embeddings.dim, TOP_K, allow);
      const scale = idx.embeddings.scale || 1;
      render(ranked.map((r) => ({ chunk: idx.chunks[r.index], score: r.score / scale })));
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