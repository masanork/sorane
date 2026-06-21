import { readFileSync } from 'node:fs';
import { detectEncoding, decodeBytes } from './encoding-detect.ts';
import type { DecodedImportFile, EncodingName } from './types.ts';
import { normalizeEncodingLabel, parseXmlEncodingDeclaration } from './xml-encoding.ts';

export type EncodingHint = EncodingName | 'auto';

export interface ReadImportFileOptions {
  readonly encoding?: EncodingHint;
}

/** Normalize CLI `--encoding` flag value. */
export function parseEncodingHint(value: string): EncodingHint {
  const norm = value.trim().toLowerCase().replace(/_/g, '-');
  if (norm === 'auto') return 'auto';
  const mapped = normalizeEncodingLabel(norm);
  if (mapped) return mapped;
  throw new Error(`unsupported --encoding: ${value} (use auto, utf-8, shift_jis, euc-jp)`);
}

/** Read an export file to UTF-8 string with detected metadata. */
export function readImportFile(path: string, opts?: ReadImportFileOptions): DecodedImportFile {
  const bytes = readFileSync(path);
  const data = new Uint8Array(bytes);

  if (opts?.encoding !== undefined && opts.encoding !== 'auto') {
    const text = decodeBytes(data, opts.encoding, detectEncoding(data).bomBytes);
    return {
      text,
      encoding: opts.encoding,
      confidence: 1,
      bomBytes: detectEncoding(data).bomBytes,
    };
  }

  const bomResult = detectEncoding(data);
  if (bomResult.bomBytes > 0) {
    return {
      text: decodeBytes(data, bomResult.encoding, bomResult.bomBytes),
      encoding: bomResult.encoding,
      confidence: bomResult.confidence,
      bomBytes: bomResult.bomBytes,
    };
  }

  const xmlLabel = parseXmlEncodingDeclaration(data);
  if (xmlLabel !== undefined) {
    const mapped = normalizeEncodingLabel(xmlLabel);
    if (mapped !== undefined) {
      return {
        text: decodeBytes(data, mapped, 0),
        encoding: mapped,
        confidence: 0.95,
        bomBytes: 0,
      };
    }
  }

  const detected = detectEncoding(data);
  return {
    text: decodeBytes(data, detected.encoding, detected.bomBytes),
    encoding: detected.encoding,
    confidence: detected.confidence,
    bomBytes: detected.bomBytes,
  };
}