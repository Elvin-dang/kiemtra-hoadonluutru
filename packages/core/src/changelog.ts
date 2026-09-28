export type ChangelogEntry = { version: string; date: string; items: string[] };

const HEADING = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.*))?$/;
const ITEM = /^[-*]\s+(.+)$/;

// Bullet lines ("- Sửa lỗi…") of a release body or changelog section.
export function noteItems(text: string): string[] {
  return text.split(/\r?\n/).flatMap((line) => ITEM.exec(line.trim())?.[1] ?? []);
}

// "## 1.1.0 — 2026-09-28" headings, each followed by "- item" lines; newest first as written.
export function parseChangelog(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = HEADING.exec(line.trim());
    if (heading) entries.push({ version: heading[1], date: heading[2]?.trim() ?? "", items: [] });
    else entries.at(-1)?.items.push(...noteItems(line));
  }
  return entries;
}
