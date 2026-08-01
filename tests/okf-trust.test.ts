import { describe, expect, test } from "./_expect.ts";
import {
  conceptToOkfMarkdown,
  deriveTrustTier,
  isStale,
  normalizeConcept,
  parseTrustFields,
  validateSource,
} from "../packages/okf/src/index.ts";

describe("OKF v0.2 trust fields", () => {
  test("generated.at fills effective timestamp when timestamp absent", () => {
    const c = normalizeConcept(
      {
        type: "article",
        title: "T",
        generated: { by: "reference_agent/gemini-2.5-pro", at: "2026-06-20T22:53:05Z" },
      },
      "body",
      "t",
    );
    expect(c.timestamp).toBe("2026-06-20T22:53:05Z");
    expect(c.generated?.by).toBe("reference_agent/gemini-2.5-pro");
  });

  test("explicit timestamp wins over generated.at", () => {
    const c = normalizeConcept(
      {
        type: "article",
        title: "T",
        timestamp: "2025-01-01T00:00:00Z",
        generated: { by: "agent/1", at: "2026-06-20T22:53:05Z" },
      },
      "body",
      "t",
    );
    expect(c.timestamp).toBe("2025-01-01T00:00:00Z");
    expect(c.generated?.at).toBe("2026-06-20T22:53:05Z");
  });

  test("verified bare mapping becomes one-element list", () => {
    const c = normalizeConcept(
      {
        type: "article",
        title: "T",
        verified: { by: "human:alice", at: "2026-06-25T09:00:00Z" },
      },
      "body",
      "t",
    );
    expect(c.verified?.length).toBe(1);
    expect(c.verified?.[0]?.by).toBe("human:alice");
    expect(deriveTrustTier(c.verified)).toBe("human-reviewed");
  });

  test("trust tiers from verified actors", () => {
    expect(deriveTrustTier(undefined)).toBe("unverified");
    expect(deriveTrustTier([{ by: "process:nightly" }])).toBe("machine-confirmed");
    expect(deriveTrustTier([{ by: "agent/1" }, { by: "human:bob" }])).toBe(
      "human-reviewed",
    );
  });

  test("isStale compares absolute dates", () => {
    expect(isStale("2000-01-01", new Date("2026-08-01T00:00:00Z"))).toBe(true);
    expect(isStale("2099-12-31", new Date("2026-08-01T00:00:00Z"))).toBe(false);
    expect(isStale(undefined)).toBe(false);
  });

  test("serialize round-trips trust families", () => {
    const c = normalizeConcept(
      {
        type: "article",
        title: "Orders",
        profile: "sorane-okf/0.3",
        status: "stable",
        stale_after: "2026-12-31",
        generated: { by: "agent/1", at: "2026-06-20T22:53:05Z" },
        verified: [
          { by: "human:alice", at: "2026-06-25T09:00:00Z" },
          { by: "process:nightly", at: "2026-06-26T02:00:00Z" },
        ],
        sources: [
          {
            id: "schema",
            resource: "https://example.com/schema",
            title: "Schema",
            author: "team:data",
            usage_count: 100,
            last_modified: "2026-05-30",
          },
        ],
        usage_window: { from: "2026-06-01", to: "2026-06-30" },
      },
      "Body.\n",
      "orders",
    );
    const md = conceptToOkfMarkdown(c);
    expect(md).toContain("generated:");
    expect(md).toContain("verified:");
    expect(md).toContain("sources:");
    expect(md).toContain("stale_after: 2026-12-31");
    expect(md).toContain("usage_window:");

    const r = validateSource("orders.md", md);
    expect(r.ok).toBe(true);
  });

  test("invalid generated.by is an error", () => {
    const r = validateSource(
      "a.md",
      "---\ntype: article\ntitle: T\ngenerated:\n  at: 2026-01-01T00:00:00Z\n---\n\nbody\n",
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes("generated.by"))).toBe(true);
  });

  test("sources entry without resource is an error", () => {
    const r = validateSource(
      "a.md",
      "---\ntype: article\ntitle: T\nsources:\n  - title: No resource\n---\n\nbody\n",
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes("resource"))).toBe(true);
  });

  test("invalid status is an error", () => {
    const r = validateSource(
      "a.md",
      "---\ntype: article\ntitle: T\nstatus: shipping\n---\n\nbody\n",
    );
    expect(r.ok).toBe(false);
  });

  test("past stale_after yields warning", () => {
    const r = validateSource(
      "a.md",
      "---\ntype: article\ntitle: T\nstale_after: 2000-01-01\n---\n\nbody\n",
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("stale_after"))).toBe(true);
  });

  test("parseTrustFields rejects non-list sources", () => {
    const t = parseTrustFields({ sources: "https://example.com" });
    expect(t.issues.length > 0).toBe(true);
  });
});
