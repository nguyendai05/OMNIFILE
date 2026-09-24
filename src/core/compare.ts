import { diffLines } from "diff";
import type { CellValue, CompareResult, DocumentModel, FileRecord } from "./types";
import { getDocument } from "./documents";
import { extractIndexText } from "./documents";
import { compareJsonValues, compareTableRows, comparisonText } from "./compare-data.ts";

export interface CompareAdapter {
  id: string;
  supports(a: FileRecord, b: FileRecord): boolean;
  compare(a: FileRecord, b: FileRecord): CompareResult;
}

function textOf(file: FileRecord): string {
  const doc = getDocument(file.id);
  return comparisonText(doc) ?? extractIndexText(doc);
}

const textAdapter: CompareAdapter = {
  id: "text",
  supports: (a, b) => {
    const texty = new Set(["text", "markdown", "code", "html", "json", "xml", "yaml"]);
    return texty.has(a.kind) && texty.has(b.kind);
  },
  compare(a, b) {
    const left = textOf(a);
    const right = textOf(b);
    const parts = diffLines(left, right);
    const hunks: CompareResult["hunks"] = parts.map((p) => ({
      type: p.added ? "add" : p.removed ? "remove" : "equal",
      left: p.removed || !p.added ? p.value : undefined,
      right: p.added || !p.removed ? p.value : undefined,
    }));
    const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
    const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);
    return {
      kind: "text",
      summary: `${added} dòng thêm / ${removed} dòng xóa`,
      hunks: hunks.slice(0, 400),
      metrics: { added, removed },
    };
  },
};

const jsonAdapter: CompareAdapter = {
  id: "json",
  supports: (a, b) => a.kind === "json" && b.kind === "json",
  compare(a, b) {
    const da = getDocument(a.id);
    const db = getDocument(b.id);
    return compareJsonValues(da && "parsed" in da ? da.parsed : null, db && "parsed" in db ? db.parsed : null);
  },
};

const spreadsheetAdapter: CompareAdapter = {
  id: "spreadsheet",
  supports: (a, b) =>
    (a.kind === "spreadsheet" || a.kind === "table") && (b.kind === "spreadsheet" || b.kind === "table"),
  compare(a, b) {
    const left = rowsOf(getDocument(a.id));
    const right = rowsOf(getDocument(b.id));
    return compareTableRows(left, right);
  },
};

function rowsOf(doc: DocumentModel | undefined): CellValue[][] {
  if (doc?.kind === "table") return doc.rows;
  if (doc?.kind === "spreadsheet") return doc.sheets[0]?.rows ?? [];
  return [];
}

const binaryAdapter: CompareAdapter = {
  id: "binary",
  supports: () => true,
  compare(a, b) {
    const sameHash = a.sha256 && b.sha256 && a.sha256 === b.sha256;
    return {
      kind: "binary",
      summary: sameHash ? "Mã SHA-256 giống nhau" : "Hai tệp khác nhau",
      hunks: [
        { type: sameHash ? "equal" : "change", left: a.sha256 ?? "unhashed", right: b.sha256 ?? "unhashed", path: "sha256" },
        { type: a.size === b.size ? "equal" : "change", left: String(a.size), right: String(b.size), path: "size" },
      ],
      metrics: { sizeA: a.size, sizeB: b.size },
    };
  },
};

export const compareAdapters: CompareAdapter[] = [jsonAdapter, spreadsheetAdapter, textAdapter, binaryAdapter];

export function compareFiles(a: FileRecord, b: FileRecord): CompareResult {
  const adapter = compareAdapters.find((x) => x.supports(a, b)) ?? binaryAdapter;
  return adapter.compare(a, b);
}
