import { readFileSync, existsSync, mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { loadSoraneConfig } from "../packages/cli/src/config-load.ts";
import { resolveContact } from "../packages/core/src/contact.ts";
import { cloudflareClient, digest, formPresent, publishPages, verifyPublishedForm, UUID } from "./pages-publication.ts";

// Production release coordinator. Credentials stay in the environment and are
// never passed as CLI arguments or included in diagnostics/Actions summaries.
async function run() {
  const { values } = parseArgs({ options: {
    rollback: { type: "string" }, "sync-current": { type: "boolean", default: false },
    commit: { type: "string" },
  } });
  if (process.env.GITHUB_REF && process.env.GITHUB_REF !== "refs/heads/main") throw new Error("main_required");
  const config = JSON.parse(readFileSync("deployment/production/contact.jsonc", "utf8"));
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== config.account_id) throw new Error("account_mismatch");
  const db = config.d1_databases.find((binding: { binding: string }) => binding.binding === "DB");
  const site = loadSoraneConfig(resolve("website"));
  const contact = resolveContact(site);
  if ((site.site.contact?.page ?? "contact.html") !== "contact.html" || (contact && contact.endpoint !== "/_contact"))
    throw new Error("production_contact_path_changed");
  const commit = values.commit ?? process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const restoring = Boolean(values.rollback || values["sync-current"]);
  const form = existsSync("website/dist/contact.html") ? readFileSync("website/dist/contact.html", "utf8") : "";
  if (!restoring && formPresent(form) !== Boolean(contact)) throw new Error("contact_build_mismatch");
  const actor = process.env.GITHUB_RUN_ID && /^\d+$/.test(process.env.GITHUB_RUN_ID)
    ? `github-actions:${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT ?? "1"}` : "local-operator";
  const client = cloudflareClient(process.env.CLOUDFLARE_API_TOKEN ?? "", config.account_id, db.database_id);
  const result = await publishPages({ ...client, verify: verifyPublishedForm, deploy: async onCreated => {
    const directory = mkdtempSync(join(tmpdir(), "sorane-pages-release-"));
    const output = join(directory, "wrangler.ndjson");
    try {
      // Wrangler's documented structured output identifies this upload even if
      // another deployment appears concurrently. Human log text is not parsed.
      const status = await new Promise<number | null>((done, reject) => {
        const child = spawn(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "pages", "deploy", "website/dist",
          "--project-name", "sorane", "--branch", "main", "--commit-hash", commit, "--commit-dirty=false"], {
          stdio: "ignore", env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_SANITIZE: "true" },
        });
        child.on("error", () => reject(new Error("pages_upload_failed")));
        child.on("close", done);
      });
      let id: string | undefined;
      if (existsSync(output)) {
        for (const line of readFileSync(output, "utf8").split("\n").filter(Boolean)) {
          const entry = JSON.parse(line);
          if (entry.type === "pages-deploy" && entry.version === 1 && entry.pages_project === "sorane" && UUID.test(entry.deployment_id)) {
            id = entry.deployment_id; onCreated(id!);
          }
        }
      }
      if (status !== 0 || !id) throw new Error("pages_upload_failed");
      return id;
    } finally { rmSync(directory, { recursive: true, force: true }); }
  } }, {
    site: config.vars.CONTACT_SITE_ID, origins: JSON.parse(config.vars.CONTACT_ORIGINS), actor, commit,
    enabled: Boolean(contact), formDigest: digest(form), rollback: values.rollback, syncCurrent: values["sync-current"],
  });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Pages and contact publication\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`);
  if (!result.ok) process.exitCode = 1;
}

try { await run(); }
catch {
  console.log(JSON.stringify({ ok: false, phase: "configuration", recovery: "unchanged" }));
  process.exitCode = 1;
}
