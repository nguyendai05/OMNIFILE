import type { FileAction, PdfDocument, TableDocument } from "@/core/types";
import { OmniError } from "@/core/errors";
import { aoaToTable } from "@/core/table-ops";

function asPdf(doc: ReturnType<FileAction["execute"]> extends Promise<infer _> ? unknown : unknown, fileId: string): PdfDocument {
  void fileId;
  const d = doc as PdfDocument | undefined;
  if (!d || d.kind !== "pdf") throw new OmniError("ParserFailure", "PDF document is not ready");
  return d;
}

export const extractTextAction: FileAction = {
  id: "pdf.extract-text",
  title: "Extract text",
  description: "Pull a plain-text document from the PDF content stream",
  category: "PDF",
  accepts: ["pdf"],
  produces: ["text"],
  execution: "local",
  keywords: ["extract", "text", "ocr", "pdf"],
  canRun: ({ documents }) => documents.some((d) => d?.kind === "pdf"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    const doc = asPdf(ctx.getDocument(file.id), file.id);
    const text = doc.allText || doc.pages.map((p, i) => `--- Page ${i + 1} ---\n${p.text}`).join("\n\n");
    return {
      artifacts: [
        {
          name: file.name.replace(/\.pdf$/i, "") + ".txt",
          blob: new Blob([text], { type: "text/plain" }),
          mime: "text/plain",
          kind: "text",
          document: {
            kind: "text",
            fileId: "",
            text,
            encoding: "utf-8",
            lineCount: text.split(/\n/).length,
            wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
          },
        },
      ],
    };
  },
};

export const extractTablesAction: FileAction = {
  id: "pdf.extract-tables",
  title: "Extract tables",
  description: "Detect grid-like text regions and emit table documents",
  category: "PDF",
  accepts: ["pdf"],
  produces: ["table"],
  execution: "local",
  keywords: ["extract", "table", "excel", "csv", "spreadsheet"],
  canRun: ({ documents }) => {
    const d = documents[0];
    return d?.kind === "pdf" && d.pages.some((p) => p.tables.length > 0);
  },
  async execute(ctx) {
    const file = ctx.files[0]!;
    const doc = asPdf(ctx.getDocument(file.id), file.id);
    const wanted = ctx.config.tableIndex as number | undefined;
    const tables = doc.pages.flatMap((p) => p.tables).filter((t) => wanted === undefined || t.index === wanted);
    if (!tables.length) throw new OmniError("ParserFailure", "No tables detected in this PDF");
    const artifacts = tables.map((t, i) => {
      const aoa = [t.headers, ...t.rows];
      const { columns, rows } = aoaToTable(aoa, `Table ${i + 1}`);
      const table: TableDocument = {
        kind: "table",
        fileId: "",
        title: `${file.name} · table ${t.index + 1} (page ${t.page + 1})`,
        columns,
        rows,
        source: { fileId: file.id, page: t.page },
      };
      return {
        name: `${file.name.replace(/\.pdf$/i, "")}-table-${t.index + 1}.table.json`,
        blob: new Blob([JSON.stringify({ columns, rows }, null, 2)], { type: "application/json" }),
        mime: "application/json",
        kind: "table" as const,
        document: table,
      };
    });
    return { artifacts };
  },
};

export const splitPdfAction: FileAction = {
  id: "pdf.split",
  title: "Split pages",
  description: "Emit one PDF per page",
  category: "PDF",
  accepts: ["pdf"],
  produces: ["pdf"],
  execution: "local",
  keywords: ["split", "pages", "pdf"],
  canRun: ({ documents }) => documents[0]?.kind === "pdf" && documents[0].pageCount > 1,
  async execute(ctx) {
    const file = ctx.files[0]!;
    const blob = await ctx.getBlob(file.id);
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(await blob.arrayBuffer());
    const artifacts = [];
    const max = Math.min(src.getPageCount(), 40);
    for (let i = 0; i < max; i++) {
      ctx.onProgress?.({ ratio: i / max, message: `Page ${i + 1}` });
      const out = await PDFDocument.create();
      const [page] = await out.copyPages(src, [i]);
      out.addPage(page);
      const bytes = await out.save();
      artifacts.push({
        name: `${file.name.replace(/\.pdf$/i, "")}-p${i + 1}.pdf`,
        blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        mime: "application/pdf",
        kind: "pdf" as const,
      });
    }
    return { artifacts, warnings: src.getPageCount() > 40 ? ["Split is capped at 40 pages in this build"] : undefined };
  },
};

export const mergePdfAction: FileAction = {
  id: "pdf.merge",
  title: "Merge PDFs",
  description: "Concatenate selected PDFs in selection order",
  category: "PDF",
  accepts: ["pdf"],
  produces: ["pdf"],
  execution: "local",
  keywords: ["merge", "combine", "pdf"],
  canRun: ({ files }) => files.length >= 2 && files.every((f) => f.kind === "pdf"),
  async execute(ctx) {
    const { PDFDocument } = await import("pdf-lib");
    const out = await PDFDocument.create();
    for (const f of ctx.files) {
      const src = await PDFDocument.load(await (await ctx.getBlob(f.id)).arrayBuffer());
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    const bytes = await out.save();
    return {
      artifacts: [
        {
          name: "merged.pdf",
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
          mime: "application/pdf",
          kind: "pdf",
        },
      ],
    };
  },
};

export const extractPdfImagesAction: FileAction = {
  id: "pdf.export-pages",
  title: "Export page images",
  description: "Rasterize PDF pages to PNG",
  category: "PDF",
  accepts: ["pdf"],
  produces: ["image"],
  execution: "local",
  keywords: ["image", "export", "png", "pages"],
  configSchema: [{ key: "scale", label: "Scale", type: "number", default: 1.5 }],
  canRun: ({ documents }) => documents[0]?.kind === "pdf",
  async execute(ctx) {
    const file = ctx.files[0]!;
    const blob = await ctx.getBlob(file.id);
    const doc = asPdf(ctx.getDocument(file.id), file.id);
    const { renderPdfPage } = await import("@/parsers/pdf");
    const scale = Number(ctx.config.scale ?? 1.5);
    const max = Math.min(doc.pageCount, 12);
    const artifacts = [];
    for (let i = 0; i < max; i++) {
      ctx.onProgress?.({ ratio: i / max, message: `Rasterizing page ${i + 1}` });
      const canvas = await renderPdfPage(blob, i, scale, ctx.signal);
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"),
      );
      artifacts.push({
        name: `${file.name.replace(/\.pdf$/i, "")}-p${i + 1}.png`,
        blob: png,
        mime: "image/png",
        kind: "image" as const,
      });
    }
    return { artifacts, warnings: doc.pageCount > 12 ? ["Rasterize is capped at 12 pages"] : undefined };
  },
};
