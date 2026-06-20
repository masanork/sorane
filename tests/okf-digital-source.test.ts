import { describe, expect, test } from "./_expect.ts";
import {
  inferEuLabel,
  resolveDigitalSourceType,
  showsEuBadge,
} from "../packages/okf/src/digital-source-type.ts";

describe("resolveDigitalSourceType", () => {
  test("短コードを IPTC URI に解決する", () => {
    const r = resolveDigitalSourceType("trainedAlgorithmicMedia");
    expect(r?.code).toBe("trainedAlgorithmicMedia");
    expect(r?.uri).toBe(
      "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
    );
  });

  test("フル URI を受け付ける", () => {
    const r = resolveDigitalSourceType(
      "http://cv.iptc.org/newscodes/digitalsourcetype/humanEdits",
    );
    expect(r?.code).toBe("humanEdits");
  });

  test("retired alias を正規化する", () => {
    const r = resolveDigitalSourceType("digitalArt");
    expect(r?.code).toBe("digitalCreation");
    expect((r?.warnings.length ?? 0) > 0).toBe(true);
  });

  test("未知コードは null", () => {
    expect(resolveDigitalSourceType("unknownCode")).toBe(null);
  });
});

describe("inferEuLabel", () => {
  test("コードから EU ラベルを推論する", () => {
    expect(inferEuLabel("trainedAlgorithmicMedia")).toBe("fully-generated");
    expect(inferEuLabel("humanEdits")).toBe(undefined);
  });

  test("override を優先する", () => {
    expect(inferEuLabel("humanEdits", "basic")).toBe("basic");
  });
});

describe("showsEuBadge", () => {
  test("override があれば常に true", () => {
    expect(showsEuBadge("humanEdits", "basic")).toBe(true);
  });

  test("推論可能なコードのみ true", () => {
    expect(showsEuBadge("compositeSynthetic")).toBe(true);
    expect(showsEuBadge("algorithmicMedia")).toBe(false);
  });
});