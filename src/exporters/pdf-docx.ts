import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  SectionType,
  PageOrientation,
  AlignmentType,
  LineRuleType,
  TableLayoutType,
  BorderStyle,
  TabStopType,
} from "docx";
import type { PdfDocument, PdfPageModel, PdfTextItem, ExtractedTable } from "../core/types.ts";
import { OmniError, throwIfAborted } from "../core/errors.ts";
import { clusterRows, splitRowCells, textSeparator } from "../parsers/pdf-tables.ts";
import { wordFont } from "../parsers/pdf-text.ts";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function parsePageRange(value: string, pageCount: number): number[] {
  const invalid = () =>
    new OmniError("ExportFailure", "Phạm vi trang không hợp lệ. Ví dụ: 1-3, 5.");
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) throw invalid();
  if (!value.trim()) return Array.from({ length: pageCount }, (_, i) => i);
  const selected = new Set<number>();
  for (const part of value.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw invalid();
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > pageCount) throw invalid();
    for (let page = start; page <= end; page++) selected.add(page - 1);
  }
  return [...selected].sort((a, b) => a - b);
}

function cleanText(text: string): string {
  // XML 1.0 forbids these control characters even when escaped.
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "");
}

const twips = (points: number) => Math.round(Math.max(0, points) * 20);
const fontSize = (item: PdfTextItem) => Math.min(400, Math.max(1, item.h || 11));
const noBorder = { style: BorderStyle.NIL, size: 0, color: "auto" };
const noBorders = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder,
  insideHorizontal: noBorder,
  insideVertical: noBorder,
};
type Region = { left: number; right: number };
type Block = Paragraph | Table;

function lineGeometry(items: PdfTextItem[]) {
  const base = items.reduce((a, b) => (a.h >= b.h ? a : b));
  const h = fontSize(base);
  const ascent = Number.isFinite(base.ascent) ? Math.min(1.5, Math.max(0.5, base.ascent!)) : 0.8;
  return {
    base,
    h,
    top: base.y + h * ascent,
    left: items[0]!.x,
    right: Math.max(...items.map((i) => i.x + i.w)),
  };
}

function run(item: PdfTextItem, text: string, formatting: boolean, baseline = item.y): TextRun {
  const offset = item.y - baseline;
  return new TextRun({
    text: cleanText(text),
    font: formatting ? item.fontFamily || wordFont(item.fontName) : "Arial",
    size: formatting ? Math.round(fontSize(item) * 2) : 22,
    bold: formatting && item.bold,
    italics: formatting && item.italic,
    position: formatting && Math.abs(offset) > 1 ? `${Math.round(offset * 2) / 2}pt` : undefined,
  });
}

function lineParagraph(
  items: PdfTextItem[],
  region: Region,
  formatting: boolean,
  advance?: number,
  before = 0,
): Paragraph {
  const g = lineGeometry(items);
  const children: TextRun[] = [];
  const tabStops: { type: typeof TabStopType.LEFT; position: number }[] = [];
  items.forEach((item, i) => {
    const next = items[i + 1];
    const gap = next ? next.x - item.x - item.w : 0;
    const tab = formatting && next && gap > Math.max(12, g.h * 1.2);
    children.push(
      run(item, item.str + (tab ? "" : textSeparator(item, next)), formatting, g.base.y),
    );
    if (tab) {
      children.push(new TextRun({ text: "\t" }));
      tabStops.push({ type: TabStopType.LEFT, position: twips(next.x - region.left) });
    }
  });
  if (!formatting) return new Paragraph({ spacing: { after: 0 }, children });
  const left = Math.max(0, g.left - region.left);
  const right = Math.max(0, region.right - g.right);
  const centered = !tabStops.length && left > g.h && right > g.h && Math.abs(left - right) <= 4;
  const rightAligned = !tabStops.length && !centered && left > g.h * 2 && right <= 4;
  const natural = g.h * 1.15;
  // Keep the baseline within each line box stable; varying box heights shifts glyphs in Word.
  const line = advance && advance >= g.h * 0.9 ? Math.min(advance, natural) : natural;
  return new Paragraph({
    alignment: centered
      ? AlignmentType.CENTER
      : rightAligned
        ? AlignmentType.RIGHT
        : AlignmentType.LEFT,
    indent: centered ? undefined : rightAligned ? { right: twips(right) } : { left: twips(left) },
    tabStops,
    widowControl: false,
    spacing: {
      before: twips(before),
      after: twips(Math.max(0, (advance ?? line) - line)),
      line: twips(line),
      lineRule: LineRuleType.EXACT,
    },
    children,
  });
}

function spacer(points = 0.05): Paragraph {
  return new Paragraph({
    spacing: {
      after: 0,
      before: 0,
      line: Math.max(1, twips(points)),
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun({ text: "", size: 1 })],
  });
}

function tableItems(table: ExtractedTable, row: number, col: number): PdfTextItem[] | undefined {
  const items = table.cellItems?.[row]?.[col];
  return items?.length ? items : undefined;
}

function wordTable(table: ExtractedTable, region: Region, formatting: boolean): Table {
  const count = Math.max(table.headers.length, ...table.rows.map((r) => r.length));
  const left = formatting ? (table.bounds?.left ?? region.left) : region.left;
  const sourceRight = formatting ? (table.bounds?.right ?? region.right) : region.right;
  // Leave a small metric tolerance so Word doesn't wrap the last digit of a fitted amount.
  const right = Math.min(region.right, sourceRight + 2);
  const width = Math.max(count, right - left);
  const columns = Array.from({ length: count }, (_, col) =>
    formatting && table.columnBounds?.[col]
      ? {
          ...table.columnBounds[col]!,
          right: col === count - 1 ? right : table.columnBounds[col]!.right,
        }
      : { left: left + (col * width) / count, right: left + ((col + 1) * width) / count },
  );
  return new Table({
    width: { size: twips(width), type: WidthType.DXA },
    columnWidths: columns.map((c) => Math.max(20, twips(c.right - c.left))),
    indent: { size: twips(left - region.left), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    // Text geometry cannot establish the source's ruling; don't invent a black grid.
    borders: noBorders,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    rows: [table.headers, ...table.rows].map(
      (row, r) =>
        new TableRow({
          cantSplit: true,
          children: columns.map((column, c) => {
            const original = tableItems(table, r, c);
            const next = tableItems(table, r + 1, c);
            return new TableCell({
              width: { size: Math.max(20, twips(column.right - column.left)), type: WidthType.DXA },
              children: original
                ? [
                    lineParagraph(
                      original,
                      column,
                      formatting,
                      next ? lineGeometry(original).top - lineGeometry(next).top : undefined,
                    ),
                  ]
                : [
                    new Paragraph({
                      spacing: { after: 0 },
                      children: [new TextRun({ text: cleanText(row[c] ?? ""), size: 22 })],
                    }),
                  ],
            });
          }),
        }),
    ),
  });
}

/** Find a repeated whitespace gutter, allowing a full-width title before/after the band. */
function columnBand(
  rows: PdfTextItem[][],
  start: number,
  region: Region,
): { end: number; leftEnd: number; rightStart: number } | undefined {
  const cells = splitRowCells(rows[start]!);
  if (cells.length !== 2) return;
  const a = lineGeometry(cells[0]!);
  const b = lineGeometry(cells[1]!);
  const width = region.right - region.left;
  if (a.right - a.left < width * 0.2 || b.right - b.left < width * 0.2 || b.left - a.right < 18)
    return;
  let leftEnd = a.right;
  let rightStart = b.left;
  let both = 0;
  let end = start;
  const mid = (a.right + b.left) / 2;
  for (; end < rows.length; end++) {
    const row = rows[end]!;
    if (end > start && lineGeometry(rows[end - 1]!).base.y - lineGeometry(row).base.y > a.h * 3)
      break;
    if (row.some((i) => i.x < mid && i.x + i.w > mid)) break;
    const left = row.filter((i) => i.x + i.w <= mid);
    const right = row.filter((i) => i.x >= mid);
    const nextLeft = left.length ? Math.max(leftEnd, ...left.map((i) => i.x + i.w)) : leftEnd;
    const nextRight = right.length ? Math.min(rightStart, ...right.map((i) => i.x)) : rightStart;
    if (nextRight - nextLeft < 18) break;
    leftEnd = nextLeft;
    rightStart = nextRight;
    if (left.length && right.length) both++;
  }
  return both >= 3 ? { end, leftEnd, rightStart } : undefined;
}

function pageFlow(
  items: PdfTextItem[],
  region: Region,
  formatting: boolean,
  tables: ExtractedTable[],
  allowColumns = true,
  top?: number,
): Block[] {
  const rows = clusterRows(items);
  // A side note sharing a table baseline must never be swallowed or duplicated.
  // Keep that ambiguous region as positioned text instead of replacing only half a row.
  const safeTables = tables.filter(
    (t) =>
      t.bounds &&
      !rows.some((row) => {
        const y = lineGeometry(row).base.y;
        return (
          y <= t.bounds!.top + 3.5 &&
          y >= t.bounds!.bottom - 3.5 &&
          row.some(
            (item) =>
              item.x < (t.bounds!.left ?? -Infinity) - 1 ||
              item.x + item.w > (t.bounds!.right ?? Infinity) + 1,
          )
        );
      }),
  );
  const blocks: Block[] = [];
  const emitted = new Set<ExtractedTable>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const g = lineGeometry(row);
    const table = safeTables.find(
      (t) =>
        t.bounds &&
        g.base.y <= t.bounds.top + 3.5 &&
        g.base.y >= t.bounds.bottom - 3.5 &&
        row.every(
          (item) =>
            item.x >= (t.bounds!.left ?? -Infinity) - 1 &&
            item.x + item.w <= (t.bounds!.right ?? Infinity) + 1,
        ),
    );
    if (table) {
      if (!emitted.has(table)) {
        if (i === 0 && top && top > g.top) blocks.push(spacer(top - g.top));
        blocks.push(wordTable(table, region, formatting));
        emitted.add(table);
        const following = rows.find((r) => lineGeometry(r).base.y < table.bounds!.bottom - 3.5);
        const last = table.cellItems?.at(-1)?.flat();
        const lastTop = last?.length ? lineGeometry(last).top : table.bounds!.bottom + g.h * 0.8;
        const lastHeight = last?.length ? lineGeometry(last).h * 1.15 : g.h * 1.15;
        blocks.push(
          spacer(
            formatting && following
              ? Math.max(0.05, lastTop - lineGeometry(following).top - lastHeight)
              : 0.05,
          ),
        );
      }
      continue;
    }
    const band = formatting && allowColumns ? columnBand(rows, i, region) : undefined;
    if (band) {
      const bandItems = rows.slice(i, band.end).flat();
      const gutter = band.rightStart - band.leftEnd;
      const left = bandItems.filter((item) => item.x < band.rightStart);
      const right = bandItems.filter((item) => item.x >= band.rightStart);
      const widths = [band.leftEnd - region.left, gutter, region.right - band.rightStart];
      if (i === 0 && top && top > g.top) blocks.push(spacer(top - g.top));
      blocks.push(
        new Table({
          width: { size: twips(region.right - region.left), type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          columnWidths: widths.map(twips),
          borders: noBorders,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: pageFlow(
                    left,
                    { left: region.left, right: band.leftEnd },
                    formatting,
                    tables,
                    false,
                    g.top,
                  ),
                }),
                new TableCell({ children: [spacer()] }),
                new TableCell({
                  children: pageFlow(
                    right,
                    { left: band.rightStart, right: region.right },
                    formatting,
                    tables,
                    false,
                    g.top,
                  ),
                }),
              ],
            }),
          ],
        }),
      );
      const last = lineGeometry(rows[band.end - 1]!);
      const following = rows[band.end];
      blocks.push(
        spacer(
          following ? Math.max(0.05, last.top - lineGeometry(following).top - last.h * 1.15) : 0.05,
        ),
      );
      i = band.end - 1;
      continue;
    }
    const next = rows[i + 1];
    blocks.push(
      lineParagraph(
        row,
        region,
        formatting,
        next ? g.top - lineGeometry(next).top : undefined,
        i === 0 && top ? Math.max(0, top - g.top) : 0,
      ),
    );
  }
  if (!blocks.length || blocks.at(-1) instanceof Table) blocks.push(spacer());
  return blocks;
}

function pageLayout(page: PdfPageModel, formatting: boolean) {
  const items = clusterRows(page.items ?? []).flat();
  if (!formatting || !items.length)
    return { region: { left: 36, right: page.width - 36 }, top: 36, bottom: 36 };
  // Sparse pages don't provide enough evidence to infer very large side margins.
  const left = Math.max(0, Math.min(page.width * 0.2, ...items.map((i) => i.x)));
  const right = Math.min(
    page.width,
    Math.max(page.width * 0.8, ...items.map((i) => i.x + i.w + 2)),
  );
  const rows = clusterRows(items);
  const top = Math.max(0, page.height - Math.max(...rows.map((r) => lineGeometry(r).top)));
  const bottom = Math.max(0, Math.min(36, ...items.map((i) => i.y - i.h * 0.35 - 2)));
  return { region: { left, right: Math.max(left + 1, right) }, top, bottom };
}

export interface PdfDocxOptions {
  pageRange?: string;
  formatting?: boolean;
  tables?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: { ratio: number; message: string }) => void;
}

export async function exportPdfToDocx(
  doc: PdfDocument,
  options: PdfDocxOptions = {},
): Promise<{ blob: Blob; warnings: string[] }> {
  throwIfAborted(options.signal);
  const selected = parsePageRange(options.pageRange ?? "", doc.pageCount);
  const pages = selected.map((index) => doc.pages[index]);
  if (pages.some((page) => !page))
    throw new OmniError("ExportFailure", "PDF chưa đọc đủ trang. Vui lòng mở lại tệp.");
  const empty = pages.filter((page) => !page!.text.trim()).map((page) => page!.index + 1);
  if (empty.length === pages.length)
    throw new OmniError(
      "ExportFailure",
      "Các trang đã chọn không có văn bản. PDF scan cần OCR trước khi chuyển sang DOCX.",
    );
  const warnings = [
    "DOCX khôi phục văn bản, font, khoảng cách, cột và bảng từ PDF; ảnh, biểu đồ và đường kẻ chưa được chuyển. Font chưa cài trên máy mở Word có thể bị thay thế.",
  ];
  if (empty.length) warnings.push(`Trang không có văn bản (cần OCR): ${empty.join(", ")}.`);
  const angled = pages
    .filter((p) => p!.items?.some((i) => Math.abs(i.angle ?? 0) > 2))
    .map((p) => p!.index + 1);
  if (angled.length)
    warnings.push(
      `Chữ xoay/dọc được chuyển thành chữ ngang; cần kiểm tra bố cục trang: ${angled.join(", ")}.`,
    );
  const sections = [];
  const formatting = options.formatting !== false;
  for (const p of pages) {
    const page = p!;
    throwIfAborted(options.signal);
    options.onProgress?.({
      ratio: (sections.length / pages.length) * 0.9,
      message: `Đang khôi phục bố cục trang ${page.index + 1} sang DOCX`,
    });
    const width = Math.round(Math.min(1584, Math.max(144, page.width)) * 20);
    const height = Math.round(Math.min(1584, Math.max(144, page.height)) * 20);
    const layout = pageLayout(page, formatting);
    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: {
            width: Math.min(width, height),
            height: Math.max(width, height),
            orientation: width > height ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
          margin: {
            top: twips(layout.top),
            right: twips(page.width - layout.region.right),
            bottom: twips(layout.bottom),
            left: twips(layout.region.left),
          },
        },
      },
      children: page.items?.length
        ? pageFlow(
            page.items,
            layout.region,
            formatting,
            options.tables === false ? [] : page.tables,
          )
        : page.text.split(/\r?\n/).map((text) => new Paragraph({ text: cleanText(text) })),
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const word = new Document({
    creator: "OMNIFILE",
    title: doc.info.Title || "PDF to DOCX",
    styles: {
      default: {
        document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { after: 0 } } },
      },
    },
    sections,
  });
  const blob = await Packer.toBlob(word);
  throwIfAborted(options.signal);
  options.onProgress?.({ ratio: 1, message: "Đã tạo DOCX" });
  return { blob, warnings };
}
