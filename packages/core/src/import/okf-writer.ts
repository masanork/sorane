import { conceptToOkfMarkdown } from '@sorane/okf';
import type { ImportEntry } from './types.ts';

/** Build content-relative path for an imported article. */
export function importEntryRelPath(entry: ImportEntry): string {
  const date = entry.timestamp.slice(0, 10);
  const slug = slugFromTitle(entry.title);
  return `${date}${slug.length > 0 ? `-${slug}` : ''}.md`;
}

function slugFromTitle(title: string): string {
  return title
    .replace(/[^\w\s\u3040-\u30ff\u4e00-\u9fff-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 40);
}

/** Convert ImportEntry to OKF native markdown. */
export function importEntryToOkfMarkdown(entry: ImportEntry, profile = 'sorane-okf/0.1'): string {
  return conceptToOkfMarkdown({
    type: 'article',
    title: entry.title,
    timestamp: entry.timestamp,
    profile,
    tags: entry.categories ? [...entry.categories] : undefined,
    frontmatter: {},
    body: entry.body,
    warnings: [],
  });
}