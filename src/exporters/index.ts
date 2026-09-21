import { registerPlugin } from "@/core/registries";
import type { Exporter, SpreadsheetDocument, TableDocument } from "@/core/types";
import { OmniError } from "@/core/errors";
import { tableToAoa, toCsv } from "@/core/table-ops";

function tableOf(ctx: Parameters<Exporter["export"]>[0]): TableDocument {
  const doc = ctx.getDocument(ctx.files[0]!.id);
  if (doc?.kind === "table") return doc;
  if (doc?.kind === "spreadsheet") {
    const s = doc.sheets[doc.activeSheet] ?? doc.sheets[0];
    if (!s) throw new OmniError("ExportFailure", "Empty workbook");
    return { kind: "table", fileId: doc.fileId, title: s.name, columns: s.columns, rows: s.rows };
  }
  throw new OmniError("ExportFailure", "Not a table");
}

const csvExporter: Exporter = {
  id: "csv",
  title: "CSV",
  accepts: ["table", "spreadsheet"],
  extension: "csv",
  mime: "text/csv",
  async export(ctx) {
    const t = tableOf(ctx);
    const csv = toCsv(t.columns, t.rows);
    return {
      name: ctx.files[0]!.name.replace(/\.[^.]+$/, "") + ".csv",
      blob: new Blob([csv], { type: "text/csv" }),
      mime: "text/csv",
      kind: "spreadsheet",
    };
  },
};

const xlsxExporter: Exporter = {
  id: "xlsx",
  title: "Excel (XLSX)",
  accepts: ["table", "spreadsheet"],
  extension: "xlsx",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  async export(ctx) {
    const t = tableOf(ctx);
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(tableToAoa(t.columns, t.rows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return {
      name: ctx.files[0]!.name.replace(/\.[^.]+$/, "") + ".xlsx",
      blob: new Blob([bytes], { type: xlsxExporter.mime }),
      mime: xlsxExporter.mime,
      kind: "spreadsheet",
    };
  },
};

const txtExporter: Exporter = {
  id: "txt",
  title: "Plain text",
  accepts: ["text", "markdown", "code", "html"],
  extension: "txt",
  mime: "text/plain",
  async export(ctx) {
    const blob = await ctx.getBlob(ctx.files[0]!.id);
    return { name: ctx.files[0]!.name.replace(/\.[^.]+$/, "") + ".txt", blob, mime: "text/plain", kind: "text" };
  },
};

const pngExporter: Exporter = {
  id: "png",
  title: "PNG",
  accepts: ["image"],
  extension: "png",
  mime: "image/png",
  async export(ctx) {
    const blob = await ctx.getBlob(ctx.files[0]!.id);
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close?.();
    const out = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"),
    );
    return { name: ctx.files[0]!.name.replace(/\.[^.]+$/, "") + ".png", blob: out, mime: "image/png", kind: "image" };
  },
};

const jsonExporter: Exporter = {
  id: "json",
  title: "JSON",
  accepts: ["json", "table", "yaml", "xml"],
  extension: "json",
  mime: "application/json",
  async export(ctx) {
    const doc = ctx.getDocument(ctx.files[0]!.id);
    let text: string;
    if (doc?.kind === "table") text = JSON.stringify({ columns: doc.columns, rows: doc.rows }, null, 2);
    else if (doc && "parsed" in doc) text = JSON.stringify(doc.parsed, null, 2);
    else text = await (await ctx.getBlob(ctx.files[0]!.id)).text();
    return {
      name: ctx.files[0]!.name.replace(/\.[^.]+$/, "") + ".json",
      blob: new Blob([text], { type: "application/json" }),
      mime: "application/json",
      kind: "json",
    };
  },
};

let registered = false;

export function registerExporters() {
  if (registered) return;
  registered = true;
  registerPlugin({
    id: "omnifile.exporters",
    version: "1.0.0",
    label: "Core exporters",
    exporters: [csvExporter, xlsxExporter, txtExporter, pngExporter, jsonExporter],
  });
}

void 0 as unknown as SpreadsheetDocument;
