import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  buildSoraneAstroBackendInput,
  collectSoraneAstroBackendFiles,
  runSoraneAstroTsBackend,
  soraneAstroNativeCliAvailable,
} from "../packages/astro/src/index.ts";

function validationInput(files: Record<string, string>): ReturnType<typeof buildSoraneAstroBackendInput> {
  const root = mkdtempSync(join(tmpdir(), "sorane-astro-val-parity-"));
  const contentDir = join(root, "src", "content");
  mkdirSync(contentDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(contentDir, name), body);
  }
  const paths = { root, contentDir, outDir: join(root, "dist") };
  return buildSoraneAstroBackendInput(
    {
      site: { title: "Val", description: "parity", baseUrl: "https://example.dev" },
      validate: "warn",
    },
    paths,
    collectSoraneAstroBackendFiles(contentDir),
  );
}

describe("Astro backend validation parity (Phase A)", () => {
  test("native validation counts match TypeScript for OKF type error", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "bad-type.md": `---
type: playbook
title: Bad
timestamp: 2026-07-04T00:00:00Z
---

body
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(ts.validationErrors > 0).toBe(true);
    expect(native.validationErrors > 0).toBe(true);
    expect(
      ts.validationDetails.some((d) => d.includes("未サポートの type: playbook")),
    ).toBe(true);
    expect(
      native.validationDetails.some((d) => d.includes("未サポートの type: playbook")),
    ).toBe(true);
  });

  test("native validation counts match TypeScript for image alt warning", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "img.md": `---
type: article
title: Img
timestamp: 2026-07-04T00:00:00Z
---

![](photo.png)
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });

  test("native validation counts match TypeScript for FAQ structure", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "faq.md": `---
type: faq
title: FAQ
timestamp: 2026-07-04T00:00:00Z
profile: sorane-okf/0.3
---

Just text.
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });

  test("native validation counts match TypeScript for glossary structure", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "glossary.md": `---
type: glossary
title: Glossary
timestamp: 2026-07-04T00:00:00Z
profile: sorane-okf/0.3
---

Intro only.
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });

  test("native validation counts match TypeScript for directory index hint", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-val-parity-dir-"));
    const posts = join(root, "src", "content", "posts");
    mkdirSync(posts, { recursive: true });
    const article = `---
type: article
title: Post
timestamp: 2026-07-04T00:00:00Z
profile: sorane-okf/0.3
---

body
`;
    writeFileSync(join(posts, "a.md"), article);
    writeFileSync(join(posts, "b.md"), article.replace("Post", "Post B"));
    const paths = { root, contentDir: join(root, "src", "content"), outDir: join(root, "dist") };
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "Val", description: "parity", baseUrl: "https://example.dev" },
        validate: "warn",
      },
      paths,
      collectSoraneAstroBackendFiles(paths.contentDir),
    );
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
    expect(native.validationDetails.some((d) => d.includes("posts/"))).toBe(true);
  });

  test("native validation counts match TypeScript for heading skip", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "head.md": `---
type: article
title: Head
timestamp: 2026-07-04T00:00:00Z
---

#### skipped
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });
});

describe("Astro backend validation parity (Phase C)", () => {
  test("native validation counts match TypeScript for reference structure", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "api.md": `---
type: reference
title: API
profile: sorane-okf/0.3
---

No table here.
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings > 0).toBe(true);
  });

  test("native validation counts match TypeScript for dataset license", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "data.md": `---
type: dataset
title: D
description: Demo dataset
resource: https://ex.dev/d
license: Weird
profile: sorane-okf/0.3
publisher:
  name: Org
distributions:
  - title: CSV
    format: csv
    accessURL: https://ex.dev/a.csv
---

Body.
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });

  test("native validation counts match TypeScript for lang mixing", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "sorane-astro-val-parity-lang-"));
    const contentDir = join(root, "src", "content");
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(
      join(contentDir, "mix.md"),
      `---
type: article
title: Mix
timestamp: 2026-07-04T00:00:00Z
profile: sorane-okf/0.3
---

database サーバーの説明です。
`,
    );
    const paths = { root, contentDir, outDir: join(root, "dist") };
    const input = buildSoraneAstroBackendInput(
      {
        site: { title: "Val", description: "parity", baseUrl: "https://example.dev", lang: "ja" },
        validate: "warn",
      },
      paths,
      collectSoraneAstroBackendFiles(contentDir),
    );
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });

  test("native validation counts match TypeScript for unresolved term link", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "article.md": `---
type: article
title: Article
timestamp: 2026-07-04T00:00:00Z
profile: sorane-okf/0.3
---

See [[term:missing-id]].
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });

  test("native validation counts match TypeScript for revision structure", async (t) => {
    if (!soraneAstroNativeCliAvailable()) {
      t.skip("sorane-astro-backend native binary not built");
      return;
    }

    const input = validationInput({
      "rev.md": `---
type: article
title: Rev
timestamp: 2026-07-04T00:00:00Z
profile: sorane-okf/0.3
revisions:
  - summary: note only
---

body
`,
    });
    const ts = await runSoraneAstroTsBackend(input);
    const { runSoraneAstroCliBackend } = await import("../packages/astro/src/backend-cli.ts");
    const native = runSoraneAstroCliBackend(input);

    expect(native.validationErrors).toBe(ts.validationErrors);
    expect(native.validationWarnings).toBe(ts.validationWarnings);
    expect(native.validationWarnings).toBe(1);
  });
});