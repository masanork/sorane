import { describe, expect, test } from "./_expect.ts";
import {
  aiDisclosureJsonLdFields,
  buildAiBadgeHtml,
  buildCompactAiBadgeHtml,
  parseAiDisclosure,
  resolveAiDisclosureFlags,
} from "../packages/core/src/ai-disclosure.ts";

describe("parseAiDisclosure", () => {
  test("compositeWithTrainedAlgorithmicMedia を解決する", () => {
    const d = parseAiDisclosure({
      digitalSourceType: "compositeWithTrainedAlgorithmicMedia",
      aiDisclosureNote: "Draft assisted by Claude.",
      aiSystems: [{ name: "Claude", provider: "Anthropic" }],
    });
    expect(d !== null).toBe(true);
    expect(d!.digitalSourceCode).toBe("compositeWithTrainedAlgorithmicMedia");
    expect(d!.euLabel).toBe("partially-modified");
    expect(d!.showBadge).toBe(true);
    expect(d!.note).toBe("Draft assisted by Claude.");
    expect(d!.systems?.[0]?.name).toBe("Claude");
  });

  test("humanEdits はバッジなし", () => {
    const d = parseAiDisclosure({ digitalSourceType: "humanEdits" });
    expect(d !== null).toBe(true);
    expect(d!.showBadge).toBe(false);
  });

  test("フィールド無しは null", () => {
    expect(parseAiDisclosure({})).toBe(null);
  });
});

describe("aiDisclosureJsonLdFields", () => {
  test("contributor を含む", () => {
    const d = parseAiDisclosure({
      digitalSourceType: "trainedAlgorithmicMedia",
      aiSystems: [{ name: "GPT", version: "4" }],
    })!;
    const fields = aiDisclosureJsonLdFields(d);
    expect(fields.digitalSourceType).toContain("trainedAlgorithmicMedia");
    expect(fields.disambiguatingDescription).toBe(undefined);
    const contributors = fields.contributor as Array<Record<string, unknown>>;
    expect(contributors[0]!["@type"]).toBe("SoftwareApplication");
    expect(contributors[0]!.name).toBe("GPT");
    expect(contributors[0]!.softwareVersion).toBe("4");
  });
});

describe("resolveAiDisclosureFlags", () => {
  test("enabled: false でも json_ld は既定で有効", () => {
    const flags = resolveAiDisclosureFlags({ enabled: false }, true);
    expect(flags.badges).toBe(false);
    expect(flags.jsonLd).toBe(true);
    expect(flags.machineReadable).toBe(true);
  });

  test("開示無しページでは json_ld も off", () => {
    const flags = resolveAiDisclosureFlags({}, false);
    expect(flags.jsonLd).toBe(false);
    expect(flags.machineReadable).toBe(false);
  });
});

describe("buildAiBadgeHtml", () => {
  test("EU バッジ HTML を生成する", () => {
    const d = parseAiDisclosure({
      digitalSourceType: "trainedAlgorithmicMedia",
    })!;
    const html = buildAiBadgeHtml(d, { lang: "en", rootPrefix: "../" });
    expect(html).toContain('class="ai-disclosure');
    expect(html).toContain("../assets/ai-labels/fully-generated.svg");
    expect(html).toContain("Fully AI-generated content");
  });

  test("showBadge false なら空", () => {
    const d = parseAiDisclosure({ digitalSourceType: "humanEdits" })!;
    expect(buildAiBadgeHtml(d, { lang: "ja", rootPrefix: "./" })).toBe("");
  });
});

describe("buildCompactAiBadgeHtml", () => {
  test("コンパクトアイコンを出力する", () => {
    const d = parseAiDisclosure({
      digitalSourceType: "compositeWithTrainedAlgorithmicMedia",
    })!;
    const html = buildCompactAiBadgeHtml(d, { rootPrefix: "../../" });
    expect(html).toContain('class="ai-disclosure-compact"');
    expect(html).toContain("../../assets/ai-labels/partially-modified.svg");
  });
});