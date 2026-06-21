import type { ImportEntry } from '../types.ts';

export interface ParseMtExportOptions {
  readonly skipDrafts?: boolean;
}

/** Parse Movable Type export text into import entries (srn importMT port). */
export function parseMtExport(text: string, opts?: ParseMtExportOptions): ImportEntry[] {
  const skipDrafts = opts?.skipDrafts !== false;
  const entries: ImportEntry[] = [];
  const chunks = text.split('--------\n');

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]!;
    if (!chunk.trim()) continue;

    const blocks = chunk.split('-----\n');
    const headerBlock = blocks[0] ?? '';

    const metadata: Record<string, string> = {};
    for (const line of headerBlock.split('\n')) {
      const match = line.match(/^([^:]+): (.*)$/);
      if (match) metadata[match[1]!.trim()] = match[2]!.trim();
    }

    const statusRaw = metadata.STATUS ?? 'Publish';
    const status = statusRaw === 'Publish' ? 'publish' : 'draft';
    if (skipDrafts && status !== 'publish') continue;

    let body = '';
    let extended = '';
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i]!;
      if (block.startsWith('BODY:')) body = block.slice(5).trim();
      else if (block.startsWith('EXTENDED BODY:')) extended = block.slice(14).trim();
    }

    const title = metadata.TITLE ?? 'Untitled';
    const timestamp = parseMtDate(metadata.DATE);
    const sourceId = metadata['PRIMARY KEY'] ?? metadata['BASENAME'] ?? `mt:${index}:${title}`;

    const categories = metadata.CATEGORY
      ? metadata.CATEGORY.split(',').map((c) => c.trim()).filter((c) => c.length > 0)
      : undefined;

    entries.push({
      sourceId,
      title,
      timestamp,
      status,
      categories,
      body: (body + (extended.length > 0 ? `\n\n${extended}` : '')).trim(),
    });
  }

  return entries;
}

function parseMtDate(raw: string | undefined): string {
  if (raw === undefined || raw.length === 0) {
    return new Date().toISOString();
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}