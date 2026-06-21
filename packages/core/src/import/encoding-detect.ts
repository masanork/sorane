/**
 * Encoding detection for import files.
 * Ported from gjs txtbin (~/repo/gjs/src/shared/txtbin/encoding-detect.ts, MIT).
 * Extended with EUC-JP heuristic for sorane blog import.
 */

import iconv from 'iconv-lite';
import type { EncodingResult, EncodingName } from './types.ts';

/** Detect encoding from raw bytes */
export function detectEncoding(data: Uint8Array): EncodingResult {
  if (data.length === 0) {
    return { encoding: 'unknown', confidence: 0, bomBytes: 0 };
  }

  const bom = detectBOM(data);
  if (bom) return bom;

  if (isAscii(data)) {
    return { encoding: 'ASCII', confidence: 1.0, bomBytes: 0 };
  }

  const utf8Score = scoreUtf8(data);
  const sjisScore = scoreShiftJIS(data);
  const eucScore = scoreEucJp(data);

  const best = [
    { encoding: 'UTF-8' as const, score: utf8Score },
    { encoding: 'Shift_JIS' as const, score: sjisScore },
    { encoding: 'EUC-JP' as const, score: eucScore },
  ].sort((a, b) => b.score - a.score)[0]!;

  if (best.score >= 0.6) {
    return { encoding: best.encoding, confidence: best.score, bomBytes: 0 };
  }

  if (utf8Score > 0) {
    return { encoding: 'UTF-8', confidence: utf8Score, bomBytes: 0 };
  }

  return { encoding: 'unknown', confidence: 0, bomBytes: 0 };
}

function detectBOM(data: Uint8Array): EncodingResult | null {
  if (data.length < 2) return null;

  if (data.length >= 4) {
    if (data[0] === 0x00 && data[1] === 0x00 && data[2] === 0xfe && data[3] === 0xff) {
      return { encoding: 'UTF-32BE', confidence: 1.0, bomBytes: 4, bom: 'UTF-32BE BOM' };
    }
    if (data[0] === 0xff && data[1] === 0xfe && data[2] === 0x00 && data[3] === 0x00) {
      return { encoding: 'UTF-32LE', confidence: 1.0, bomBytes: 4, bom: 'UTF-32LE BOM' };
    }
  }

  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return { encoding: 'UTF-8', confidence: 1.0, bomBytes: 3, bom: 'UTF-8 BOM' };
  }

  if (data[0] === 0xfe && data[1] === 0xff) {
    return { encoding: 'UTF-16BE', confidence: 1.0, bomBytes: 2, bom: 'UTF-16BE BOM' };
  }
  if (data[0] === 0xff && data[1] === 0xfe) {
    return { encoding: 'UTF-16LE', confidence: 1.0, bomBytes: 2, bom: 'UTF-16LE BOM' };
  }

  return null;
}

function isAscii(data: Uint8Array): boolean {
  for (let i = 0; i < data.length; i++) {
    const b = data[i] ?? 0;
    if (b > 0x7e) return false;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return false;
  }
  return true;
}

/** Score how likely the data is valid UTF-8 (0.0–1.0) */
export function scoreUtf8(data: Uint8Array): number {
  let i = 0;
  let totalMultibyte = 0;
  let invalidSequences = 0;

  while (i < data.length) {
    const b = data[i] ?? 0;

    if (b < 0x80) {
      i++;
      continue;
    }

    totalMultibyte++;
    const seqLen = utf8SequenceLength(b);

    if (seqLen === 0) {
      invalidSequences++;
      i++;
      continue;
    }

    if (i + seqLen > data.length) {
      invalidSequences++;
      break;
    }

    let valid = true;
    for (let j = 1; j < seqLen; j++) {
      if (((data[i + j] ?? 0) & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
    }

    if (!valid) {
      invalidSequences++;
      i++;
      continue;
    }

    const cp = decodeUtf8Codepoint(data, i, seqLen);
    if (cp !== null && isOverlong(cp, seqLen)) {
      invalidSequences++;
      i++;
      continue;
    }

    i += seqLen;
  }

  if (totalMultibyte === 0) return 1.0;
  if (invalidSequences === 0) return 1.0;
  return Math.max(0, 1.0 - invalidSequences / totalMultibyte);
}

function utf8SequenceLength(leadByte: number): number {
  if ((leadByte & 0x80) === 0) return 1;
  if ((leadByte & 0xe0) === 0xc0) return 2;
  if ((leadByte & 0xf0) === 0xe0) return 3;
  if ((leadByte & 0xf8) === 0xf0) return 4;
  return 0;
}

function decodeUtf8Codepoint(data: Uint8Array, offset: number, seqLen: number): number | null {
  const b0 = data[offset] ?? 0;
  if (seqLen === 2) return ((b0 & 0x1f) << 6) | ((data[offset + 1] ?? 0) & 0x3f);
  if (seqLen === 3) {
    return (
      ((b0 & 0x0f) << 12) |
      (((data[offset + 1] ?? 0) & 0x3f) << 6) |
      ((data[offset + 2] ?? 0) & 0x3f)
    );
  }
  if (seqLen === 4) {
    return (
      ((b0 & 0x07) << 18) |
      (((data[offset + 1] ?? 0) & 0x3f) << 12) |
      (((data[offset + 2] ?? 0) & 0x3f) << 6) |
      ((data[offset + 3] ?? 0) & 0x3f)
    );
  }
  return null;
}

function isOverlong(codepoint: number, seqLen: number): boolean {
  if (seqLen === 2 && codepoint < 0x80) return true;
  if (seqLen === 3 && codepoint < 0x800) return true;
  if (seqLen === 4 && codepoint < 0x10000) return true;
  return false;
}

/** Score how likely the data is valid Shift-JIS (0.0–1.0) */
export function scoreShiftJIS(data: Uint8Array): number {
  let i = 0;
  let validDouble = 0;
  let totalNonAscii = 0;
  let invalidSequences = 0;

  while (i < data.length) {
    const b = data[i] ?? 0;

    if (b < 0x80) {
      i++;
      continue;
    }

    if (b >= 0xa1 && b <= 0xdf) {
      totalNonAscii++;
      validDouble++;
      i++;
      continue;
    }

    totalNonAscii++;

    if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)) {
      if (i + 1 >= data.length) {
        invalidSequences++;
        break;
      }
      const b2 = data[i + 1] ?? 0;
      if ((b2 >= 0x40 && b2 <= 0x7e) || (b2 >= 0x80 && b2 <= 0xfc)) {
        validDouble++;
        i += 2;
        continue;
      }
    }

    invalidSequences++;
    i++;
  }

  if (totalNonAscii === 0) return 0;
  if (invalidSequences === 0 && validDouble > 0) return 0.9;
  return Math.max(0, validDouble / totalNonAscii - 0.1 * invalidSequences / totalNonAscii);
}

/** Score how likely the data is valid EUC-JP (0.0–1.0) */
export function scoreEucJp(data: Uint8Array): number {
  let i = 0;
  let valid = 0;
  let totalNonAscii = 0;
  let invalid = 0;

  while (i < data.length) {
    const b = data[i] ?? 0;
    if (b < 0x80) {
      i++;
      continue;
    }

    totalNonAscii++;

    if (b === 0x8e) {
      if (i + 1 >= data.length) {
        invalid++;
        break;
      }
      const b2 = data[i + 1] ?? 0;
      if (b2 >= 0xa1 && b2 <= 0xdf) {
        valid++;
        i += 2;
        continue;
      }
      invalid++;
      i++;
      continue;
    }

    if (b === 0x8f) {
      if (i + 2 >= data.length) {
        invalid++;
        break;
      }
      const b2 = data[i + 1] ?? 0;
      const b3 = data[i + 2] ?? 0;
      if (b2 >= 0xa1 && b2 <= 0xfe && b3 >= 0xa1 && b3 <= 0xfe) {
        valid++;
        i += 3;
        continue;
      }
      invalid++;
      i++;
      continue;
    }

    if (b >= 0xa1 && b <= 0xfe) {
      if (i + 1 >= data.length) {
        invalid++;
        break;
      }
      const b2 = data[i + 1] ?? 0;
      if (b2 >= 0xa1 && b2 <= 0xfe) {
        valid++;
        i += 2;
        continue;
      }
    }

    invalid++;
    i++;
  }

  if (totalNonAscii === 0) return 0;
  if (invalid === 0 && valid > 0) return 0.9;
  return Math.max(0, valid / totalNonAscii - 0.1 * invalid / totalNonAscii);
}

/** Decode bytes according to encoding, returning UTF-16 string */
export function decodeBytes(data: Uint8Array, encoding: EncodingName, bomBytes: number = 0): string {
  const payload = bomBytes > 0 ? data.slice(bomBytes) : data;

  switch (encoding) {
    case 'UTF-8':
    case 'ASCII':
      return new TextDecoder('utf-8', { fatal: false }).decode(payload);

    case 'UTF-16LE':
      return new TextDecoder('utf-16le', { fatal: false }).decode(payload);

    case 'UTF-16BE':
      return new TextDecoder('utf-16be', { fatal: false }).decode(payload);

    case 'UTF-32LE':
      return decodeUtf32(payload, true);

    case 'UTF-32BE':
      return decodeUtf32(payload, false);

    case 'Shift_JIS':
    case 'EUC-JP':
      return decodeLegacyJapanese(payload, encoding);

    default:
      return new TextDecoder('utf-8', { fatal: false }).decode(payload);
  }
}

function decodeLegacyJapanese(data: Uint8Array, encoding: 'Shift_JIS' | 'EUC-JP'): string {
  const label = encoding === 'Shift_JIS' ? 'Shift_JIS' : 'EUC-JP';
  return iconv.decode(Buffer.from(data), label);
}

function decodeUtf32(data: Uint8Array, littleEndian: boolean): string {
  const chars: string[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let i = 0; i + 3 < data.length; i += 4) {
    const cp = view.getUint32(i, littleEndian);
    if (cp <= 0x10ffff) {
      chars.push(String.fromCodePoint(cp));
    } else {
      chars.push('\uFFFD');
    }
  }

  return chars.join('');
}