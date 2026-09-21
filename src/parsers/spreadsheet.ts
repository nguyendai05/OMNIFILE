import type { CellValue, FileParser, FileRecord, ParserContext, SheetTab, SpreadsheetDocument, TableDocument } from "@/core/types";
import { aoaToTable, parseCsvText } from "@/core/table-ops";
import { OmniError, throwIfAborted } from "@/core/errors";

function sheetFromAoa(name: string, aoa: CellValue[][]): SheetTab {
  const { columns, rows } = aoaToTable(aoa, name);
  return { name, columns, rows };
}

export const csvParser: FileParser = {
  id: "csv",
  version: "1.0.0",
  label: "CSV / TSV",
  supports: (f: FileRecord) =>
    f.kind === "spreadsheet" && (f.extension === "csv" || f.extension === "tsv" || f.detectedMime.includes("csv") || f.detectedMime.includes("tab-separated")),
  async parse(file, ctx: ParserContext): Promise<SpreadsheetDocument> {
    throwIfAborted(ctx.signal);
    const buf = await ctx.blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let text: string;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      text = new TextDecoder("utf-16le").decode(bytes);
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      text = new TextDecoder("utf-16be").decode(bytes);
    } else {
      text = new TextDecoder("utf-8").decode(bytes);
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    ctx.onProgress?.({ message: "Parsing delimited text" });
    const delim = file.extension === "tsv" ? "\t" : "";
    const aoa = parseCsvText(text, delim) as CellValue[][];
    const sheet = sheetFromAoa(file.name.replace(/\.[^.]+$/, "") || "Sheet1", aoa);
    return { kind: "spreadsheet", fileId: file.id, sheets: [sheet], activeSheet: 0 };
  },
};

export const xlsxParser: FileParser = {
  id: "xlsx",
  version: "1.0.0",
  label: "Excel",
  supports: (f: FileRecord) =>
    f.kind === "spreadsheet" && (f.extension === "xlsx" || f.extension === "xls" || f.detectedMime.includes("spreadsheet") || f.detectedMime.includes("excel")),
  async parse(file, ctx: ParserContext): Promise<SpreadsheetDocument> {
    throwIfAborted(ctx.signal);
    const XLSX = await import("xlsx");
    const buf = await ctx.blob.arrayBuffer();
    let wb;
    try {
      wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
    } catch (err) {
      throw new OmniError("CorruptedFile", "Could not read spreadsheet", { cause: err });
    }
    const sheets: SheetTab[] = [];
    for (const name of wb.SheetNames) {
      throwIfAborted(ctx.signal);
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const aoa = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as CellValue[][]) ?? [];
      const formulas: Record<string, string> = {};
      const ref = ws["!ref"];
      if (ref) {
        const range = XLSX.utils.decode_range(ref);
        for (let r = range.s.r; r <= Math.min(range.e.r, 500); r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr] as { f?: string } | undefined;
            if (cell?.f) formulas[addr] = cell.f;
          }
        }
      }
      const tab = sheetFromAoa(name, aoa);
      tab.formulas = Object.keys(formulas).length ? formulas : undefined;
      sheets.push(tab);
      ctx.onProgress?.({ ratio: sheets.length / Math.max(wb.SheetNames.length, 1), message: name });
    }
    if (!sheets.length) sheets.push(sheetFromAoa("Sheet1", []));
    return { kind: "spreadsheet", fileId: file.id, sheets, activeSheet: 0 };
  },
};

export function tableFromSheet(fileId: string, sheet: SheetTab, title?: string): TableDocument {
  return {
    kind: "table",
    fileId,
    title: title ?? sheet.name,
    columns: sheet.columns,
    rows: sheet.rows,
  };
}
