import { diffLines } from "diff";
import type { CompareResult, DocumentModel, FileRecord } from "./types";
import { getDocument } from "./documents";
import { extractIndexText } from "./documents";

export interface CompareAdapter {
  id: string;
  supports(a: FileRecord, b: FileRecord): boolean;
  compare(a: FileRecord, b: FileRecord): CompareResult;
}

function textOf(file: FileRecord): string {
  const doc = getDocument(file.id);
  return extractIndexText(doc) || "";
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
      summary: `${added} added / ${removed} removed lines`,
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
    const hunks: CompareResult["hunks"] = [];
    walk(da && "parsed" in da ? da.parsed : null, db && "parsed" in db ? db.parsed : null, "$", hunks);
    return { kind: "json", summary: `${hunks.filter((h) => h.type !== "equal").length} differences`, hunks: hunks.slice(0, 400) };
  },
};

function walk(a: unknown, b: unknown, path: string, hunks: CompareResult["hunks"]) {
  if (Object.is(a, b)) return;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, hunks);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) walk(a[i], b[i], `${path}[${i}]`, hunks);
    return;
  }
  if (a === undefined) hunks.push({ type: "add", right: JSON.stringify(b), path });
  else if (b === undefined) hunks.push({ type: "remove", left: JSON.stringify(a), path });
  else hunks.push({ type: "change", left: JSON.stringify(a), right: JSON.stringify(b), path });
}

const spreadsheetAdapter: CompareAdapter = {
  id: "spreadsheet",
  supports: (a, b) =>
    (a.kind === "spreadsheet" || a.kind === "table") && (b.kind === "spreadsheet" || b.kind === "table"),
  compare(a, b) {
    const left = rowsOf(getDocument(a.id));
    const right = rowsOf(getDocument(b.id));
    const hunks: CompareResult["hunks"] = [];
    const max = Math.max(left.length, right.length);
    let changed = 0;
    for (let i = 0; i < max; i++) {
      const l = JSON.stringify(left[i] ?? []);
      const r = JSON.stringify(right[i] ?? []);
      if (l !== r) {
        changed++;
        hunks.push({ type: "change", left: l, right: r, path: `row ${i + 1}` });
      }
    }
    return { kind: "spreadsheet", summary: `${changed} rows differ`, hunks: hunks.slice(0, 200), metrics: { changed } };
  },
};

function rowsOf(doc: DocumentModel | undefined): unknown[] {
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
      summary: sameHash ? "Identical SHA-256" : "Different files",
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
