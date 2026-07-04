import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "./_expect.ts";
import {
  discoverAstroCollectionRoutes,
  htmlRelForContent,
  resolveAstroRoutePlan,
} from "../packages/astro/src/index.ts";

describe("Astro route loader", () => {
  test("discovers getCollection routes from src/pages", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-astro-routes-"));
    const page = join(root, "src", "pages", "blog");
    mkdirSync(page, { recursive: true });
    writeFileSync(
      join(page, "[slug].astro"),
      `---
import { getCollection } from "astro:content";
export async function getStaticPaths() {
  const posts = await getCollection("posts");
  return posts.map((p) => ({ params: { slug: p.id } }));
}
---
`,
    );

    const routes = discoverAstroCollectionRoutes(root);
    expect(routes.length).toBe(1);
    expect(routes[0]?.collection).toBe("posts");
    expect(routes[0]?.basePath).toBe("blog");
  });

  test("manual collections override discovered routes", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-astro-routes-override-"));
    const page = join(root, "src", "pages", "news");
    mkdirSync(page, { recursive: true });
    writeFileSync(
      join(page, "[slug].astro"),
      `---
import { getCollection } from "astro:content";
const posts = await getCollection('posts');
---
`,
    );

    const plan = resolveAstroRoutePlan(root, { collections: { posts: "articles" } });
    expect(plan.collections?.posts).toBe("articles");
    expect(htmlRelForContent("posts/hello.md", plan)).toBe("articles/hello.html");
  });

  test("catch-all page routes use directory permalink", () => {
    const root = mkdtempSync(join(tmpdir(), "sorane-astro-routes-catchall-"));
    const page = join(root, "src", "pages", "docs");
    mkdirSync(page, { recursive: true });
    writeFileSync(
      join(page, "[...slug].astro"),
      `---
import { getCollection } from "astro:content";
await getCollection("docs");
---
`,
    );

    const plan = resolveAstroRoutePlan(root);
    expect(plan.permalink).toBe("directory");
    expect(htmlRelForContent("docs/guide/intro.md", plan)).toBe("docs/guide/intro/index.html");
  });
});