import { build, type Plugin } from "esbuild";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import standalone from "ajv/dist/standalone/index.js";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const workerRoot = resolve(root, "packages/ssg-worker");
export function engineId(): string {
  const hash = createHash("sha256");
  function visit(dir: string) {
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else { hash.update(path + "\0"); hash.update(readFileSync(resolve(root, path))); }
    }
  }
  for (const dir of ["packages/core/src", "packages/okf/src", "packages/okf/profile", "packages/ssg-worker/src", "packages/ssg-worker/scripts"]) visit(dir);
  hash.update(readFileSync(resolve(root, "package-lock.json")));
  return hash.digest("hex");
}
export async function bundleWorker(entry = join(workerRoot, "src/worker.ts")) {
  const validators: Record<string,string> = {};
  for (const version of ["0.1", "0.2", "0.3"]) {
    const ajv = new Ajv({ allErrors: true, strict: false, code: { source: true, esm: true } });
    addFormats(ajv);
    const schema = JSON.parse(readFileSync(join(root, "packages/okf/profile", `sorane-okf-${version}.schema.json`), "utf8"));
    validators[version] = standalone(ajv, ajv.compile(schema));
  }
  const plugin: Plugin = { name: "sorane-worker-runtime", setup(builder) {
    // Keep builds from isolated checkouts on their own OKF sources even when
    // third-party node_modules are shared with the main workspace.
    builder.onResolve({filter:/^@sorane\/okf$/}, () => ({path:join(root,"packages/okf/src/index.ts")}));
    builder.onResolve({filter:/profile-validator\.ts$/}, (args) => args.importer.endsWith("/okf/src/validate.ts") ?
      { path: "profile-validator", namespace: "sorane" } : undefined);
    builder.onResolve({filter:/^standalone:/}, (args) => ({ path: args.path.slice(11), namespace: "sorane-validator" }));
    builder.onLoad({filter:/.*/,namespace:"sorane-validator"}, (args) => ({ contents: validators[args.path], resolveDir: root, loader: "js" }));
    builder.onLoad({filter:/.*/,namespace:"sorane"}, () => ({ contents: `
      import v1 from 'standalone:0.1'; import v2 from 'standalone:0.2'; import v3 from 'standalone:0.3';
      const validators={'sorane-okf/0.1':v1,'sorane-okf/0.2':v2,'sorane-okf/0.3':v3};
      export function getProfileValidator(profile){const v=validators[profile];if(!v)throw new Error('unsupported profile');return v;}
      export function profileSchemaPath(){throw new Error('schema files are compiled into the Worker');}
    `, loader: "js" }));
    builder.onResolve({filter:/^@sorane\/(?:font|search)$/}, (args) => ({path:args.path,namespace:"unsupported-feature"}));
    builder.onLoad({filter:/.*/,namespace:"unsupported-feature"}, () => ({ contents: "throw new Error('feature requires the Linux build profile'); export {};", loader: "js" }));
    builder.onResolve({filter:/^node:fs$/}, (args) => args.importer === join(workerRoot,"src/safe-fs.ts") ?
      {path:args.path,external:true} : {path:join(workerRoot,"src/safe-fs.ts")});
  }};
  return build({ entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node",
    target: "es2023", conditions: ["workerd"], external: ["cloudflare:workers"], plugins:[plugin],
    define: { SORANE_ENGINE_ID: JSON.stringify(engineId()) }, minify: true });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await bundleWorker();
  mkdirSync(join(workerRoot, "dist"), { recursive: true });
  writeFileSync(join(workerRoot, "dist/worker.mjs"), output.outputFiles[0].contents);
  console.log(`Bundled sorane engine ${engineId()} (${output.outputFiles[0].contents.length} bytes)`);
}
