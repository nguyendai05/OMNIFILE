import type { FileAction, SpreadsheetDocument, TableColumn, TableDocument } from "@/core/types";
import { OmniError } from "@/core/errors";
import {
  dropDuplicateRows,
  fillMissing,
  normalizeHeaders,
  profileColumns,
  removeEmptyRows,
  tableToAoa,
  toCsv,
} from "@/core/table-ops";

function asTable(doc: ReturnType<FileAction["canRun"]> extends boolean ? unknown : unknown): TableDocument {
  const d = doc as TableDocument | SpreadsheetDocument | undefined;
  if (d?.kind === "table") return d;
  if (d?.kind === "spreadsheet") {
    const sheet = d.sheets[d.activeSheet] ?? d.sheets[0];
    if (!sheet) throw new OmniError("ParserFailure", "Spreadsheet has no sheets");
    return { kind: "table", fileId: d.fileId, title: sheet.name, columns: sheet.columns, rows: sheet.rows };
  }
  if (d && (d as { kind?: string }).kind === "json") {
    throw new OmniError("ParserFailure", "Not a table");
  }
  throw new OmniError("ParserFailure", "Table document is not ready");
}

function tableArtifact(name: string, table: TableDocument, warnings?: string[]) {
  return {
    artifacts: [
      {
        name,
        blob: new Blob([JSON.stringify({ columns: table.columns, rows: table.rows, title: table.title }, null, 2)], {
          type: "application/json",
        }),
        mime: "application/json",
        kind: "table" as const,
        document: table,
      },
    ],
    warnings,
  };
}

export const removeEmptyRowsAction: FileAction = {
  id: "table.remove-empty-rows",
  title: "Remove empty rows",
  description: "Drop rows where every cell is empty",
  category: "Table",
  accepts: ["table", "spreadsheet"],
  produces: ["table"],
  execution: "local",
  keywords: ["clean", "empty", "rows", "filter"],
  canRun: ({ documents }) => documents.some((d) => d?.kind === "table" || d?.kind === "spreadsheet"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    const table = asTable(ctx.getDocument(file.id));
    const rows = removeEmptyRows(table.rows);
    return tableArtifact(file.name.replace(/\.[^.]+$/, "") + "-no-empty.table.json", {
      ...table,
      fileId: "",
      rows,
      title: `${table.title} (no empty rows)`,
    });
  },
};

export const normalizeHeadersAction: FileAction = {
  id: "table.normalize-headers",
  title: "Normalize headers",
  description: "Trim, title-case, and de-duplicate column names",
  category: "Table",
  accepts: ["table", "spreadsheet"],
  produces: ["table"],
  execution: "local",
  keywords: ["normalize", "headers", "columns", "clean"],
  canRun: ({ documents }) => documents.some((d) => d?.kind === "table" || d?.kind === "spreadsheet"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    const table = asTable(ctx.getDocument(file.id));
    const columns = normalizeHeaders(table.columns);
    return tableArtifact(file.name.replace(/\.[^.]+$/, "") + "-headers.table.json", {
      ...table,
      fileId: "",
      columns,
      title: `${table.title} (normalized headers)`,
    });
  },
};

export const dropDuplicatesAction: FileAction = {
  id: "table.drop-duplicates",
  title: "Remove duplicate rows",
  description: "Keep the first occurrence of each identical row",
  category: "Table",
  accepts: ["table", "spreadsheet"],
  produces: ["table"],
  execution: "local",
  keywords: ["duplicate", "unique", "clean"],
  canRun: ({ documents }) => documents.some((d) => d?.kind === "table" || d?.kind === "spreadsheet"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    const table = asTable(ctx.getDocument(file.id));
    const { rows, removed } = dropDuplicateRows(table.rows);
    return tableArtifact(
      file.name.replace(/\.[^.]+$/, "") + "-deduped.table.json",
      { ...table, fileId: "", rows, title: `${table.title} (deduped)` },
      removed ? [`Removed ${removed} duplicate row${removed === 1 ? "" : "s"}`] : ["No duplicates found"],
    );
  },
};

export const fillMissingAction: FileAction = {
  id: "table.fill-missing",
  title: "Fill missing values",
  description: "Forward-fill empty cells from the previous row",
  category: "Table",
  accepts: ["table", "spreadsheet"],
  produces: ["table"],
  execution: "local",
  keywords: ["missing", "null", "fill", "clean"],
  canRun: ({ documents }) => documents.some((d) => d?.kind === "table" || d?.kind === "spreadsheet"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    const table = asTable(ctx.getDocument(file.id));
    const rows = fillMissing(table.rows, table.columns, "ffill");
    return tableArtifact(file.name.replace(/\.[^.]+$/, "") + "-filled.table.json", {
      ...table,
      fileId: "",
      rows,
      title: `${table.title} (filled)`,
    });
  },
};

export const profileAction: FileAction = {
  id: "table.profile",
  title: "Profile columns",
  description: "Emit a data-quality profile as JSON",
  category: "Table",
  accepts: ["table", "spreadsheet"],
  produces: ["json"],
  execution: "local",
  keywords: ["profile", "quality", "stats", "chart"],
  canRun: ({ documents }) => documents.some((d) => d?.kind === "table" || d?.kind === "spreadsheet"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    const table = asTable(ctx.getDocument(file.id));
    const profiles = profileColumns(table.columns, table.rows);
    const text = JSON.stringify({ file: file.name, rows: table.rows.length, profiles }, null, 2);
    return {
      artifacts: [
        {
          name: file.name.replace(/\.[^.]+$/, "") + "-profile.json",
          blob: new Blob([text], { type: "application/json" }),
          mime: "application/json",
          kind: "json",
        },
      ],
    };
  },
};

export const exportCsvAction: FileAction = {
  id: "table.export-csv",
  title: "Export CSV",
  description: "Write the table as CSV",
  category: "Export",
  accepts: ["table", "spreadsheet"],
  produces: ["spreadsheet"],
  execution: "local",
  keywords: ["csv", "export", "excel"],
  canRun: ({ documents }) => documents.some((d) => d?.kind === "table" || d?.kind === "spreadsheet"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    const table = asTable(ctx.getDocument(file.id));
    const csv = toCsv(table.columns, table.rows);
    return {
      artifacts: [
        {
          name: file.name.replace(/\.[^.]+$/, "") + ".csv",
          blob: new Blob([csv], { type: "text/csv" }),
          mime: "text/csv",
          kind: "spreadsheet",
        },
      ],
    };
  },
};

export const exportXlsxAction: FileAction = {
  id: "table.export-xlsx",
  title: "Export Excel",
  description: "Write the table as XLSX",
  category: "Export",
  accepts: ["table", "spreadsheet"],
  produces: ["spreadsheet"],
  execution: "local",
  keywords: ["xlsx", "excel", "export", "spreadsheet"],
  canRun: ({ documents }) => documents.some((d) => d?.kind === "table" || d?.kind === "spreadsheet"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    const table = asTable(ctx.getDocument(file.id));
    const XLSX = await import("xlsx");
    const aoa = tableToAoa(table.columns, table.rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (table.title || "Sheet1").slice(0, 31) || "Sheet1");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return {
      artifacts: [
        {
          name: file.name.replace(/\.[^.]+$/, "") + ".xlsx",
          blob: new Blob([bytes], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          kind: "spreadsheet",
        },
      ],
    };
  },
};

export const jsonToTableAction: FileAction = {
  id: "table.from-json",
  title: "JSON to table",
  description: "If the JSON is an array of objects, flatten it into a table",
  category: "Table",
  accepts: ["json"],
  produces: ["table"],
  execution: "local",
  keywords: ["json", "table", "convert"],
  canRun: ({ documents }) => {
    const d = documents[0];
    return d?.kind === "json" && Array.isArray(d.parsed) && typeof d.parsed[0] === "object";
  },
  async execute(ctx) {
    const file = ctx.files[0]!;
    const doc = ctx.getDocument(file.id);
    if (doc?.kind !== "json" || !Array.isArray(doc.parsed)) throw new OmniError("ParserFailure", "JSON is not a table");
    const rowsObj = doc.parsed as Record<string, unknown>[];
    const keys = [...new Set(rowsObj.flatMap((r) => Object.keys(r)))];
    const columns: TableColumn[] = keys.map((k, i) => ({ id: `c${i}`, name: k, type: "text" }));
    const rows = rowsObj.map((r) => keys.map((k) => (r[k] as string | number | boolean | null) ?? null));
    const table: TableDocument = { kind: "table", fileId: "", title: file.name, columns, rows };
    return tableArtifact(file.name.replace(/\.[^.]+$/, "") + ".table.json", table);
  },
};

export const mergeTablesAction: FileAction = {
  id: "table.merge",
  title: "Merge tables",
  description: "Stack tables that share a compatible schema",
  category: "Table",
  accepts: ["table", "spreadsheet"],
  produces: ["table"],
  execution: "local",
  keywords: ["merge", "append", "schema"],
  canRun: ({ files }) => files.length >= 2,
  async execute(ctx) {
    const tables = ctx.files.map((f) => asTable(ctx.getDocument(f.id)));
    const schema = tables[0]!.columns.map((c) => c.name.toLowerCase()).join("|");
    for (const t of tables) {
      if (t.columns.map((c) => c.name.toLowerCase()).join("|") !== schema) {
        throw new OmniError("InvalidConnection", "Column names do not match — merge aborted");
      }
    }
    const rows = tables.flatMap((t) => t.rows);
    const table: TableDocument = {
      kind: "table",
      fileId: "",
      title: "Merged",
      columns: tables[0]!.columns,
      rows,
    };
    return tableArtifact("merged.table.json", table);
  },
};
