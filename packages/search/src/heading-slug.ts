/** 見出しテキスト → アンカー id 用 slug（ページ内重複は連番）。 */

export function slugifyHeading(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\w぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "section";
}

export class SlugLedger {
  private readonly used = new Map<string, number>();

  next(text: string): string {
    const base = slugifyHeading(text);
    const count = this.used.get(base) ?? 0;
    this.used.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  }
}