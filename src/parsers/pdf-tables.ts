import type { ExtractedTable, PdfTextItem } from "../core/types.ts";

export function clusterRows(items: PdfTextItem[], yTol = 3.5): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  for (const item of sorted) {
    if (!item.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r[0]!.y - item.y) <= yTol);
    if (row) row.push(item);
    else rows.push([item]);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

function alignRow(row: PdfTextItem[], colXs: number[]): string[] {
  const cells = colXs.map(() => "");
  for (const item of row) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < colXs.length; i++) {
      const d = Math.abs(item.x - colXs[i]!);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    cells[best] = cells[best] ? `${cells[best]} ${item.str}` : item.str;
  }
  return cells.map((c) => c.trim());
}

export function extractTablesFromItems(items: PdfTextItem[], page: number): ExtractedTable[] {
  const rows = clusterRows(items);
  const structured = rows.map((r) => ({
    items: r,
    xs: r.map((i) => i.x),
    count: r.length,
    y: r[0]?.y ?? 0,
  }));
  const tables: ExtractedTable[] = [];
  let i = 0;
  while (i < structured.length) {
    if (structured[i]!.count < 2) {
      i++;
      continue;
    }
    const colXs = structured[i]!.xs;
    let j = i + 1;
    while (j < structured.length) {
      const row = structured[j]!;
      if (row.count < 2) break;
      if (Math.abs(structured[j - 1]!.y - row.y) > 42) break;
      const aligned = row.xs.filter((x) => colXs.some((cx) => Math.abs(cx - x) < 18)).length;
      if (aligned < Math.min(2, colXs.length - 1)) break;
      j++;
    }
    if (j - i >= 2 && colXs.length >= 2) {
      const slice = structured.slice(i, j);
      const headers = alignRow(slice[0]!.items, colXs);
      const body = slice.slice(1).map((r) => alignRow(r.items, colXs));
      const filled = body.filter((r) => r.some(Boolean)).length;
      if (filled >= 1) {
        tables.push({
          index: tables.length,
          page,
          headers,
          rows: body,
          confidence: Math.min(1, 0.5 + filled / 10),
          bounds: { top: slice[0]!.y, bottom: slice[slice.length - 1]!.y },
        });
      }
      i = j;
    } else {
      i++;
    }
  }
  return tables;
}
