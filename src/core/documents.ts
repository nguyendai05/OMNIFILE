import type { DocumentModel } from "./types";
import { persistDocument } from "./storage";

const docs = new Map<string, DocumentModel>();
const listeners = new Map<string, Set<() => void>>();
const allListeners = new Set<() => void>();

export function getDocument(fileId: string): DocumentModel | undefined {
  return docs.get(fileId);
}

export function setDocument(doc: DocumentModel, persist = true) {
  docs.set(doc.fileId, doc);
  listeners.get(doc.fileId)?.forEach((l) => l());
  allListeners.forEach((l) => l());
  if (persist && typeof indexedDB !== "undefined") {
    void persistDocument(doc);
  }
}

export function deleteDocument(fileId: string) {
  docs.delete(fileId);
  listeners.get(fileId)?.forEach((l) => l());
  allListeners.forEach((l) => l());
}

export function hydrateDocuments(list: DocumentModel[]) {
  for (const d of list) docs.set(d.fileId, d);
  allListeners.forEach((l) => l());
}

export function subscribeDocument(fileId: string, cb: () => void): () => void {
  let set = listeners.get(fileId);
  if (!set) {
    set = new Set();
    listeners.set(fileId, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
  };
}

export function subscribeAllDocuments(cb: () => void): () => void {
  allListeners.add(cb);
  return () => allListeners.delete(cb);
}

export function documentCount(): number {
  return docs.size;
}

export function extractIndexText(doc: DocumentModel | undefined): string {
  if (!doc) return "";
  switch (doc.kind) {
    case "pdf":
      return doc.allText;
    case "text":
    case "markdown":
    case "code":
    case "html":
      return doc.text;
    case "json":
    case "xml":
    case "yaml":
      return doc.text.slice(0, 100_000);
    case "spreadsheet":
      return doc.sheets
        .map((s) => s.columns.map((c) => c.name).join(" ") + " " + s.rows.slice(0, 40).flat().join(" "))
        .join("\n");
    case "table":
      return doc.columns.map((c) => c.name).join(" ") + " " + doc.rows.slice(0, 80).flat().join(" ");
    case "docx":
    case "presentation":
      return doc.text;
    case "archive":
      return doc.entries.map((e) => e.path).join("\n");
    case "binary":
    case "unknown":
      return doc.strings.join("\n");
    default:
      return "";
  }
}
