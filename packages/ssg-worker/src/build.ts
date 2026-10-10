import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { runBuild } from "../../core/src/build.ts";
import { mergeConfig, type MergeConfigInput } from "../../core/src/config.ts";
import { validateSiteContent } from "../../core/src/validate-site.ts";
import { extract, parseYaml } from "@sorane/okf";
import { safePath, sha256, type Source } from "./artifacts.ts";
import { isolated } from "./safe-fs.ts";
import { POLICY, type Manifest } from "./manifest.ts";
import { resolveContact } from "../../core/src/contact.ts";
import { contentType } from "./content-type.ts";
export { contentType } from "./content-type.ts";
import { applyDraft } from './draft.ts';
import { draftDigest, type ContentDraft } from './draft-input.ts';

declare const SORANE_ENGINE_ID: string;
export const ENGINE_ID = SORANE_ENGINE_ID;
const MAX_OUTPUT_BYTES = 8388608, MAX_OUTPUT_FILE = 1048576, MAX_OUTPUT_FILES = 256;

export function configuration(source: Source, baseUrl: string) {
  const file = source.files.find((f) => f.path === "sorane.yaml");
  let raw: unknown;
  try { raw = file ? parseYaml(new TextDecoder("utf-8", {fatal:true,ignoreBOM:false}).decode(file.bytes)) : {}; }
  catch { throw new Error("invalid_sorane_configuration"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_sorane_configuration");
  let config: ReturnType<typeof mergeConfig>;
  try { config = mergeConfig(raw as MergeConfigInput); }
  catch { throw new Error("invalid_sorane_configuration"); }
  if (config.fonts.enabled || config.build.c2pa?.enabled || config.build.image_metadata?.enabled ||
    config.build.diagrams?.enabled || config.build.outputs?.okfc || config.search.webmcp ||
    config.build.redirects?.length || source.files.some((f) => f.path.endsWith(".okfc") || f.path === config.search.index))
    throw new Error("feature_requires_linux_build_profile");
  for (const path of [config.build.content_dir, config.build.static_dir ?? "static"]) {
    if (!safePath(path) || path === "dist" || path.startsWith("dist/")) throw new Error("invalid_build_directory");
  }
  if (config.build.out_dir !== "dist" || config.build.permalink !== "{{slug}}.html") throw new Error("unsupported_output_layout");
  for (const file of source.files.filter((f) => f.path.endsWith(".md"))) {
    let metadata: unknown;
    try {
      const {frontmatter} = extract(new TextDecoder("utf-8",{fatal:true,ignoreBOM:false}).decode(file.bytes));
      metadata = frontmatter ? parseYaml(frontmatter) : null;
    } catch { throw new Error("invalid_source_content"); }
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const fm = metadata as Record<string,unknown>;
      if (fm.slug !== undefined && (typeof fm.slug !== "string" || !safePath(fm.slug))) throw new Error("invalid_content_slug");
      if (fm.redirect !== undefined) throw new Error("redirect_requires_static_assets_profile");
      if (fm.view === "search") throw new Error("feature_requires_linux_build_profile");
    }
  }
  return {...config, site:{...config.site,base_url:baseUrl}, build:{...config.build,
    security:{...config.build.security,strict_html:true,allow_embeds:false,allow_custom_binaries:false,
      csp_profile:"strict" as const,link_scheme_check:"error" as const},
  }};
}

/** Run the trusted engine on data only, in a request-scoped, confined VFS. */
export async function buildSource(source: Source, commit: string, proposalId: string, baseUrl: string, bucket: R2Bucket, draft?:ContentDraft) {
  if (draft) source=applyDraft(source,draft,configuration(source,baseUrl).build.content_dir);
  const cwd = `/tmp/sorane-${proposalId}`;
  return isolated(cwd, async () => {
    mkdirSync(cwd, {recursive:true});
    for (const file of source.files) {
      const path = join(cwd,file.path); mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,file.bytes);
    }
    const config = configuration(source,baseUrl);
    if (!existsSync(join(cwd,config.build.content_dir))) throw new Error("missing_content_directory");
    let report: ReturnType<typeof validateSiteContent>;
    try { report = validateSiteContent(cwd,config); }
    catch { throw new Error("invalid_source_content"); }
    if (!report.ok) return {ok:false as const, error:"validation_failed", report};
    await runBuild({cwd,config,clean:true,skipC2pa:true});
    const outputs: {path:string; data:Uint8Array}[] = [];
    let total = 0;
    function visit(path: string, prefix="") {
      for (const name of readdirSync(path).sort()) {
        const rel = prefix + name, absolute = join(path,name), info = statSync(absolute);
        if (!safePath(rel)) throw new Error("invalid_output_path");
        if (info.isDirectory()) visit(absolute,rel+"/");
        else {
          if (!info.isFile() || outputs.length >= MAX_OUTPUT_FILES || info.size > MAX_OUTPUT_FILE ||
            total+info.size > MAX_OUTPUT_BYTES) throw new Error("output_size_limit");
          total += info.size; outputs.push({path:rel,data:new Uint8Array(readFileSync(absolute))});
        }
      }
    }
    visit(join(cwd,"dist"));
    if (!outputs.some((f) => f.path === "index.html")) throw new Error("missing_site_index");
    const contact = resolveContact(config);
    const manifest: Manifest = {schema:1,policy:POLICY,engine:ENGINE_ID,repository:source.repositoryId,
      commit,tree:source.treeHash,baseUrl,...(draft?{draft:{schema:1 as const,digest:await draftDigest(draft)}}:{}),
      ...(contact ? {contact:{schema:1 as const,page:contact.page}} : {}),
      files:outputs.map((f)=>({path:f.path,digest:sha256(f.data),bytes:f.data.length,type:contentType(f.path)}))};
    const manifestBytes = JSON.stringify(manifest), digest = sha256(manifestBytes);
    // Content-addressed objects and the final manifest are immutable app writes.
    // A partial upload never gets a ready D1 receipt or public pointer.
    for (const file of outputs) await bucket.put(`blobs/${sha256(file.data)}`,file.data);
    await bucket.put(`manifests/${digest}`,manifestBytes,{httpMetadata:{contentType:"application/json"}});
    return {ok:true as const, digest, manifest, report, totalBytes:total};
  });
}
