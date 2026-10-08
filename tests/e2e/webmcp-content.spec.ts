import { expect, test, type Page } from "@playwright/test";

test.use({ launchOptions: { args: ["--enable-features=WebMCP"] }, serviceWorkers: "block" });

type ContextDocument = Document & { modelContext: {
  getTools(): Promise<{ name: string; inputSchema: string | object }[]>;
  executeTool(tool: object, args: unknown, options?: { signal: AbortSignal }): Promise<unknown>;
}; toolAbort?: AbortController };

async function names(page: Page) {
  return page.evaluate(async () => (await (document as ContextDocument).modelContext.getTools()).map((tool) => tool.name));
}

async function invoke(page: Page, name: string, input: unknown, cancellable = false): Promise<any> {
  await expect.poll(() => names(page)).toContain(name);
  return page.evaluate(async ({ name, input, cancellable }) => {
    const doc = document as ContextDocument;
    const context = doc.modelContext;
    const tool = (await context.getTools()).find((tool) => tool.name === name)!;
    if (cancellable) doc.toolAbort = new AbortController();
    const output = await context.executeTool(tool, typeof tool.inputSchema === "string" ? JSON.stringify(input) : input,
      cancellable ? { signal: doc.toolAbort!.signal } : undefined);
    return typeof output === "string" ? JSON.parse(output) : output;
  }, { name, input, cancellable });
}

test("search to complete page to section preserves dates, sources and heading links", async ({ page, request }) => {
  await page.goto("/search.html");
  const found = await invoke(page, "search_site", { query: "contractneedle", type: "article" });
  const url = found.results[0].url.split("#")[0];
  const result = await invoke(page, "read_page", { url });
  expect(result.body).toContain("More examples");
  expect(result.body).toContain("Search contract");
  expect(result.updated).toBe("2026-10-02T00:00:00.000Z");
  expect(result.sources[0].resource).toBe("https://developer.chrome.com/docs/ai/webmcp");
  expect(result.verified[0].by).toBe("person:reviewer");
  expect(result.ai_disclosure.digitalSourceCode).toBe("digitalCreation");
  expect(result.toc.map((entry: any) => entry.title)).toEqual(["Search contract", "More examples"]);
  const section = await invoke(page, "read_page", { url, section: result.toc[0].id });
  expect(section.body).toContain("same published sections");
  expect(section.body).not.toContain("second section");
  expect(await invoke(page, "read_page", { url: result.toc[0].url })).toEqual(section);
  await expect(page.locator(".webmcp-preview")).toContainText(section.body);
  expect((await request.get(section.url)).ok()).toBe(true);
  await page.goto(section.url);
  await expect(page.locator(`[id="${section.section}"]`)).toBeVisible();
});

test("new filters share human UI behavior and normalize width and kana", async ({ page }) => {
  await page.goto("/search.html");
  const result = await invoke(page, "search_site", { query: "contractneedle", tags: ["ＷＥＢＭＣＰ", "testing"],
    lang: "en", updated_after: "2026-10-02", updated_before: "2026-10-02" });
  expect(result.count).toBe(2);
  expect(result.results.every((item: any) => item.lang === "en" && item.tags.includes("testing") && item.updated.startsWith("2026-10-02"))).toBe(true);
  await expect(page.locator("input[name=tags]")).toHaveValue("ＷＥＢＭＣＰ, testing");
  await expect(page.locator("input[name=lang]")).toHaveValue("en");
  await page.locator(".search-submit").click();
  await expect(page.locator(".search-hit")).toHaveCount(result.count);
  const variants = [];
  for (const query of ["データセット", "ﾃﾞｰﾀｾｯﾄ", "でーたせっと"]) {
    const response = await invoke(page, "search_site", { query, lang: "ja", tags: ["でーた"] });
    expect(response.count).toBeGreaterThan(0);
    variants.push(response.results.map((item: any) => item.url));
  }
  expect(variants[1]).toEqual(variants[0]);
  expect(variants[2]).toEqual(variants[0]);
  const cleared = await invoke(page, "search_site", { query: "contractneedle" });
  expect(cleared.count).toBeGreaterThan(result.count);
  await expect(page.locator("input[name=tags]")).toHaveValue("");
  for (const input of [{ tags: [""] }, { tags: "testing" }, { tags: Array(11).fill("x") },
    { lang: "../en" }, { updated_after: "2026-02-30" }, { updated_before: null },
    { updated_after: "2026-10-03", updated_before: "2026-10-01" }]) {
    await expect(invoke(page, "search_site", { query: "contractneedle", ...input })).rejects.toThrow();
  }
  await expect(page.locator(".search-hit")).toHaveCount(cleared.count);
});

test("dataset metadata resolves local and external distributions without downloading", async ({ page, request }) => {
  await page.goto("/index.html");
  let downloads = 0;
  page.on("request", (req) => { if (/example\.csv|data\.example/.test(req.url())) downloads++; });
  const found = await invoke(page, "search_site", { query: "datasetneedle", type: "dataset" });
  const result = await invoke(page, "get_dataset", { url: found.results[0].url });
  expect(result.license).toEqual({ id: "CC-BY-4.0", url: "https://creativecommons.org/licenses/by/4.0/" });
  expect(result.publisher.name).toBe("Example Office");
  expect(result.distributions[0]).toMatchObject({ format: "csv", media_type: "text/csv", byteSize: 14, checksum: "sha256:example" });
  expect(new URL(result.distributions[0].accessURL).pathname).toBe("/static/example.csv");
  expect(result.distributions[1].downloadURL).toBe("https://data.example.test/download.json");
  expect(downloads).toBe(0);
  expect((await request.get(result.distributions[0].accessURL)).ok()).toBe(true);
  await expect(page.locator(".webmcp-preview")).toContainText("Example Office");
  await expect(invoke(page, "get_dataset", { url: "en/webmcp.html" })).rejects.toThrow();
});

test("knowledge packs recommend the smallest matching scope and link to real artifacts", async ({ page, request }) => {
  await page.goto("/en/webmcp.html");
  const result = await invoke(page, "get_knowledge_pack", { url: page.url() });
  expect(result.packs.map((pack: any) => pack.id)).toEqual(["guides", "site"]);
  expect(result.packs[0].scope.pages).toEqual([page.url()]);
  expect(result.packs[0].scope.languages).toEqual(["en"]);
  expect(result.packs[0].scope.types).toEqual(["article"]);
  expect(result.packs[0].scope.tags).toEqual(["testing", "webmcp"]);
  for (const pack of result.packs) expect((await request.get(pack.url)).ok()).toBe(true);
  const all = await invoke(page, "get_knowledge_pack", {});
  expect(all.count).toBe(2);
});

test("snippet-only search does not expose reading tools or a full content manifest", async ({ page, request }) => {
  await page.goto("/subsite/search.html");
  await expect.poll(() => names(page)).toEqual(["search_site"]);
  expect((await request.get("/subsite/assets/webmcp-content.json")).status()).toBe(404);
});

test("invalid page URLs and unpublished pages are rejected without arbitrary requests", async ({ page }) => {
  await page.goto("/index.html");
  for (const name of ["read_page", "get_dataset", "get_knowledge_pack"]) {
    for (const url of ["https://evil.example/page", "javascript:alert(1)", "draft.html", "404.html", "missing.html"]) {
      await expect(invoke(page, name, { url })).rejects.toThrow();
    }
    await expect(invoke(page, name, { url: "en/webmcp.html", extra: true })).rejects.toThrow();
  }
  await expect(invoke(page, "read_page", { url: "en/webmcp.html", section: "missing" })).rejects.toThrow();
});

test("content fetch errors and aborts can be retried", async ({ page }) => {
  await page.route("**/assets/webmcp-content.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto("/index.html");
  await expect(invoke(page, "read_page", { url: "en/webmcp.html" })).rejects.toThrow();
  await page.unroute("**/assets/webmcp-content.json");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/assets/webmcp-content.json", async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  const requested = page.waitForRequest("**/assets/webmcp-content.json");
  const aborted = invoke(page, "read_page", { url: "en/webmcp.html" }, true).catch(() => "aborted");
  await requested;
  await page.evaluate(() => (document as ContextDocument).toolAbort!.abort());
  expect(await aborted).toBe("aborted");
  release();
  await page.unroute("**/assets/webmcp-content.json");
  expect((await invoke(page, "read_page", { url: "en/webmcp.html" })).body).toContain("contractneedle");
});

test("contact preparation only edits fields; sending still requires a manual submit", async ({ page }) => {
  await page.goto("/contact.html");
  let sent = 0;
  await page.route("**/contact-submit", async (route) => {
    sent++;
    await route.fulfill({ body: "Sent manually" });
  });
  const result = await invoke(page, "prepare_contact", { fields: { name: "Visitor", subject: "Question", body: "Please explain WebMCP." } });
  expect(result).toMatchObject({ submitted: false, requires_user_submission: true });
  await expect(page.locator("textarea[name=body]")).toHaveValue("Please explain WebMCP.");
  await expect(page.locator("[data-webmcp-contact-status]")).toContainText("send it yourself");
  expect(sent).toBe(0);
  for (const input of [{ fields: { name: "Overwrite", body: "Changed" } }, { fields: { csrf: "changed" } },
    { fields: { subject: "x".repeat(201) }, overwrite: true }, { fields: {} }, { fields: { name: 42 } }]) {
    await expect(invoke(page, "prepare_contact", input)).rejects.toThrow();
  }
  await expect(page.locator("input[name=name]")).toHaveValue("Visitor");
  await invoke(page, "prepare_contact", { fields: { subject: "Reviewed question" }, overwrite: true });
  expect(sent).toBe(0);
  await page.locator("button[type=submit]").filter({ hasText: "Send" }).click();
  await expect(page).toHaveURL(/contact-submit/);
  expect(sent).toBe(1);
});

test("contact tool follows dynamic form availability and unregisters on removal", async ({ page }) => {
  await page.goto("/contact.html");
  await expect.poll(() => names(page)).toContain("prepare_contact");
  await page.locator("form[data-webmcp-contact]").evaluate((form) => { form.remove(); });
  await expect.poll(() => names(page)).not.toContain("prepare_contact");
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.setAttribute("data-webmcp-contact", "");
    form.innerHTML = '<label>Message<textarea name="body" maxlength="100"></textarea></label>';
    document.querySelector("main")!.append(form);
  });
  await invoke(page, "prepare_contact", { fields: { body: "New draft" } });
  await expect(page.locator("textarea[name=body]")).toHaveValue("New draft");
});

test("Kototoi exposes draft preparation after login, preserving manual submission", async ({ page }) => {
  let authenticated = false;
  let posts = 0;
  await page.route("**/kototoi-test/**", (route) => {
    if (route.request().method() !== "GET") posts++;
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith("/auth/session") ? (authenticated ? { role: "inquirer" } : null)
      : path.endsWith("/threads") ? { threads: [] } : { status: "active", name: "Test site" } });
  });
  await page.goto("/kototoi.html");
  await expect(page.getByRole("button", { name: /Passkey.*登録/ })).toBeVisible();
  expect(await names(page)).not.toContain("prepare_contact");
  authenticated = true;
  await page.reload();
  const response = await invoke(page, "prepare_contact", { fields: { name: "Visitor", body: "A draft for review." } });
  expect(response.submitted).toBe(false);
  await expect(page.locator("#kototoi-name")).toHaveValue("Visitor");
  await expect(page.locator("#kototoi-body")).toHaveValue("A draft for review.");
  await expect(page.locator("[data-webmcp-contact-status]")).toContainText("send it yourself");
  expect(posts).toBe(0);
  await page.getByRole("button", { name: "問い合わせ一覧" }).click();
  await expect.poll(() => names(page)).not.toContain("prepare_contact");
});

test("explicit body opt-in supports nested pages under a site subpath", async ({ page, request }) => {
  await page.goto("/extended/en/webmcp.html");
  const found = await invoke(page, "search_site", { query: "contractneedle", type: "article" });
  const read = await invoke(page, "read_page", { url: found.results[0].url });
  expect(new URL(read.url).pathname).toBe("/extended/en/webmcp.html");
  expect(read.body).toContain("contractneedle");
  const index = await (await request.get("/extended/assets/search-index.json")).json();
  expect(index.chunks.every((chunk: any) => !("text" in chunk))).toBe(true);
  const data = await invoke(page, "get_dataset", { url: "data.html" });
  expect(new URL(data.distributions[0].accessURL).pathname).toBe("/extended/static/example.csv");
  const packs = await invoke(page, "get_knowledge_pack", { url: read.url });
  expect(new URL(packs.packs[0].url).pathname).toBe("/extended/okf/units/guides.okfc");
  await expect(invoke(page, "read_page", { url: "/en/webmcp.html" })).rejects.toThrow();
});

test("content returned to the UI stays literal text", async ({ page }) => {
  await page.route("**/assets/webmcp-content.json", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.pages.find((page: any) => page.url === "en/webmcp.html").body = '<img src=x onerror="window.injected=true">';
    await route.fulfill({ json: data });
  });
  await page.goto("/index.html");
  const result = await invoke(page, "read_page", { url: "en/webmcp.html" });
  await expect(page.locator(".webmcp-preview pre")).toHaveText(result.body);
  await expect(page.locator(".webmcp-preview img")).toHaveCount(0);
});

test.describe("offline content", () => {
  test.use({ serviceWorkers: "allow" });
  test("cached content and pack discovery execute after offline reload", async ({ page, context }) => {
    await page.goto("/search.html");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
      }
    });
    await context.setOffline(true);
    await page.reload();
    expect((await invoke(page, "read_page", { url: "en/webmcp.html" })).body).toContain("contractneedle");
    expect((await invoke(page, "get_dataset", { url: "data.html" })).distributions).toHaveLength(2);
    expect((await invoke(page, "get_knowledge_pack", { url: "en/webmcp.html" })).count).toBe(2);
  });
});
