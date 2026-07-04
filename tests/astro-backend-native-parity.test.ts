import { gunzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "./_expect.ts";
import {
  decodeInt8VectorsB64,
  minCosineSimilarity,
} from "../packages/search/src/int8-encode.ts";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  runSoraneAstroTsBackend,
  soraneAstroNativeCliAvailable,
} from "../packages/astro/src/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function repoHybridModelRoot(): string | null {
  const onnx = join(REPO_ROOT, "vendor/models/ruri-v3-30m/onnx/model_quantized.onnx");
  const tokenizer = join(REPO_ROOT, "vendor/models/ruri-v3-30m/tokenizer.json");
  if (!existsSync(onnx) || !existsSync(tokenizer)) return null;
  return join(REPO_ROOT, "vendor/models");
}

function parityFixture(): ReturnType<typeof buildSoraneAstroBackendInput> {
  const root = mkdtempSync(join(tmpdir(), "sorane-astro-native-parity-"));
  const contentDir = join(root, "src", "content");
  const posts = join(contentDir, "posts");
  mkdirSync(posts, { recursive: true });
  writeFileSync(
    join(posts, "hello.md"),
    `---
type: article
title: Parity Hello
description: parity test
timestamp: 2026-07-04T00:00:00Z
profile: sorane-okf/0.2
digitalSourceType: trainedAlgorithmicMedia
---

# Hello
`,
  );
  const paths = { root, contentDir, outDir: join(root, "dist") };
  const files = collectSoraneAstroBackendFiles(contentDir);
  return buildSoraneAstroBackendInput(
    {
      site: { title: "Parity", description: "parity", baseUrl: "https://example.dev" },
      collections: { posts: "blog" },
      validate: false,
    },
    paths,
    files,
  );
}

/** Must match hybrid embedding SLA in design/astro-rust-backend.md */
export const HYBRID_MIN_COSINE = 0.99;

function normalizeSearchIndex(content: string): string {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  delete parsed.built_at;
  if (parsed.mode === "hybrid" && parsed.embeddings && typeof parsed.embeddings === "object") {
    const { vectors_b64: _omit, ...restEmb } = parsed.embeddings as Record<string, unknown>;
    parsed.embeddings = restEmb;
  }
  return JSON.stringify(parsed);
}

function hybridEmbeddingMinCosine(tsContent: string, nativeContent: string): number {
  const ts = JSON.parse(tsContent) as {
    embeddings?: { dim?: number; vectors_b64?: string };
  };
  const nat = JSON.parse(nativeContent) as {
    embeddings?: { dim?: number; vectors_b64?: string };
  };
  const dim = ts.embeddings?.dim ?? nat.embeddings?.dim ?? 256;
  const tsB64 = ts.embeddings?.vectors_b64 ?? "";
  const natB64 = nat.embeddings?.vectors_b64 ?? "";
  if (!tsB64 || !natB64) return 0;
  return minCosineSimilarity(
    decodeInt8VectorsB64(tsB64, dim),
    decodeInt8VectorsB64(natB64, dim),
  );
}

function artifactContentEqual(
  path: string,
  tsContent: string,
  nativeContent: string,
): boolean {
  if (path === "okf/bundle.tar.gz") {
    const tsTar = gunzipSync(Buffer.from(tsContent, "base64"));
    const nativeTar = gunzipSync(Buffer.from(nativeContent, "base64"));
    return tsTar.equals(nativeTar);
  }
  if (path === "assets/search-index.json") {
    return normalizeSearchIndex(tsContent) === normalizeSearchIndex(nativeContent);
  }
  return tsContent === nativeContent;
}

describe("Astro native backend parity", () => {
  test("native Rust output matches inline TypeScript backend", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = parityFixture();
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

      expect(native.concepts).toBe(ts.concepts);
      expect(native.validationErrors).toBe(ts.validationErrors);
      expect(native.validationWarnings).toBe(ts.validationWarnings);
      expect(native.artifacts.length).toBe(ts.artifacts.length);

      for (const tsArtifact of ts.artifacts) {
        const nativeArtifact = native.artifacts.find((a) => a.path === tsArtifact.path);
        expect(nativeArtifact !== undefined).toBe(true);
        expect(nativeArtifact?.kind).toBe(tsArtifact.kind);
        expect(
          artifactContentEqual(
            tsArtifact.path,
            tsArtifact.content,
            nativeArtifact?.content ?? "",
          ),
        ).toBe(true);
      }
  });

  test("native FTS search index matches TypeScript backend", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-native-search-"));
    const contentDir = join(root, "src", "content");
    const posts = join(contentDir, "posts");
    mkdirSync(posts, { recursive: true });
    writeFileSync(
      join(posts, "findme.md"),
      `---
type: article
title: Find Me
description: native search parity
timestamp: 2026-07-04T00:00:00Z
digitalSourceType: humanEdits
---

# Find Me

This article has enough body text to produce at least one search chunk when
indexed in FTS mode for native and TypeScript backend parity comparison.
`,
    );
    const paths = { root, contentDir, outDir: join(root, "dist") };
    const files = collectSoraneAstroBackendFiles(contentDir);
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "Parity", description: "parity", baseUrl: "https://example.dev" },
        collections: { posts: "blog" },
        validate: false,
        outputs: {
          catalog: false,
          llmsTxt: false,
          okfBundle: false,
          search: true,
        },
        search: { force: true, mode: "fts" },
      },
      paths,
      files,
    );

    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    const tsArtifact = ts.artifacts.find((a) => a.path === "assets/search-index.json");
    const nativeArtifact = native.artifacts.find((a) => a.path === "assets/search-index.json");
    expect(tsArtifact !== undefined).toBe(true);
    expect(nativeArtifact !== undefined).toBe(true);
    expect(
      artifactContentEqual(
        "assets/search-index.json",
        tsArtifact?.content ?? "",
        nativeArtifact?.content ?? "",
      ),
    ).toBe(true);
  });

  test("native hybrid without model falls back to FTS search index", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-native-hybrid-fallback-"));
    const contentDir = join(root, "src", "content");
    const posts = join(contentDir, "posts");
    mkdirSync(posts, { recursive: true });
    writeFileSync(
      join(posts, "findme.md"),
      `---
type: article
title: Find Me
description: hybrid fallback
timestamp: 2026-07-04T00:00:00Z
---

# Find Me

This article has enough body text to produce at least one search chunk when
indexed in FTS-only fallback mode without a hybrid embedding model directory.
`,
    );
    const paths = { root, contentDir, outDir: join(root, "dist") };
    const files = collectSoraneAstroBackendFiles(contentDir);
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "Parity", description: "parity" },
        collections: { posts: "blog" },
        validate: false,
        outputs: {
          catalog: false,
          llmsTxt: false,
          okfBundle: false,
          search: true,
        },
        search: { mode: "hybrid", force: true, modelRoot: "vendor/missing-models" },
      },
      paths,
      files,
    );

    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    const tsArtifact = ts.artifacts.find((a) => a.path === "assets/search-index.json");
    const nativeArtifact = native.artifacts.find((a) => a.path === "assets/search-index.json");
    expect(tsArtifact !== undefined).toBe(true);
    expect(nativeArtifact !== undefined).toBe(true);
    const tsIndex = JSON.parse(tsArtifact?.content ?? "{}") as { mode?: string };
    const nativeIndex = JSON.parse(nativeArtifact?.content ?? "{}") as { mode?: string };
    expect(tsIndex.mode).toBe("fts");
    expect(nativeIndex.mode).toBe("fts");
    expect(
      artifactContentEqual(
        "assets/search-index.json",
        tsArtifact?.content ?? "",
        nativeArtifact?.content ?? "",
      ),
    ).toBe(true);
  });

  test("native hybrid search index matches TypeScript backend", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }
    const modelRoot = repoHybridModelRoot();
    if (modelRoot === null) {
      t.skip("vendor/models not present (run npm run fetch-model)");
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-native-hybrid-"));
    const contentDir = join(root, "src", "content");
    const posts = join(contentDir, "posts");
    mkdirSync(posts, { recursive: true });
    writeFileSync(
      join(posts, "findme.md"),
      `---
type: article
title: Find Me
description: hybrid search parity
timestamp: 2026-07-04T00:00:00Z
digitalSourceType: humanEdits
---

# Find Me

This article has enough body text to produce at least one search chunk when
indexed in hybrid mode for native and TypeScript backend parity comparison.
`,
    );
    const paths = { root, contentDir, outDir: join(root, "dist") };
    const files = collectSoraneAstroBackendFiles(contentDir);
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "Parity", description: "parity", baseUrl: "https://example.dev" },
        collections: { posts: "blog" },
        validate: false,
        outputs: {
          catalog: false,
          llmsTxt: false,
          okfBundle: false,
          search: true,
        },
        search: { mode: "hybrid", force: true, modelRoot, modelId: "ruri-v3-30m" },
      },
      paths,
      files,
    );

    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    const tsArtifact = ts.artifacts.find((a) => a.path === "assets/search-index.json");
    const nativeArtifact = native.artifacts.find((a) => a.path === "assets/search-index.json");
    expect(tsArtifact !== undefined).toBe(true);
    expect(nativeArtifact !== undefined).toBe(true);
    const tsIndex = JSON.parse(tsArtifact?.content ?? "{}") as { mode?: string };
    const nativeIndex = JSON.parse(nativeArtifact?.content ?? "{}") as { mode?: string };
    expect(tsIndex.mode).toBe("hybrid");
    expect(nativeIndex.mode).toBe("hybrid");
    expect(
      artifactContentEqual(
        "assets/search-index.json",
        tsArtifact?.content ?? "",
        nativeArtifact?.content ?? "",
      ),
    ).toBe(true);
    const tsIndexFull = JSON.parse(tsArtifact?.content ?? "{}") as {
      embeddings?: { vectors_b64?: string };
    };
    const nativeIndexFull = JSON.parse(nativeArtifact?.content ?? "{}") as {
      embeddings?: { vectors_b64?: string };
    };
    expect(tsIndexFull.embeddings?.vectors_b64).toBe(nativeIndexFull.embeddings?.vectors_b64);

    const minCosine = hybridEmbeddingMinCosine(
      tsArtifact?.content ?? "",
      nativeArtifact?.content ?? "",
    );
    expect(minCosine >= HYBRID_MIN_COSINE).toBe(true);
  });

  test("native hybrid int8 vectors match on multi-chunk document", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }
    const modelRoot = repoHybridModelRoot();
    if (modelRoot === null) {
      t.skip("vendor/models not present (run npm run fetch-model)");
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-native-hybrid-multi-"));
    const contentDir = join(root, "src", "content");
    const posts = join(contentDir, "posts");
    mkdirSync(posts, { recursive: true });
    const body =
      "Opening section with enough words to produce the first hybrid search chunk reliably. ".repeat(
        6,
      ) +
      "\n\n## Second Section\n\n" +
      "Follow-up section body with sufficient length for a second indexed chunk in parity tests. ".repeat(
        6,
      );
    writeFileSync(
      join(posts, "multi.md"),
      `---
type: article
title: Multi Chunk
description: int8 parity
timestamp: 2026-07-04T00:00:00Z
---

${body}
`,
    );
    const paths = { root, contentDir, outDir: join(root, "dist") };
    const files = collectSoraneAstroBackendFiles(contentDir);
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "Parity", description: "parity", baseUrl: "https://example.dev" },
        collections: { posts: "blog" },
        validate: false,
        outputs: {
          catalog: false,
          llmsTxt: false,
          okfBundle: false,
          search: true,
        },
        search: { mode: "hybrid", force: true, modelRoot, modelId: "ruri-v3-30m" },
      },
      paths,
      files,
    );

    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    const tsArtifact = ts.artifacts.find((a) => a.path === "assets/search-index.json");
    const nativeArtifact = native.artifacts.find((a) => a.path === "assets/search-index.json");
    const tsIndex = JSON.parse(tsArtifact?.content ?? "{}") as {
      chunks?: unknown[];
      embeddings?: { vectors_b64?: string };
    };
    const nativeIndex = JSON.parse(nativeArtifact?.content ?? "{}") as {
      chunks?: unknown[];
      embeddings?: { vectors_b64?: string };
    };
    expect((tsIndex.chunks?.length ?? 0) >= 2).toBe(true);
    expect(tsIndex.chunks?.length).toBe(nativeIndex.chunks?.length);
    expect(tsIndex.embeddings?.vectors_b64).toBe(nativeIndex.embeddings?.vectors_b64);
  });
});