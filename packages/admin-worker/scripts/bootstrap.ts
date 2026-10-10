import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  mode: { type: "string" }, issuer: { type: "string" }, client: { type: "string" },
  origin: { type: "string" }, site: { type: "string" }, title: { type: "string" },
  namespace: { type: "string" }, repository: { type: "string" }, owner: { type: "string" },
} });
const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;
function required(name: keyof typeof values, max = 255): string {
  const value = values[name];
  if (!value || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`Invalid --${name}`);
  return value;
}
function origin(name: "issuer" | "origin") {
  const value = required(name, 2048), url = new URL(value);
  if (url.origin !== value || (url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))
    throw new Error(`--${name} must be an exact HTTPS origin (HTTP loopback is local-only)`);
  return value;
}
const issuer = origin("issuer"), rpOrigin = origin("origin"), client = required("client");
if (client === "register-this-rp-with-mikaki") throw new Error("Register an RP before bootstrapping");
if (values.mode === "instance") {
  if (["site", "title", "namespace", "repository", "owner"].some((key) => values[key as keyof typeof values]))
    throw new Error("--mode instance only accepts issuer, client and origin");
  console.log(`INSERT INTO admin_instance(singleton,issuer,client_id,rp_origin) VALUES(1,${quoted(issuer)},${quoted(client)},${quoted(rpOrigin)});`);
} else if (values.mode === "site") {
  const site = required("site", 63), title = required("title"), owner = required("owner");
  const namespace = required("namespace"), repository = required("repository");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(site)) throw new Error("Invalid --site");
  if ([namespace, repository].some((value) => value.includes("/"))) throw new Error("Namespace/repository must be individual identifiers");
  // Wrangler executes the complete SQL file as a batch. A missing/mismatched
  // instance fails NOT NULL; duplicate sites fail PK. Neither can add an owner.
  console.log(`INSERT INTO site(id,title,artifact_namespace,artifact_repository,created_at)
VALUES(${quoted(site)},${quoted(title)},${quoted(namespace)},${quoted(repository)},
CASE WHEN EXISTS(SELECT 1 FROM admin_instance WHERE singleton=1 AND issuer=${quoted(issuer)} AND client_id=${quoted(client)} AND rp_origin=${quoted(rpOrigin)}) THEN unixepoch() ELSE NULL END);
INSERT INTO site_member(site_id,sub,role) VALUES(${quoted(site)},${quoted(owner)},'owner');`);
} else {
  throw new Error("Use --mode instance or --mode site (emits SQL; never executes it)");
}
