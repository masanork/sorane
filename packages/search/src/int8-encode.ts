/** Scale for hybrid `search-index.json` int8 vectors (must match Rust `INT8_SCALE`). */
export const INT8_SCALE = 127;

/** Quantize one normalized embedding dimension to int8 (clamp ±127). */
export function quantizeEmbeddingComponent(value: number): number {
  const q = Math.round(value * INT8_SCALE);
  if (q < -127) return -127;
  if (q > 127) return 127;
  return q;
}

/** Quantize a full embedding vector to int8. */
export function quantizeEmbeddingVector(vec: readonly number[], dim: number): Int8Array {
  if (vec.length !== dim) {
    throw new Error(`dimension mismatch: ${vec.length} != ${dim}`);
  }
  const out = new Int8Array(dim);
  for (let j = 0; j < dim; j++) {
    out[j] = quantizeEmbeddingComponent(vec[j]!);
  }
  return out;
}

/** Pack row-major int8 vectors and return base64 (browser + native export contract). */
export function encodeInt8VectorsB64(vectors: readonly (readonly number[])[], dim: number): string {
  const buf = new Int8Array(vectors.length * dim);
  for (let i = 0; i < vectors.length; i++) {
    const row = quantizeEmbeddingVector(vectors[i]!, dim);
    buf.set(row, i * dim);
  }
  return Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString("base64");
}

/** Decode base64 int8 blob to per-chunk float vectors in [-1, 1]. */
export function decodeInt8VectorsB64(b64: string, dim: number): number[][] {
  const buf = Buffer.from(b64, "base64");
  const arr = new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  if (arr.length % dim !== 0) {
    throw new Error(`int8 blob length ${arr.length} is not a multiple of dim ${dim}`);
  }
  const chunks = arr.length / dim;
  const out: number[][] = [];
  for (let c = 0; c < chunks; c++) {
    const vec = new Array<number>(dim);
    for (let j = 0; j < dim; j++) {
      vec[j] = arr[c * dim + j]! / INT8_SCALE;
    }
    out.push(vec);
  }
  return out;
}

/** Minimum cosine similarity across paired chunk vectors. */
export function minCosineSimilarity(a: readonly number[][], b: readonly number[][]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let min = 1;
  for (let i = 0; i < n; i++) {
    const va = a[i]!;
    const vb = b[i]!;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let j = 0; j < va.length; j++) {
      dot += va[j]! * vb[j]!;
      na += va[j]! * va[j]!;
      nb += vb[j]! * vb[j]!;
    }
    const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
    if (cos < min) min = cos;
  }
  return min;
}