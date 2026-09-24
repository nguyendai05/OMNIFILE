import type { ExtractedTable, PdfTextItem } from "../core/types.ts";

export function clusterRows(items: PdfTextItem[], yTol = 3.5): PdfTextItem[][] {
  const sorted = items
    .filter((i) => i.str.trim() && [i.x, i.y, i.w, i.h].every(Number.isFinite))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: {
    items: PdfTextItem[];
    base: PdfTextItem;
    paint: Map<string, PdfTextItem[]>;
  }[] = [];
  for (const item of sorted) {
    let target: (typeof rows)[number] | undefined;
    // Only nearby baselines can match. Avoid an all-rows scan on dense pages.
    for (let r = rows.length - 1; r >= 0; r--) {
      const row = rows[r]!;
      const base = row.base;
      const delta = Math.abs(base.y - item.y);
      if (base.y - item.y > Math.max(24, item.h * 2, base.h * 2)) break;
      const sameBaseline = delta <= Math.min(yTol, Math.max(1, Math.min(base.h, item.h) * 0.3));
      const script =
        !sameBaseline &&
        Math.min(base.h, item.h) < Math.max(base.h, item.h) * 0.8 &&
        delta <= Math.max(base.h, item.h) * 0.65 &&
        row.items.some(
          (other) =>
            Math.min(Math.abs(item.x - other.x - other.w), Math.abs(other.x - item.x - item.w)) <
            Math.max(base.h, item.h),
        );
      if (sameBaseline || script) {
        target = row;
        break;
      }
    }
    if (!target) {
      target = { items: [], base: item, paint: new Map() };
      rows.push(target);
    }
    // Near-duplicate paint can cross a bucket edge; inspect both neighbours.
    // Index by text and x so fragmented lines do not scan every earlier glyph.
    const bucket = Math.floor(item.x * 2);
    let duplicate = false;
    for (let offset = -1; offset <= 1 && !duplicate; offset++) {
      duplicate =
        target.paint.get(`${item.str}\0${bucket + offset}`)?.some(
          (other) =>
            Math.abs(other.x - item.x) < 0.5 &&
            Math.abs(other.y - item.y) < 0.5 &&
            Math.abs(other.w - item.w) < 0.5 &&
            Math.abs(other.h - item.h) < 0.5,
        ) ?? false;
    }
    if (duplicate) continue;
    target.items.push(item);
    if (item.h > target.base.h) target.base = item;
    const key = `${item.str}\0${bucket}`;
    const painted = target.paint.get(key);
    if (painted) painted.push(item);
    else target.paint.set(key, [item]);
  }
  return rows.map((row) => row.items.sort((a, b) => a.x - b.x));
}

export function textSeparator(item: PdfTextItem, next?: PdfTextItem): string {
  if (!next || /\s$/.test(item.str) || /^\s/.test(next.str)) return "";
  const gap = next.x - item.x - item.w;
  return gap > Math.max(0.5, Math.min(item.h, next.h) * 0.12) ? " " : "";
}

export function joinPdfText(items: PdfTextItem[]): string {
  return items
    .map((item, i) => item.str + textSeparator(item, items[i + 1]))
    .join("")
    .trim();
}

/** A font/style change is a fragment, not a column boundary. */
export function splitRowCells(row: PdfTextItem[]): PdfTextItem[][] {
  const cells: PdfTextItem[][] = [];
  for (const item of row) {
    const last = cells[cells.length - 1];
    const previous = last?.[last.length - 1];
    if (
      !previous ||
      item.x - previous.x - previous.w > Math.max(12, Math.max(item.h, previous.h) * 1.2)
    )
      cells.push([item]);
    else last!.push(item);
  }
  return cells;
}

export function extractTablesFromItems(items: PdfTextItem[], page: number): ExtractedTable[] {
  const rows = clusterRows(items).map((items) => {
    const base = items.reduce((a, b) => (a.h >= b.h ? a : b));
    return { items, cells: splitRowCells(items), y: base.y, h: base.h };
  });
  const tables: ExtractedTable[] = [];
  for (let i = 0; i < rows.length;) {
    const seed = rows[i]!;
    if (seed.cells.length < 2) {
      i++;
      continue;
    }
    const anchors = seed.cells.map((cell) => ({
      left: cell[0]!.x,
      right: Math.max(...cell.map((c) => c.x + c.w)),
    }));
    const matrix = [seed.cells];
    let j = i + 1;
    for (; j < rows.length; j++) {
      const row = rows[j]!;
      if (rows[j - 1]!.y - row.y > Math.max(24, seed.h * 2.4) || row.cells.length > anchors.length)
        break;
      if (row.cells.length < 2 && matrix.length < 2) break;
      const aligned: PdfTextItem[][] = anchors.map(() => []);
      let valid = true;
      for (const cell of row.cells) {
        const left = cell[0]!.x;
        const right = Math.max(...cell.map((c) => c.x + c.w));
        const col = anchors.findIndex((a, c) => {
          const laneLeft = c ? (anchors[c - 1]!.right + a.left) / 2 : a.left - 8;
          const laneRight =
            c + 1 < anchors.length
              ? (a.right + anchors[c + 1]!.left) / 2
              : Math.max(a.right, right);
          const edgeAligned =
            Math.min(Math.abs(left - a.left), Math.abs(right - a.right)) <=
            Math.max(8, seed.h * 0.8);
          // Headers often align left while amounts align right within the same whitespace lane.
          return (
            left >= laneLeft &&
            right <= laneRight &&
            (edgeAligned || row.cells.length === anchors.length)
          );
        });
        if (col < 0 || aligned[col]!.length) {
          valid = false;
          break;
        }
        aligned[col] = cell;
      }
      if (!valid) break;
      matrix.push(aligned);
    }
    const longCells = matrix.flat().filter((c) => {
      const text = joinPdfText(c);
      return text.length > 45 || (text.length > 28 && text.split(/\s+/).length >= 6);
    }).length;
    // Dense prose in parallel columns should stay in reading order, not become data rows.
    if (matrix.length >= 2 && longCells < matrix.length * anchors.length * 0.6) {
      const all = matrix.flat(2);
      const left = Math.min(...all.map((c) => c.x));
      const right = Math.max(...all.map((c) => c.x + c.w));
      const starts = anchors.map((a, col) =>
        Math.min(a.left, ...matrix.flatMap((r) => r[col]!.map((c) => c.x))),
      );
      tables.push({
        index: tables.length,
        page,
        headers: matrix[0]!.map(joinPdfText),
        rows: matrix.slice(1).map((r) => r.map(joinPdfText)),
        confidence: Math.min(0.98, 0.65 + matrix.length * 0.05),
        bounds: { top: seed.y, bottom: rows[j - 1]!.y, left, right },
        columnBounds: starts.map((start, col) => ({
          left: start,
          right: starts[col + 1] ?? right,
        })),
        cellItems: matrix,
      });
      i = j;
    } else i++;
  }
  return tables;
}
