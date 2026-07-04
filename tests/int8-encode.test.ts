import { describe, expect, test } from "./_expect.ts";
import {
  decodeInt8VectorsB64,
  encodeInt8VectorsB64,
  minCosineSimilarity,
  quantizeEmbeddingComponent,
  quantizeEmbeddingVector,
  INT8_SCALE,
} from "../packages/search/src/int8-encode.ts";

describe("int8-encode", () => {
  test("quantize matches web-export reference values", () => {
    expect(quantizeEmbeddingComponent(0.1)).toBe(Math.round(0.1 * INT8_SCALE));
    expect(quantizeEmbeddingComponent(-1.0)).toBe(-127);
    expect(quantizeEmbeddingComponent(1.5)).toBe(127);
  });

  test("round-trip base64 pack", () => {
    const b64 = encodeInt8VectorsB64(
      [
        [0.1, 0.2],
        [-0.5, 0.0],
      ],
      2,
    );
    const decoded = decodeInt8VectorsB64(b64, 2);
    expect(decoded.length).toBe(2);
    expect(Math.abs(decoded[0]![0]! - 0.1) < 0.02).toBe(true);
    expect(Math.abs(decoded[1]![0]! - -0.5) < 0.02).toBe(true);
  });

  test("minCosineSimilarity across chunks", () => {
    const a = [
      [1, 0],
      [0, 1],
    ];
    const b = [
      [1, 0],
      [0, 0.99],
    ];
    expect(minCosineSimilarity(a, b) >= 0.98).toBe(true);
  });
});