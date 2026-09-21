import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  DocumentModel,
  FileRecord,
  FolderRecord,
  HistoryState,
  LineageEdge,
  Note,
  Pipeline,
} from "./types";

interface OmniDB extends DBSchema {
  files: { key: string; value: FileRecord };
  folders: { key: string; value: FolderRecord };
  blobs: { key: string; value: Blob };
  documents: { key: string; value: DocumentModel };
  lineage: { key: string; value: LineageEdge };
  history: { key: string; value: HistoryState };
  pipelines: { key: string; value: Pipeline };
  notes: { key: string; value: Note };
  ui: { key: string; value: unknown };
  search: { key: string; value: { fileId: string; name: string; text: string } };
}

const DB_NAME = "omnifile-v1";
let dbPromise: Promise<IDBPDatabase<OmniDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<OmniDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB<OmniDB>(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore("files", { keyPath: "id" });
        db.createObjectStore("folders", { keyPath: "id" });
        db.createObjectStore("blobs");
        db.createObjectStore("documents", { keyPath: "fileId" });
        db.createObjectStore("lineage", { keyPath: "id" });
        db.createObjectStore("history");
        db.createObjectStore("pipelines", { keyPath: "id" });
        db.createObjectStore("notes", { keyPath: "id" });
        db.createObjectStore("ui");
        db.createObjectStore("search", { keyPath: "fileId" });
      },
    });
  }
  return dbPromise;
}

export async function persistFile(file: FileRecord, blob?: Blob, doc?: DocumentModel) {
  const db = await getDb();
  const tx = db.transaction(["files", "blobs", "documents"], "readwrite");
  await tx.objectStore("files").put(file);
  if (blob) await tx.objectStore("blobs").put(blob, file.storageRef);
  if (doc) await tx.objectStore("documents").put(doc);
  await tx.done;
}

export async function persistDocument(doc: DocumentModel) {
  const db = await getDb();
  await db.put("documents", doc);
}

export async function deleteFilePersist(id: string, storageRef: string) {
  const db = await getDb();
  const tx = db.transaction(["files", "blobs", "documents", "search"], "readwrite");
  await tx.objectStore("files").delete(id);
  await tx.objectStore("blobs").delete(storageRef);
  await tx.objectStore("documents").delete(id);
  await tx.objectStore("search").delete(id);
  await tx.done;
}

export async function loadPersisted(): Promise<{
  files: FileRecord[];
  folders: FolderRecord[];
  lineage: LineageEdge[];
  pipelines: Pipeline[];
  notes: Note[];
  history: HistoryState | undefined;
}> {
  const db = await getDb();
  const [files, folders, lineage, pipelines, notes, history] = await Promise.all([
    db.getAll("files"),
    db.getAll("folders"),
    db.getAll("lineage"),
    db.getAll("pipelines"),
    db.getAll("notes"),
    db.get("history", "main"),
  ]);
  return { files, folders, lineage, pipelines, notes, history };
}

class Lru<K, V> {
  private map = new Map<K, V>();
  constructor(private cap: number) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k: K, v: V) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.cap) {
      const first = this.map.keys().next().value as K | undefined;
      if (first !== undefined) this.map.delete(first);
    }
  }
  delete(k: K) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const blobCache = new Lru<string, Blob>(48);
const urlCache = new Map<string, string>();

export async function getBlob(storageRef: string): Promise<Blob> {
  const hit = blobCache.get(storageRef);
  if (hit) return hit;
  const db = await getDb();
  const blob = await db.get("blobs", storageRef);
  if (!blob) throw new Error(`Missing blob ${storageRef}`);
  blobCache.set(storageRef, blob);
  return blob;
}

export function rememberBlob(storageRef: string, blob: Blob) {
  blobCache.set(storageRef, blob);
}

export function objectUrlFor(storageRef: string, blob: Blob): string {
  const existing = urlCache.get(storageRef);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  urlCache.set(storageRef, url);
  return url;
}

export function revokeUrl(storageRef: string) {
  const url = urlCache.get(storageRef);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(storageRef);
  }
}

export function revokeAllUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

export async function persistUi(key: string, value: unknown) {
  const db = await getDb();
  await db.put("ui", value, key);
}

export async function loadUi<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return (await db.get("ui", key)) as T | undefined;
}

export async function persistHistory(state: HistoryState) {
  const db = await getDb();
  await db.put("history", state, "main");
}

export async function persistLineage(edge: LineageEdge) {
  const db = await getDb();
  await db.put("lineage", edge);
}

export async function persistPipeline(p: Pipeline) {
  const db = await getDb();
  await db.put("pipelines", p);
}

export async function persistFolder(f: FolderRecord) {
  const db = await getDb();
  await db.put("folders", f);
}

export async function persistNote(n: Note) {
  const db = await getDb();
  await db.put("notes", n);
}

export async function deleteFolderPersist(id: string) {
  const db = await getDb();
  await db.delete("folders", id);
}

export async function persistSearch(fileId: string, name: string, text: string) {
  const db = await getDb();
  await db.put("search", { fileId, name, text: text.slice(0, 200_000) });
}

export async function loadAllSearch() {
  const db = await getDb();
  return db.getAll("search");
}

export async function estimateStorage(): Promise<{ usage: number; quota: number }> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  const est = await navigator.storage.estimate();
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
}
