import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions, Response as MFResponse, type Request as MFRequest } from "miniflare";
import { generateKeyPair, exportJWK, jwtVerify, SignJWT, type JWTPayload } from "jose";

export const ROOT = new URL("../../packages/admin-worker/", import.meta.url);
export const ISSUER = "https://mikaki.example";
export const ORIGIN = "https://admin.sorane.example";
export const CLIENT = "sorane-admin-test";
export const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
export const now = () => Math.floor(Date.now() / 1000);
const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const COMMIT = "a".repeat(40);

// A protocol fixture, not a production Mikaki instance. The Worker still performs
// real ES256 verification, private_key_jwt, PKCE, HTTP and D1 operations.
export async function fixture(t: Pick<import("node:test").TestContext,"after">, extra?: {workers: Record<string, unknown>[]; engine: string; bucket: string; origin?: string; sourceService?:{name:string;entrypoint:string}}) {
  const origin = extra?.origin ?? ORIGIN;
  const op = await generateKeyPair("ES256", { extractable: true });
  const rp = await generateKeyPair("ES256", { extractable: true });
  const opJwk = { ...await exportJWK(op.publicKey), kid: "op-test", alg: "ES256", use: "sig" };
  const rpJwk = { ...await exportJWK(rp.privateKey), kid: "rp-test" };
  const codes = new Map<string, { nonce: string; challenge: string; sid: string; claims: JWTPayload }>();
  const sessions = new Map<string, { sub: string; authTime: number; active: boolean }>();
  const assertions = new Set<string>();
  let outage = false, checks = 0;
  let onCheck: (() => Promise<void>) | undefined;
  async function provider(request: MFRequest): Promise<MFResponse> {
    const url = new URL(request.url);
    assert.equal(url.origin, ISSUER, "all outbound traffic is restricted to the fixture issuer");
    if (url.pathname === "/jwks") return MFResponse.json({ keys: [opJwk] });
    if (outage) return new MFResponse("unavailable", { status: 503 });
    assert.equal(request.method, "POST");
    const data: Record<string, string> = url.pathname === "/session/check" ?
      await request.json() as Record<string, string> : Object.fromEntries(new URLSearchParams(await request.text()));
    assert.equal(data.client_id, CLIENT);
    assert.equal(data.client_assertion_type, "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    const { payload, protectedHeader } = await jwtVerify(data.client_assertion, rp.publicKey, {
      issuer: CLIENT, audience: request.url, algorithms: ["ES256"], typ: "JWT",
    });
    assert.equal(protectedHeader.kid, "rp-test");
    assert.equal(payload.sub, CLIENT);
    assert.ok(payload.jti && !assertions.has(payload.jti), "assertions must be fresh per endpoint");
    assert.equal(payload.exp! - payload.iat!, 60);
    assertions.add(payload.jti!);
    if (url.pathname === "/token") {
      const code = codes.get(data.code);
      assert.ok(code, "authorization code is single-use");
      codes.delete(data.code);
      assert.equal(data.grant_type, "authorization_code");
      assert.equal(data.redirect_uri, `${origin}/callback`);
      assert.equal(hash(data.code_verifier), code.challenge, "verify PKCE S256");
      const user = sessions.get(code.sid)!;
      const token = await new SignJWT({ nonce: code.nonce, sid: code.sid, sub: user.sub,
        auth_time: user.authTime, ...code.claims })
        .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: "op-test" })
        .setIssuer(ISSUER).setAudience(String(code.claims.aud ?? CLIENT))
        .setIssuedAt(now()).setExpirationTime(now() + 300).sign(op.privateKey);
      return MFResponse.json({ id_token: token, access_token: "userinfo-only" });
    }
    assert.equal(url.pathname, "/session/check");
    assert.equal(request.headers.get("Content-Type"), "application/json");
    checks++;
    const user = sessions.get(data.sid);
    const reply = user && user.active ? { active: true, sub: user.sub, auth_time: user.authTime,
      expires_at: now() + 3600, lease_ttl: 60, app_idle_timeout: 600 } : { active: false };
    if (onCheck) { const effect = onCheck; onCheck = undefined; await effect(); }
    return MFResponse.json(reply);
  }
  const bundled = await build({ entryPoints: [new URL("src/worker.ts", ROOT).pathname],
    bundle: true, write: false, format: "esm", platform: "browser", target: "es2023", conditions: ["workerd", "browser"] });
  const options = {
    name: "admin", modules: true, script: bundled.outputFiles[0].text,
    compatibilityDate: "2026-10-08", compatibilityFlags: ["nodejs_compat"],
    bindings: { ISSUER, RP_ORIGIN: origin, CLIENT_ID: CLIENT, RP_PRIVATE_JWK: JSON.stringify(rpJwk), PUBLIC_ORIGIN: "https://public.sorane.example", EXPECTED_ENGINE: extra?.engine ?? "e".repeat(64) },
    queueProducers: {BUILD_QUEUE:"test-builds"},
    ...(extra?.sourceService?{serviceBindings:{CONTENT_SOURCE:extra.sourceService}}:{}),
    d1Databases: { DB: randomUUID() }, outboundService: provider,
  } satisfies Parameters<typeof convertV4MiniflareOptions>[0];
  const makeOptions = (bindings: Record<string,string> = {}) => extra ? convertV4MiniflareOptions({workers: [{...options, d1Databases:{DB:"pipeline-db"}, bindings:{...options.bindings,...bindings}}, ...extra.workers]} as Parameters<typeof convertV4MiniflareOptions>[0]) : convertV4MiniflareOptions({...options,bindings:{...options.bindings,...bindings}});
  const mf = new Miniflare(makeOptions());
  t.after(() => mf.dispose());
  let db = await mf.getD1Database("DB","admin");
  for (const name of ["0001_admin.sql", "0002_build_and_publish.sql", "0003_artifacts_push.sql", "0004_content_drafts.sql", "0005_contact.sql"]) {
    const migration = readFileSync(new URL(`migrations/${name}`, ROOT), "utf8").replace(/^--.*$/gm, "").trim();
    const statements = migration.split(/;\s*(?=CREATE|ALTER|$)/).filter((s) => s.trim());
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }
  await db.prepare("INSERT INTO admin_instance VALUES(1,?,?,?)").bind(ISSUER, CLIENT, origin).run();
  async function seedSite(id: string, members: Record<string, string>) {
    await db.batch([
      db.prepare("INSERT INTO site(id,title,artifact_namespace,artifact_repository,created_at) VALUES(?,?,?,?,?)")
        .bind(id, `Site ${id}`, "test-namespace", id, now()),
      ...Object.entries(members).map(([sub, role]) => db.prepare("INSERT INTO site_member VALUES(?,?,?)").bind(id, sub, role)),
    ]);
  }
  const request = (path: string, init?: Parameters<typeof mf.dispatchFetch>[1]) =>
    mf.dispatchFetch(`${origin}${path}`, { redirect: "manual", ...init });
  async function begin(sub: string, claims: JWTPayload = {}) {
    const home = await request("/"); assert.equal(home.status, 200);
    const browserCookie = home.headers.getSetCookie()[0].split(";")[0];
    const browser = browserCookie.slice(browserCookie.indexOf("=") + 1);
    assert.match(home.headers.getSetCookie()[0], /Secure; HttpOnly; SameSite=Lax/);
    const started = await request("/login", { method: "POST", headers: { Origin: origin, Cookie: browserCookie,
      "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: hash(browser) }).toString() });
    assert.equal(started.status, 303);
    const authorize = new URL(started.headers.get("Location")!);
    assert.equal(authorize.origin, ISSUER); assert.equal(authorize.pathname, "/authorize");
    assert.equal(authorize.searchParams.get("scope"), "openid");
    assert.equal(authorize.searchParams.get("client_id"), CLIENT);
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    const code = randomUUID(), sid = randomUUID();
    sessions.set(sid, { sub, authTime: now(), active: true });
    codes.set(code, { nonce: authorize.searchParams.get("nonce")!, challenge: authorize.searchParams.get("code_challenge")!, sid, claims });
    const target = `/callback?${new URLSearchParams({ code, state: authorize.searchParams.get("state")!, iss: ISSUER })}`;
    return { target, browserCookie, browser, sid };
  }
  async function login(sub: string) {
    const start = await begin(sub);
    const callback = await request(start.target, { headers: { Cookie: start.browserCookie } });
    assert.equal(callback.status, 303, await callback.text());
    const cookie = `${start.browserCookie}; ${callback.headers.getSetCookie()[0].split(";")[0]}`;
    const headers = { Cookie: cookie, Origin: origin, "X-CSRF-Token": hash(start.browser), "Content-Type": "application/json" };
    return { ...start, cookie, headers,
      get: (path: string) => request(path, { headers: { Cookie: cookie } }),
      post: (path: string, value: unknown, extra: Record<string, string> = {}) =>
        request(path, { method: "POST", headers: { ...headers, ...extra }, body: JSON.stringify(value) }),
    };
  }
  return { mf, get db() { return db; }, request, seedSite, begin, login, sessions,
    reconfigure: async (bindings: Record<string, string>) => { await mf.setOptions(makeOptions(bindings)); db=await mf.getD1Database("DB","admin"); },
    setOutage: (value: boolean) => { outage = value; },
    onCheck: (effect: () => Promise<void>) => { onCheck = effect; },
    get checks() { return checks; },
    async backchannel(sid: string, claims: JWTPayload = {}) {
      const token = await new SignJWT({ sid, events: { "http://schemas.openid.net/event/backchannel-logout": {} }, ...claims })
        .setProtectedHeader({ alg: "ES256", typ: "logout+jwt", kid: "op-test" })
        .setIssuer(ISSUER).setAudience(CLIENT).setJti(randomUUID()).setIssuedAt(now()).setExpirationTime(now() + 60).sign(op.privateKey);
      return request("/backchannel", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ logout_token: token }).toString() });
    },
  };
}
