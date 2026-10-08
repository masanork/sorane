import { expect, test, type Page } from "@playwright/test";

test.use({ launchOptions: { args: ["--enable-features=WebMCP"] } });

interface SearchResult {
  title: string;
  url: string;
  heading: string;
  snippet: string;
  doc_type: string;
  source: string;
  score: number;
  digital_source_type?: string;
}

interface SearchResponse {
  query: string;
  type: string;
  source: string;
  count: number;
  results: SearchResult[];
}

interface RegisteredTool {
  name: string;
  inputSchema: string | Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
}

interface ModelContext {
  getTools(): Promise<RegisteredTool[]>;
  executeTool(tool: RegisteredTool, input: unknown, options?: { signal: AbortSignal }): Promise<unknown>;
}

type WebMcpDocument = Document & { modelContext: ModelContext; searchAbort?: AbortController };

async function waitForTool(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    return (await (document as WebMcpDocument).modelContext.getTools()).map((tool) => tool.name);
  })).toContain("search_site");
}

async function invoke(page: Page, input: unknown, cancellable = false): Promise<SearchResponse> {
  return page.evaluate(async ({ input, cancellable }) => {
    const doc = document as WebMcpDocument;
    const context = doc.modelContext;
    const tool = (await context.getTools()).find((item) => item.name === "search_site")!;
    if (cancellable) doc.searchAbort = new AbortController();
    // Chrome 153/154 expose JSON strings; Chrome 155+ expose objects.
    const args = typeof tool.inputSchema === "string" ? JSON.stringify(input) : input;
    const output = await context.executeTool(tool, args,
      cancellable ? { signal: doc.searchAbort!.signal } : undefined);
    return typeof output === "string" ? JSON.parse(output) : output;
  }, { input, cancellable });
}

test.describe("native WebMCP search", () => {
  test.use({ serviceWorkers: "block" });

  test("registers the enabled read-only tools with bounded, structured inputs", async ({ page }) => {
    await page.goto("/search.html");
    await waitForTool(page);
    const tools = await page.evaluate(async () => {
      return (await (document as WebMcpDocument).modelContext.getTools()).map((tool) => ({
        name: tool.name,
        annotations: tool.annotations,
        schema: typeof tool.inputSchema === "string" ? JSON.parse(tool.inputSchema) : tool.inputSchema,
      }));
    });
    expect(tools.map((tool) => tool.name).sort()).toEqual(["get_dataset", "get_knowledge_pack", "read_page", "search_site"]);
    expect(tools.every((tool) => tool.annotations.readOnlyHint && tool.annotations.untrustedContentHint)).toBe(true);
    const search = tools.find((tool) => tool.name === "search_site")!;
    expect(search.schema.required).toEqual(["query"]);
    expect(search.schema.additionalProperties).toBe(false);
    expect(search.schema.properties.limit).toMatchObject({ minimum: 1, maximum: 20, default: 10 });
  });

  test("themes with both search mounts register once and use the full UI", async ({ page }) => {
    await page.route("**/search.html", async (route) => {
      const response = await route.fetch();
      const header = `<div class="search search--header" data-search data-webmcp="true" data-index="./assets/search-index.json">
        <form class="search-form"><input class="search-input"><button>Search</button></form>
        <p data-search-status></p><ol data-search-results></ol></div>`;
      await route.fulfill({ response, body: (await response.text()).replace("</main>", `${header}</main>`) });
    });
    await page.goto("/search.html");
    await waitForTool(page);
    expect(await page.evaluate(async () => (await (document as WebMcpDocument).modelContext.getTools()).filter((tool) => tool.name === "search_site").length)).toBe(1);
    const result = await invoke(page, { query: "contractneedle" });
    await expect(page.locator(".search:not(.search--header) .search-hit")).toHaveCount(result.count);
    await expect(page.locator(".search--header .search-input")).toHaveValue("");
  });

  test("tool results match human search, and heading links resolve", async ({ page, request }) => {
    await page.goto("/search.html");
    await waitForTool(page);
    await page.locator(".search-input").fill("contractneedle");
    await page.locator(".search-submit").click();
    await expect(page.locator(".search-hit")).not.toHaveCount(0);
    const humanResults = await page.locator(".search-hit").evaluateAll((items) => items.map((item) => ({
      url: (item.querySelector("a") as HTMLAnchorElement).href,
      heading: item.querySelector("a")!.textContent,
      snippet: item.querySelector(".search-hit-snippet")?.textContent || "",
    })));
    const response = await invoke(page, { query: "  contractneedle  " });
    expect(response.query).toBe("contractneedle");
    expect(response.count).toBe(response.results.length);
    expect(response.results.map(({ url, heading, snippet }) => ({ url, heading, snippet }))).toEqual(humanResults);
    expect(response.results.every((result) => result.title && result.url && result.snippet)).toBe(true);
    const section = response.results.find((result) => result.url.includes("en/webmcp.html#"))!;
    expect(section).toBeTruthy();
    expect((await request.get(section.url)).ok()).toBe(true);
    await page.goto(section.url);
    const hash = new URL(section.url).hash.slice(1);
    await expect(page.locator(`[id="${hash}"]`)).toBeVisible();
  });

  test("filters are reflected in the full UI and reset between calls", async ({ page }) => {
    await page.goto("/search.html");
    await waitForTool(page);
    const filtered = await invoke(page, { query: "contractneedle", type: "faq", source: "ai-generated" });
    expect(filtered.count).toBeGreaterThan(0);
    expect(filtered.results.every((result) => result.doc_type === "faq")).toBe(true);
    expect(filtered.results.every((result) => result.digital_source_type?.includes("trainedAlgorithmicMedia"))).toBe(true);
    await expect(page.locator("select[name=type]")).toHaveValue("faq");
    await expect(page.locator("select[name=source]")).toHaveValue("ai-generated");
    await expect(page.locator(".search-input")).toHaveValue("contractneedle");
    await expect(page.locator(".search-hit")).toHaveCount(filtered.count);
    const all = await invoke(page, { query: "contractneedle" });
    expect(all.count).toBeGreaterThan(filtered.count);
    await expect(page.locator("select[name=type]")).toHaveValue("");
    await expect(page.locator("select[name=source]")).toHaveValue("");
  });

  test("header search shows active filters and remains usable by a person", async ({ page }) => {
    await page.goto("/index.html");
    await waitForTool(page);
    const response = await invoke(page, { query: "contractneedle", type: "faq", source: "ai-generated", limit: 1 });
    await expect(page.locator(".search--header .search-hit")).toHaveCount(response.count);
    const status = page.locator(".search--header [data-search-status]");
    await expect(status).toBeVisible();
    await expect(status).toContainText("FAQ / AI-generated");
    await page.locator(".search-input").fill("Mermaid");
    await page.locator(".search-submit").click();
    await expect(page.locator(".search-hit-title").first()).toContainText("E2E Mermaid");
    await expect(status).not.toContainText("FAQ");
  });

  test("mobile header keeps filters and results within the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/index.html");
    await waitForTool(page);
    const response = await invoke(page, { query: "contractneedle", type: "faq", source: "ai-generated" });
    await expect(page.locator(".search-hit")).toHaveCount(response.count);
    await expect(page.locator("[data-search-status]")).toBeVisible();
    const bounds = await page.locator(".search-results").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  });

  test("limits, no matches and draft exclusion have explicit results", async ({ page }) => {
    await page.goto("/index.html");
    await waitForTool(page);
    const limited = await invoke(page, { query: "contractneedle", limit: 1 });
    expect(limited.count).toBe(1);
    expect(limited.results).toHaveLength(1);
    for (const query of ["zzzznotfoundquery12345", "draftsecret"]) {
      const empty = await invoke(page, { query });
      expect(empty).toMatchObject({ count: 0, results: [] });
      await expect(page.locator(".search-empty")).toBeVisible();
      await expect(page.locator(".search-hit")).toHaveCount(0);
    }
    const published = await invoke(page, { query: "contractneedle" });
    expect(published.results.some((result) => result.source === "draft.md")).toBe(false);
  });

  for (const prefix of ["", "/subsite"]) {
    test(`nested page resolves site URLs${prefix ? " under a subpath with snippet-only output" : ""}`, async ({ page, request }) => {
      await page.goto(`${prefix}/en/webmcp.html`);
      await waitForTool(page);
      const response = await invoke(page, { query: "contractneedle", type: "article", source: "human" });
      expect(response.count).toBeGreaterThan(0);
      const section = response.results[0];
      expect(new URL(section.url).pathname).toBe(`${prefix}/en/webmcp.html`);
      expect(section.heading).toBeTruthy();
      expect(section.snippet).toContain("contractneedle");
      expect(section).not.toHaveProperty("text");
      if (prefix) {
        const index = await (await request.get(`${prefix}/assets/search-index.json`)).json();
        expect(index.chunks.every((chunk: Record<string, unknown>) => !("text" in chunk))).toBe(true);
      }
      await expect(page.locator(".search-hit-title").first()).toHaveAttribute("href", section.url);
      await page.locator(".search-hit-title").first().click();
      await expect(page).toHaveURL(section.url);
      await expect(page.locator(`[id="${new URL(section.url).hash.slice(1)}"]`)).toBeVisible();
    });
  }

  test("invalid input rejects without replacing successful results", async ({ page }) => {
    await page.goto("/index.html");
    await waitForTool(page);
    const valid = await invoke(page, { query: "contractneedle" });
    for (const input of [
      {}, { query: "" }, { query: "   " }, { query: 42 }, { query: "a".repeat(513) },
      { query: "ok", limit: 0 }, { query: "ok", limit: 21 }, { query: "ok", limit: 1.5 },
      { query: "ok", type: "unknown" }, { query: "ok", source: null }, { query: "ok", extra: true },
    ]) {
      await expect(invoke(page, input)).rejects.toThrow();
    }
    await expect(page.locator(".search-hit")).toHaveCount(valid.count);
    await expect(page.locator(".search-input")).toHaveValue("contractneedle");
  });

  test("index failures reach the caller and UI, and retry succeeds", async ({ page }) => {
    await page.route("**/assets/search-index.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
    await page.goto("/index.html");
    await waitForTool(page);
    await expect(invoke(page, { query: "contractneedle" })).rejects.toThrow();
    await expect(page.locator(".search-empty")).toContainText("503");
    await expect(page.locator("[data-search]")).not.toHaveAttribute("aria-busy", "true");
    await page.unroute("**/assets/search-index.json");
    const retried = await invoke(page, { query: "contractneedle" });
    expect(retried.count).toBeGreaterThan(0);
    await expect(page.locator(".search-hit")).toHaveCount(retried.count);
  });

  test("excerpts remain text in the UI while the tool returns their original content", async ({ page }) => {
    const snippet = '<img src=x onerror="window.injected=true"> contractneedle';
    await page.route("**/assets/search-index.json", (route) => route.fulfill({ json: { chunks: [{
      source: "en/webmcp.md", url: "en/webmcp.html", title: "Example", heading_path: "Example",
      snippet, doc_type: "article", tags: "",
    }] } }));
    await page.goto("/index.html");
    await waitForTool(page);
    const response = await invoke(page, { query: "contractneedle" });
    expect(response.results[0].snippet).toBe(snippet);
    await expect(page.locator(".search-hit-snippet")).toHaveText(snippet);
    await expect(page.locator(".search-hit img")).toHaveCount(0);
  });

  test("cancellation clears busy state and a subsequent search works", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/assets/search-index.json", async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    await page.goto("/index.html");
    await waitForTool(page);
    const requested = page.waitForRequest("**/assets/search-index.json");
    const cancelled = invoke(page, { query: "contractneedle" }, true).catch(() => "cancelled");
    await requested;
    await expect(page.locator("[data-search]")).toHaveAttribute("aria-busy", "true");
    await page.evaluate(() => (document as WebMcpDocument).searchAbort!.abort());
    expect(await cancelled).toBe("cancelled");
    await expect(page.locator(".search-empty")).toContainText("Search cancelled");
    await expect(page.locator("[data-search]")).not.toHaveAttribute("aria-busy", "true");
    release();
    await page.unroute("**/assets/search-index.json");
    expect((await invoke(page, { query: "Mermaid" })).count).toBeGreaterThan(0);
  });

  test("a newer request supersedes an in-flight search without stale UI", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/assets/search-index.json", async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    await page.goto("/index.html");
    await waitForTool(page);
    const requested = page.waitForRequest("**/assets/search-index.json");
    const previous = invoke(page, { query: "contractneedle" }).catch(() => "superseded");
    await requested;
    const latest = invoke(page, { query: "Mermaid" });
    expect(await previous).toBe("superseded");
    release();
    const response = await latest;
    expect(response.query).toBe("Mermaid");
    await expect(page.locator(".search-input")).toHaveValue("Mermaid");
    await expect(page.locator(".search-hit-title").first()).toContainText("E2E Mermaid");
    await expect(page.locator("[data-search]")).not.toHaveAttribute("aria-busy", "true");
  });

  test("opt-out site exposes no tools while ordinary search still works", async ({ page }) => {
    await page.goto("/disabled/search.html");
    expect(await page.evaluate(() => (document as WebMcpDocument).modelContext.getTools())).toEqual([]);
    await page.locator(".search-input").fill("contractneedle");
    await page.locator(".search-submit").click();
    await expect(page.locator(".search-hit")).not.toHaveCount(0);
  });
});

test.describe("WebMCP offline", () => {
  test("cached search page discovers and executes its tool after an offline reload", async ({ page, context }) => {
    await page.goto("/search.html");
    await waitForTool(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
      }
    });
    await context.setOffline(true);
    await page.reload();
    await waitForTool(page);
    const response = await invoke(page, { query: "contractneedle" });
    expect(response.count).toBeGreaterThan(0);
    await expect(page.locator(".search-hit")).toHaveCount(response.count);
  });
});
