import { describe, expect, test } from "./_expect.ts";
import { validateDisclosureFields } from "../packages/okf/src/digital-source-type.ts";

describe("validateDisclosureFields", () => {
  test("euAiLabel のみは digitalSourceType 必須", () => {
    const { issues } = validateDisclosureFields({ euAiLabel: "basic" }, true);
    expect(issues.some((i) => i.path === "digitalSourceType")).toBe(true);
  });

  test("aiSystems のみは digitalSourceType 必須", () => {
    const { issues } = validateDisclosureFields(
      { aiSystems: [{ name: "Claude" }] },
      true,
    );
    expect(issues.some((i) => i.path === "digitalSourceType")).toBe(true);
  });

  test("未知コードは strict で error", () => {
    const { issues } = validateDisclosureFields(
      { digitalSourceType: "notARealCode" },
      true,
    );
    expect(issues.some((i) => i.message.includes("unknown"))).toBe(true);
  });

  test("未知コードは non-strict で warning", () => {
    const { issues, warnings } = validateDisclosureFields(
      { digitalSourceType: "notARealCode" },
      false,
    );
    expect(issues.length).toBe(0);
    expect(warnings.some((w) => w.includes("unknown"))).toBe(true);
  });

  test("有効な開示は issue なし", () => {
    const { issues } = validateDisclosureFields(
      {
        digitalSourceType: "compositeWithTrainedAlgorithmicMedia",
        euAiLabel: "partially-modified",
        aiDisclosureNote: "Verified by author.",
      },
      true,
    );
    expect(issues.length).toBe(0);
  });
});