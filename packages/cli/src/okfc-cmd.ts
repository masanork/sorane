/**
 * sorane okfc pack | query — OKF Container Format tooling (FTS).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  buildOkfcRegistry,
  okfcRegistryToJson,
  packOkfcFromIr,
  buildKnowledgeIr,
  sliceKnowledgeIr,
  conceptIdFor,
  parseConcept,
  queryOkfcFts,
  type OkfcRegistryBundle,
  type ParsedConcept,
} from "@sorane/okf";
import {
  mergeConfig,
  resolveBuildOutputs,
  resolveOkfcBuildConfig,
  resolveOkfcPackPlans,
  toOkfcEligible,
  type SoraneConfig,
} from "@sorane/core";
import { loadSoraneConfig, parseCwdFlag } from "./config-load.ts";

function parseFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return undefined;
  return argv[i + 1];
}

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walkMarkdown(abs));
    else if (/\.md$/i.test(name)) out.push(abs);
  }
  return out;
}

function includePageInBuild(
  concept: { frontmatter: Record<string, unknown> },
  includeDrafts: boolean,
): boolean {
  if (includeDrafts) return true;
  return concept.frontmatter.draft !== true;
}

function isNotFoundSource(relPath: string): boolean {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return /^404\.md$/i.test(base);
}

function slugFromRel(relPath: string): string {
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return base.replace(/\.md$/i, "");
}

function loadParsed(cwd: string, config: SoraneConfig): ParsedConcept[] {
  const contentDir = resolve(cwd, config.build.content_dir);
  const parsed: ParsedConcept[] = [];
  for (const abs of walkMarkdown(contentDir)) {
    const rel = relative(contentDir, abs);
    const source = readFileSync(abs, "utf8");
    parsed.push(
      parseConcept(abs, rel, source, {
        defaultProfile: config.okf?.default_profile,
        unknownType: config.okf?.unknown_type,
      }),
    );
  }
  return parsed;
}

export async function runOkfcCmd(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (sub === "pack") {
    await runOkfcPack(rest);
    return;
  }
  if (sub === "query") {
    await runOkfcQuery(rest);
    return;
  }
  process.stderr.write(
    "usage: sorane okfc <pack|query> [options]\n" +
      "  pack   --cwd <dir> [--unit <id>] [--out <path>] [--drafts]\n" +
      "  query  <file.okfc> <query…> [--k 10] [--type <type>] [--json]\n",
  );
  process.exit(sub === undefined ? 0 : 1);
}

async function runOkfcPack(argv: string[]): Promise<void> {
  const cwd = parseCwdFlag(argv);
  const config = mergeConfig(loadSoraneConfig(cwd));
  const unitFilter = parseFlag(argv, "--unit");
  const outOverride = parseFlag(argv, "--out");
  const includeDrafts = argv.includes("--drafts");
  const buildOutputs = resolveBuildOutputs(config.build.outputs);
  // Allow pack even when outputs.okfc is off (explicit CLI intent).
  const okfcCfg = resolveOkfcBuildConfig(
    config.build.okfc,
    buildOutputs.okfc || true,
  );
  const outDir = resolve(cwd, config.build.out_dir);
  const baseUrl = config.site.base_url ?? "";
  const parsed = loadParsed(cwd, config);
  const eligible = toOkfcEligible(parsed, {
    includeDrafts,
    includePageInBuild,
    isNotFoundSource,
    slugFromRel,
  });
  let plans = resolveOkfcPackPlans(eligible, okfcCfg, {
    siteTitle: config.site.title,
    siteDescription: config.site.description,
    baseUrl,
    packTool: "tool:sorane/okfc-pack@0.5",
  });
  if (unitFilter) {
    plans = plans.filter((p) => p.id === unitFilter);
    if (plans.length === 0) {
      throw new Error(`unknown --unit "${unitFilter}" (no matching pack plan)`);
    }
  }
  if (outOverride && plans.length === 1) {
    plans = [{ ...plans[0]!, outRel: outOverride }];
  } else if (outOverride && plans.length !== 1) {
    throw new Error("--out requires exactly one unit (use --unit <id>)");
  }

  const pathById = new Map<string, string>();
  for (const e of eligible) {
    pathById.set(conceptIdFor(e.concept.type, e.slug), e.relPath);
  }
  const siteIr = buildKnowledgeIr(
    eligible.map((e) => ({ concept: e.concept, slug: e.slug })),
    { sourcePathByConceptId: pathById },
  );
  const registryBundles: OkfcRegistryBundle[] = [];
  for (const plan of plans) {
    const dbPath = resolve(outDir, plan.outRel);
    mkdirSync(dirname(dbPath), { recursive: true });
    const planIds = new Set(
      plan.concepts.map((c) => conceptIdFor(c.concept.type, c.slug)),
    );
    const ir = plan.id === "site" ? siteIr : sliceKnowledgeIr(siteIr, planIds);
    const result = await packOkfcFromIr({
      dbPath,
      ir,
      meta: plan.meta,
      fresh: true,
    });
    process.stdout.write(
      `[sorane] OKFC pack: ${result.conceptCount} concept(s), ${result.chunkCount} chunk(s) → ${plan.outRel}\n`,
    );
    registryBundles.push({
      id: plan.id,
      path: plan.outRel,
      title: plan.meta.title,
      description: plan.meta.description,
      bundle_type: plan.meta.bundle_type,
      bundle_uri: plan.meta.bundle_uri,
      concept_count: result.conceptCount,
      chunk_count: result.chunkCount,
      packed_at: result.packedAt,
      search: result.search,
    });
  }
  if (okfcCfg.registry && registryBundles.length > 0 && !unitFilter) {
    const registryPath = join(outDir, "okf/registry.json");
    mkdirSync(dirname(registryPath), { recursive: true });
    writeFileSync(
      registryPath,
      okfcRegistryToJson(buildOkfcRegistry(registryBundles)),
      "utf8",
    );
    process.stdout.write(`[sorane] OKFC registry → okf/registry.json\n`);
  }
}

async function runOkfcQuery(argv: string[]): Promise<void> {
  const json = argv.includes("--json");
  const kRaw = parseFlag(argv, "--k");
  const type = parseFlag(argv, "--type");
  const limit = kRaw ? Number(kRaw) : 10;
  const positional = argv.filter(
    (a, i) =>
      !a.startsWith("--") &&
      argv[i - 1] !== "--k" &&
      argv[i - 1] !== "--type" &&
      a !== "--json",
  );
  const file = positional[0];
  const query = positional.slice(1).join(" ").trim();
  if (!file || !query) {
    throw new Error("usage: sorane okfc query <file.okfc> <query…> [--k 10] [--type t] [--json]");
  }
  const dbPath = resolve(file);
  if (!existsSync(dbPath)) {
    throw new Error(`OKFC file not found: ${dbPath}`);
  }
  const hits = await queryOkfcFts(dbPath, query, {
    limit: Number.isFinite(limit) ? limit : 10,
    type: type || undefined,
  });
  if (json) {
    process.stdout.write(`${JSON.stringify({ hits }, null, 2)}\n`);
    return;
  }
  if (hits.length === 0) {
    process.stdout.write("(no hits)\n");
    return;
  }
  for (const h of hits) {
    const title = h.title ?? h.id;
    process.stdout.write(
      `${h.score.toFixed(3)}\t${h.type}\t${h.id}\t${title}` +
        (h.snippet ? `\t${h.snippet.replace(/\s+/g, " ")}` : "") +
        "\n",
    );
  }
}
