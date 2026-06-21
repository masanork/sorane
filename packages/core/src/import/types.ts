/** Detected encoding and confidence (gjs txtbin-compatible). */
export interface EncodingResult {
  readonly encoding: EncodingName;
  readonly confidence: number;
  readonly bomBytes: number;
  readonly bom?: string;
}

export type EncodingName =
  | 'UTF-8'
  | 'UTF-16LE'
  | 'UTF-16BE'
  | 'UTF-32LE'
  | 'UTF-32BE'
  | 'Shift_JIS'
  | 'EUC-JP'
  | 'ASCII'
  | 'unknown';

export type ImportFormatId = 'mt' | 'hatena-diary' | 'wordpress' | 'unknown';

/** Normalized blog post from an export adapter. */
export interface ImportEntry {
  readonly sourceId: string;
  readonly title: string;
  readonly timestamp: string;
  readonly status: 'publish' | 'draft';
  readonly categories?: readonly string[];
  readonly body: string;
}

export interface DecodedImportFile {
  readonly text: string;
  readonly encoding: EncodingName;
  readonly confidence: number;
  readonly bomBytes: number;
}

export interface ImportManifestEntry {
  readonly sourceId: string;
  readonly relPath: string;
  readonly encoding: EncodingName;
  readonly importedAt: string;
}

export interface ImportManifest {
  readonly version: 1;
  readonly entries: readonly ImportManifestEntry[];
}