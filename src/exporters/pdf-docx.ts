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
} from "docx";
import type { PdfDocument, PdfPageModel, PdfTextItem, ExtractedTable } from "../core/types.ts";
import { OmniError, throwIfAborted } from "../core/errors.ts";
import { clusterRows } from "../parsers/pdf-tables.ts";

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

// XML 1.0 cannot represent these control characters, even when escaped.
function cleanText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "");
}

function run(item: PdfTextItem, text: string, formatting: boolean): TextRun {
  return new TextRun({
    text: cleanText(text),
    font: "Arial",
    size:
      formatting && Number.isFinite(item.h) && item.h > 0
        ? Math.round(Math.min(72, Math.max(6, item.h)) * 2)
        : 22,
    bold: formatting && item.bold,
    italics: formatting && item.italic,
  });
}

function wordTable(table: ExtractedTable): Table {
  const width = Math.max(table.headers.length, ...table.rows.map((row) => row.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [table.headers, ...table.rows].map(
      (row, index) =>
        new TableRow({
          tableHeader: index === 0,
          children: Array.from(
            { length: width },
            (_, col) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: cleanText(row[col] ?? ""), bold: index === 0 })],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

function pageContent(
  page: PdfPageModel,
  formatting: boolean,
  tables: boolean,
): (Paragraph | Table)[] {
  if (!page.items?.length) {
    return page.text.split(/\r?\n/).map((text) => new Paragraph({ text: cleanText(text) }));
  }
  const rows = clusterRows(page.items);
  const detected = tables
    ? page.tables.filter((table) => table.bounds && table.headers.length > 1)
    : [];
  const emitted = new Set<ExtractedTable>();
  const blocks: (Paragraph | Table)[] = [];
  for (const row of rows) {
    const y = row[0]!.y;
    const table = detected.find(
      (table) => y <= table.bounds!.top + 3.5 && y >= table.bounds!.bottom - 3.5,
    );
    if (table) {
      if (!emitted.has(table)) {
        blocks.push(wordTable(table));
        emitted.add(table);
      }
      continue;
    }
    blocks.push(
      new Paragraph({
        spacing: { after: 0, line: 240 },
        children: row.map((item, i) => {
          const next = row[i + 1];
          const gap = next ? next.x - (item.x + item.w) : 0;
          const separator =
            next &&
            gap > Math.max(0.5, item.h * 0.1) &&
            !/\s$/.test(item.str) &&
            !/^\s/.test(next.str)
              ? " "
              : "";
          return run(item, item.str + separator, formatting);
        }),
      }),
    );
  }
  // Word requires a paragraph after a table at the end of a section.
  if (!blocks.length || blocks[blocks.length - 1] instanceof Table) blocks.push(new Paragraph(""));
  return blocks;
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
    "DOCX giữ văn bản và bảng nhận diện được; ảnh, biểu đồ và bố cục nhiều cột chưa được giữ nguyên.",
  ];
  if (empty.length) warnings.push(`Trang không có văn bản (cần OCR): ${empty.join(", ")}.`);
  const sections = [];
  for (const page of pages) {
    throwIfAborted(options.signal);
    options.onProgress?.({
      ratio: (sections.length / pages.length) * 0.9,
      message: `Đang chuyển trang ${page!.index + 1} sang DOCX`,
    });
    const width = Math.round(Math.min(1584, Math.max(144, page!.width)) * 20);
    const height = Math.round(Math.min(1584, Math.max(144, page!.height)) * 20);
    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: {
            width: Math.min(width, height),
            height: Math.max(width, height),
            orientation: width > height ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: pageContent(page!, options.formatting !== false, options.tables !== false),
    });
    // Give cancellation and progress rendering a chance between pages.
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
