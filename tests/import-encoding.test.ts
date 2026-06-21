import { describe, expect, test } from "./_expect.ts";
import iconv from "iconv-lite";
import {
  decodeBytes,
  detectEncoding,
  scoreEucJp,
  scoreShiftJIS,
  scoreUtf8,
} from "../packages/core/src/import/encoding-detect.ts";
import { readImportFile } from "../packages/core/src/import/decode.ts";
import { parseXmlEncodingDeclaration, normalizeEncodingLabel } from "../packages/core/src/import/xml-encoding.ts";

describe("detectEncoding", () => {
  test("empty input → unknown", () => {
    const r = detectEncoding(new Uint8Array(0));
    expect(r.encoding).toBe("unknown");
    expect(r.confidence).toBe(0);
  });

  test("pure ASCII", () => {
    const r = detectEncoding(new TextEncoder().encode("Hello, world!\n"));
    expect(r.encoding).toBe("ASCII");
    expect(r.confidence).toBe(1.0);
  });

  test("UTF-8 BOM", () => {
    const r = detectEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]));
    expect(r.encoding).toBe("UTF-8");
    expect(r.bomBytes).toBe(3);
  });

  test("valid UTF-8 Japanese", () => {
    const r = detectEncoding(new TextEncoder().encode("漢字テスト"));
    expect(r.encoding).toBe("UTF-8");
    expect(r.confidence >= 0.8).toBe(true);
  });

  test("Shift_JIS encoded text", () => {
    const sjis = new Uint8Array([0x8a, 0xbf, 0x8e, 0x9a]);
    const r = detectEncoding(sjis);
    expect(r.encoding).toBe("Shift_JIS");
    expect(r.confidence > 0.5).toBe(true);
  });

  test("EUC-JP encoded text", () => {
    const euc = iconv.encode("日本語", "EUC-JP");
    const r = detectEncoding(new Uint8Array(euc));
    expect(r.encoding).toBe("EUC-JP");
    expect(r.confidence > 0.5).toBe(true);
  });
});

describe("scoreUtf8", () => {
  test("valid multibyte → 1.0", () => {
    expect(scoreUtf8(new TextEncoder().encode("日本語"))).toBe(1.0);
  });
});

describe("scoreShiftJIS", () => {
  test("valid double-byte", () => {
    const sjis = new Uint8Array([0x82, 0xa0, 0x82, 0xa2]);
    expect(scoreShiftJIS(sjis) > 0.5).toBe(true);
  });
});

describe("scoreEucJp", () => {
  test("valid EUC-JP", () => {
    const euc = iconv.encode("あい", "EUC-JP");
    expect(scoreEucJp(new Uint8Array(euc)) > 0.5).toBe(true);
  });
});

describe("decodeBytes", () => {
  test("Shift_JIS decoding via iconv-lite", () => {
    const bytes = iconv.encode("あ", "Shift_JIS");
    expect(decodeBytes(new Uint8Array(bytes), "Shift_JIS")).toBe("あ");
  });

  test("EUC-JP decoding via iconv-lite", () => {
    const bytes = iconv.encode("漢字", "EUC-JP");
    expect(decodeBytes(new Uint8Array(bytes), "EUC-JP")).toBe("漢字");
  });
});

describe("xml encoding declaration", () => {
  test("parses UTF-8 declaration", () => {
    const bytes = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?>');
    expect(parseXmlEncodingDeclaration(bytes)).toBe("UTF-8");
    expect(normalizeEncodingLabel("UTF-8")).toBe("UTF-8");
  });

  test("parses Shift_JIS declaration", () => {
    expect(normalizeEncodingLabel("Shift_JIS")).toBe("Shift_JIS");
    expect(normalizeEncodingLabel("euc-jp")).toBe("EUC-JP");
  });
});