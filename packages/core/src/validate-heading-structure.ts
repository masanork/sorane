const FENCE_OPEN_RE = /^(```+|~~~+)/;
const HEADING_RE = /^(#{1,6})\s+/;

/** Markdown 本文の見出し階層を検査する（warning のみ）。 */
export function validateHeadingWarnings(body: string): readonly string[] {
  const warnings: string[] = [];
  const lines = body.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = "";
  let prevLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = FENCE_OPEN_RE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (line.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;

    const hm = HEADING_RE.exec(line);
    if (!hm) continue;
    const level = hm[1]!.length;
    const lineNo = i + 1;

    if (level === 1) {
      warnings.push(
        `heading: h1 in body (line ${lineNo}); page title is already rendered as h1`,
      );
    }
    if (prevLevel === 0 && level >= 3) {
      warnings.push(
        `heading: first heading in body is h${level} (line ${lineNo}); prefer starting with h2`,
      );
    } else if (prevLevel > 0 && level > prevLevel + 1) {
      warnings.push(
        `heading: skip from h${prevLevel} to h${level} (line ${lineNo})`,
      );
    }
    prevLevel = level;
  }

  return warnings;
}