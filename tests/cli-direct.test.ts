import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuildCmd } from "../packages/cli/src/build.ts";
import { runIndexCmd } from "../packages/cli/src/index-cmd.ts";
import { parseSearchArgs, runSearchCmd } from "../packages/cli/src/search-cmd.ts";
import { buildSearchIndex } from "../packages/search/src/index.ts";

const MINIMAL = join(import.meta.dirname, "../examples/minimal");

async function buildHybridSearchFixture(): Promise<{ root: string }> {
  const root = mkdtempSync(join(tmpdir(), "sorane-search-cmd-"));
  const contentDir = join(root, "content");
  mkdirSync(contentDir, { recursive: true });
  writeFileSync(
    join(contentDir, "doc.md"),
    "---\ntype: article\ntitle: Hybrid Doc\n---\nSorane OKF hybrid search indexing body with enough text for chunking.\n",
    "utf8",
  );
  writeFileSync(
    join(root, "sorane.yaml"),
    "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\nsearch:\n  index: .sorane/index.db\n  model: vendor/models\n",
    "utf8",
  );
  const mockEmbeddings = {
    dimensions: 4,
    modelId: "test-model",
    quant: "q8",
    modelSha256: "",
    embed: async () => [1, 0, 0, 0],
    embedBatch: async (texts: string[]) => texts.map(() => [1, 0, 0, 0]),
  };
  await buildSearchIndex({
    contentDir,
    indexPath: join(root, ".sorane/index.db"),
    force: true,
    embeddings: mockEmbeddings,
  });
  return { root };
}

function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return Promise.resolve(fn()).then(
    () => {
      process.stdout.write = orig;
      return chunks.join("");
    },
    (err) => {
      process.stdout.write = orig;
      throw err;
    },
  );
}

describe("runBuildCmd", () => {
  test("一時サイトをビルドする", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-cli-direct-build-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "index.md"),
      "---\ntype: index\ntitle: Home\nprofile: sorane-okf/0.1\n---\n\nHi.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "sorane.yaml"),
      "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\n",
      "utf8",
    );
    try {
      const out = await captureStdout(() =>
        runBuildCmd(["--cwd", root, "--clean", "--skip-c2pa"]),
      );
      expect(out).toContain("built");
      expect(existsSync(join(root, "dist/index.html"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("parseSearchArgs", () => {
  test("フラグと index パスを解決", () => {
    const args = parseSearchArgs([
      "hello",
      "--cwd",
      MINIMAL,
      "--type",
      "article",
      "--tag",
      "okf",
      "--k",
      "5",
      "--json",
      "--fts-only",
    ]);
    expect(args.query).toBe("hello");
    expect(args.docType).toBe("article");
    expect(args.tag).toBe("okf");
    expect(args.k).toBe(5);
    expect(args.json).toBe(true);
    expect(args.ftsOnly).toBe(true);
    expect(args.indexPath.endsWith(".sorane/index.db")).toBe(true);
  });
});

describe("runSearchCmd", () => {
  test("JSON モードで結果を返す", async () => {
    if (!existsSync(join(MINIMAL, ".sorane/index.db"))) return;
    const out = await captureStdout(() =>
      runSearchCmd(["OKF", "--cwd", MINIMAL, "--fts-only", "--json"]),
    );
    const results = JSON.parse(out) as unknown[];
    expect(Array.isArray(results)).toBe(true);
  });

  test("テキストモードでスニペットを出す", async () => {
    if (!existsSync(join(MINIMAL, ".sorane/index.db"))) return;
    const out = await captureStdout(() =>
      runSearchCmd(["OKF", "--cwd", MINIMAL, "--fts-only", "--k", "3"]),
    );
    if (out.includes("(no results)")) return;
    expect(out).toContain("1.");
    expect(out).toContain("[");
  });

  test("query 無しは usage を stderr に出して exit 2", async () => {
    const errChunks: string[] = [];
    const origErr = process.stderr.write.bind(process.stderr);
    const origExit = process.exit;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as typeof process.exit;
    try {
      let threw = false;
      try {
        await runSearchCmd(["--cwd", MINIMAL, "--fts-only"]);
      } catch (e) {
        threw = e instanceof Error && e.message === "exit:2";
      }
      expect(threw).toBe(true);
      expect(errChunks.join("")).toContain("usage: sorane search");
    } finally {
      process.stderr.write = origErr;
      process.exit = origExit;
    }
  });

  test("該当無しは (no results)", async () => {
    if (!existsSync(join(MINIMAL, ".sorane/index.db"))) return;
    const out = await captureStdout(() =>
      runSearchCmd(["zzz-sorane-no-match-xyz", "--cwd", MINIMAL, "--fts-only"]),
    );
    expect(out).toContain("(no results)");
  });

  test("hybrid index でモデル無しは FTS-only フォールバック", async () => {
    const { root } = await buildHybridSearchFixture();
    const errChunks: string[] = [];
    const origErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      await captureStdout(() => runSearchCmd(["hybrid", "--cwd", root, "--json"]));
      expect(errChunks.join("")).toContain("model not found");
    } finally {
      process.stderr.write = origErr;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("hybrid index + 空 model dir は dim mismatch 警告", async () => {
    const { root } = await buildHybridSearchFixture();
    mkdirSync(join(root, "vendor/models/ruri-v3-30m"), { recursive: true });
    const errChunks: string[] = [];
    const origErr = process.stderr.write.bind(process.stderr);
    const prevEmbedNative = process.env.SORANE_EMBED_NATIVE;
    process.env.SORANE_EMBED_NATIVE = "0";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      let threw = false;
      try {
        await captureStdout(() => runSearchCmd(["hybrid", "--cwd", root, "--json"]));
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      const err = errChunks.join("");
      expect(err).toContain("warning:");
      expect(err).toContain("dim");
    } finally {
      process.stderr.write = origErr;
      if (prevEmbedNative === undefined) delete process.env.SORANE_EMBED_NATIVE;
      else process.env.SORANE_EMBED_NATIVE = prevEmbedNative;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("native embed when sorane-astro-backend is built", async (t) => {
    const { soraneNativeEmbedAvailable, nativeHybridModelAvailable } = await import(
      "../packages/cli/src/native-embed.ts"
    );
    const cwd = process.cwd();
    if (!soraneNativeEmbedAvailable(cwd)) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }
    const modelRoot = join(cwd, "vendor/models");
    if (!nativeHybridModelAvailable(modelRoot, "ruri-v3-30m")) {
      t.skip("hybrid model not fetched");
      return;
    }
    if (!existsSync(join(MINIMAL, ".sorane/index.db"))) {
      t.skip("minimal index missing");
      return;
    }

    const out = await captureStdout(() =>
      runSearchCmd(["sorane", "--cwd", MINIMAL, "--json", "--k", "1"]),
    );
    const rows = JSON.parse(out) as { title?: string }[];
    expect(rows.length > 0).toBe(true);
  });
});

describe("runIndexCmd", () => {
  test("native index when sorane-astro-backend is built", async (t) => {
    const { soraneNativeIndexAvailable } = await import("../packages/cli/src/native-index.ts");
    const cwd = process.cwd();
    if (!soraneNativeIndexAvailable(cwd)) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "sorane-cli-native-index-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "index.md"),
      "---\ntype: index\ntitle: Home\nprofile: sorane-okf/0.1\n---\n\nNative index path with enough body text to produce chunks.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "sorane.yaml"),
      "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\nsearch:\n  index: .sorane/native-index.db\n",
      "utf8",
    );
    try {
      const out = await captureStdout(() =>
        runIndexCmd(["--cwd", root, "--fts-only", "--force", "--out", ".sorane/native-index.db"]),
      );
      expect(out).toContain("indexed");
      expect(out).toContain("(native)");
      expect(existsSync(join(root, ".sorane/native-index.db"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("FTS-only で index する", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-cli-direct-index-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "index.md"),
      "---\ntype: index\ntitle: Home\nprofile: sorane-okf/0.1\n---\n\nSearchable text here.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "sorane.yaml"),
      "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\nsearch:\n  index: .sorane/test-index.db\n",
      "utf8",
    );
    try {
      const out = await captureStdout(() =>
        runIndexCmd(["--cwd", root, "--fts-only", "--force", "--out", ".sorane/test-index.db"]),
      );
      expect(out).toContain("indexed");
      expect(existsSync(join(root, ".sorane/test-index.db"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("hybrid でモデル無しは FTS-only にフォールバック", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-cli-hybrid-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "index.md"),
      "---\ntype: index\ntitle: Home\nprofile: sorane-okf/0.1\n---\n\nBody.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "sorane.yaml"),
      "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\nsearch:\n  mode: hybrid\n  index: .sorane/hybrid.db\n  model: vendor/models\n",
      "utf8",
    );
    const errChunks: string[] = [];
    const origErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errChunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      const out = await captureStdout(() => runIndexCmd(["--cwd", root, "--force", "--hybrid"]));
      expect(out).toContain("indexed");
      expect(out.includes("[fts-only]") || out.includes("fts-only")).toBe(true);
      expect(errChunks.join("")).toContain("model not found");
    } finally {
      process.stderr.write = origErr;
      rmSync(root, { recursive: true, force: true });
    }
  });
});