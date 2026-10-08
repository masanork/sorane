import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "./_expect.ts";
import { runBuildCmd } from "../packages/cli/src/build.ts";
import { runIndexCmd } from "../packages/cli/src/index-cmd.ts";
import { parseSearchArgs, runSearchCmd } from "../packages/cli/src/search-cmd.ts";

const MINIMAL = join(import.meta.dirname, "../examples/minimal");

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

async function withSearchSite(fn: (root: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "sorane-cli-direct-search-"));
  try {
    mkdirSync(join(root, "content"));
    writeFileSync(join(root, "content", "guide.md"),
      "---\ntype: article\ntitle: Hello search guide\ntags: [okf]\n---\n\n## Introduction\n\n" +
      "OKF searchable guide content with a meaningful result snippet. ".repeat(4));
    writeFileSync(join(root, "sorane.yaml"),
      "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\n");
    await captureStdout(() => runIndexCmd(["--cwd", root, "--force"]));
    await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    ]);
    expect(args.query).toBe("hello");
    expect(args.docType).toBe("article");
    expect(args.tag).toBe("okf");
    expect(args.k).toBe(5);
    expect(args.json).toBe(true);
    expect(args.backend.path.endsWith(".sorane/index.db")).toBe(true);
  });
});

describe("runSearchCmd", () => {
  test("JSON モードで結果を返す", async () => {
    await withSearchSite(async (root) => {
      const out = await captureStdout(() =>
        runSearchCmd(["OKF", "--cwd", root, "--json"]),
      );
      const results = JSON.parse(out) as { source: string; title: string; backend: string; snippet: string }[];
      expect(results.length > 0).toBe(true);
      expect(results[0]!.source).toBe("guide.md");
      expect(results[0]!.title).toBe("Hello search guide");
      expect(results[0]!.backend).toBe("index");
      expect(results[0]!.snippet).toContain("searchable guide");
    });
  });

  test("テキストモードでスニペットを出す", async () => {
    await withSearchSite(async (root) => {
      const out = await captureStdout(() =>
        runSearchCmd(["OKF", "--cwd", root, "--k", "3"]),
      );
      expect(out).toContain("1.");
      expect(out).toContain("[");
      expect(out).toContain("Hello search guide");
      expect(out).toContain("searchable guide");
    });
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
        await runSearchCmd(["--cwd", MINIMAL]);
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
    await withSearchSite(async (root) => {
      const out = await captureStdout(() =>
        runSearchCmd(["zzz-sorane-no-match-xyz", "--cwd", root]),
      );
      expect(out).toContain("(no results)");
    });
  });
});

describe("runIndexCmd", () => {
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
      "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\n",
      "utf8",
    );
    try {
      const out = await captureStdout(() =>
        runIndexCmd(["--cwd", root, "--force", "--index", ".sorane/test-index.db"]),
      );
      expect(out).toContain("indexed");
      expect(existsSync(join(root, ".sorane/test-index.db"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("index は FTS で構築する", async () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-cli-fts-"));
    mkdirSync(join(root, "content"), { recursive: true });
    writeFileSync(
      join(root, "content", "index.md"),
      "---\ntype: index\ntitle: Home\nprofile: sorane-okf/0.1\n---\n\nBody.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "sorane.yaml"),
      "site:\n  title: T\n  description: d\n  lang: ja\nbuild:\n  content_dir: content\n  out_dir: dist\nsearch:\n  index: .sorane/fts.db\n",
      "utf8",
    );
    try {
      const out = await captureStdout(() => runIndexCmd(["--cwd", root, "--force"]));
      expect(out).toContain("indexed");
      expect(out).toContain("[fts]");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
