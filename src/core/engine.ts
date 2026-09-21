import { basename, extname, uniqueName } from "@/lib/utils";
import { getDocument, setDocument, extractIndexText, deleteDocument } from "./documents";
import { OmniError, errorMessage, isCancelled } from "./errors";
import { sha256Blob } from "./hash";
import { makeId } from "./ids";
import { detectMime, refineZipKind } from "./mime";
import { actionRegistry, exporterRegistry, findParser } from "./registries";
import {
  actionSemaphore,
  createJob,
  logJob,
  parseSemaphore,
  patchJob,
  setJobStatus,
} from "./jobs";
import {
  deleteFilePersist,
  getBlob,
  getDb,
  loadPersisted,
  objectUrlFor,
  persistFile,
  persistFolder,
  persistHistory,
  persistLineage,
  persistPipeline,
  persistSearch,
  persistUi,
  persistNote,
  rememberBlob,
  deleteFolderPersist,
} from "./storage";
import { workspaceStore } from "./store";
import { scoreSearch } from "./table-ops";
import { getRecipe, recipesFor, type Recipe } from "./recipes";
import type {
  Artifact,
  DocumentKind,
  FileAction,
  FileRecord,
  FileSource,
  FolderRecord,
  HistoryOp,
  LayoutState,
  Note,
  Pipeline,
  Suggestion,
  TabState,
} from "./types";

const inflightParses = new Map<string, Promise<void>>();
let bootstrapped = false;
const abortControllers = new Map<string, AbortController>();

export function isBootstrapped() {
  return bootstrapped;
}

export async function bootstrapWorkspace() {
  const already = Object.keys(workspaceStore.getState().files).length > 0;
  if (bootstrapped && already) return;
  bootstrapped = true;
  try {
    const persisted = await loadPersisted();
    const files: Record<string, FileRecord> = {};
    for (const f of persisted.files) files[f.id] = f;
    const folders: Record<string, FolderRecord> = {};
    for (const f of persisted.folders) folders[f.id] = f;
    const pipelines: Record<string, Pipeline> = {};
    for (const p of persisted.pipelines) pipelines[p.id] = p;
    const notes: Record<string, (typeof persisted.notes)[number]> = {};
    for (const n of persisted.notes) notes[n.id] = n;
    const db = await getDb();
    const docs = await db.getAll("documents");
    for (const d of docs) setDocument(d, false);
    const ui = (await db.get("ui", "layout")) as { layout?: LayoutState; theme?: "dark" | "light"; tabs?: TabState[]; activeTabId?: string | null } | undefined;
    workspaceStore.setState((s) => ({
      files,
      folders,
      pipelines,
      notes,
      lineage: persisted.lineage,
      history: persisted.history ?? s.history,
      hydrated: true,
      layout: ui?.layout ?? s.layout,
      ui: { ...s.ui, theme: ui?.theme ?? s.ui.theme },
      tabs: ui?.tabs ?? s.tabs,
      activeTabId: ui?.activeTabId ?? s.activeTabId,
    }));
    applyTheme(ui?.theme ?? "dark");
    collapseDuplicateFolders();
    collapseDuplicateDemoImports();
    for (const f of persisted.files) {
      if (f.parseStatus !== "ready" || !getDocument(f.id)) {
        void parseFile(f.id);
      }
    }
  } catch {
    workspaceStore.setState({ hydrated: true });
  }
}

export function applyTheme(theme: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
}

export function setTheme(theme: "dark" | "light") {
  workspaceStore.setState((s) => ({ ui: { ...s.ui, theme } }));
  applyTheme(theme);
  void persistUi("layout", snapshotUi());
}

function snapshotUi() {
  const s = workspaceStore.getState();
  return { layout: s.layout, theme: s.ui.theme, tabs: s.tabs, activeTabId: s.activeTabId };
}

export async function saveUi() {
  await persistUi("layout", snapshotUi());
}

export async function importBrowserFiles(
  list: File[],
  origin: "drop" | "picker" | "fs-access" | "demo" | "paste",
  folderId?: string | null,
) {
  const artifacts = list.map((f) => ({
    name: f.name,
    blob: f,
    mime: f.type || "application/octet-stream",
  }));
  return importBlobs(artifacts, { type: "import", origin }, folderId ?? null);
}

export async function importBlobs(
  items: Array<{ name: string; blob: Blob; mime?: string; kind?: DocumentKind; document?: Artifact["document"]; metadata?: Record<string, unknown> }>,
  source: FileSource,
  folderId: string | null,
): Promise<FileRecord[]> {
  const state = workspaceStore.getState();
  const existingNames = new Set(Object.values(state.files).map((f) => f.name));
  const created: FileRecord[] = [];
  for (const item of items) {
    const name = uniqueName(item.name, existingNames);
    existingNames.add(name);
    const head = new Uint8Array(await item.blob.slice(0, 512).arrayBuffer());
    let guess = detectMime(name, item.mime ?? item.blob.type ?? "", head);
    if (guess.kind === "archive" && guess.extension === "zip") {
      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(item.blob);
        guess = refineZipKind(Object.keys(zip.files));
      } catch {
        /* keep zip */
      }
    }
    const id = makeId("fl");
    const now = Date.now();
    const file: FileRecord = {
      id,
      name,
      extension: guess.extension || extname(name),
      detectedMime: guess.mime,
      declaredMime: item.mime ?? item.blob.type ?? "",
      size: item.blob.size,
      sha256: null,
      createdAt: now,
      importedAt: now,
      modifiedAt: now,
      source,
      storageRef: id,
      parentArtifactId: source.type === "derived" ? source.inputIds[0] : source.type === "extract" ? source.parentId : undefined,
      folderId,
      metadata: item.metadata ?? {},
      kind: item.kind ?? guess.kind,
      parseStatus: "queued",
      tags: [],
    };
    rememberBlob(file.storageRef, item.blob);
    workspaceStore.setState((s) => ({ files: { ...s.files, [file.id]: file } }));
    await persistFile(file, item.blob, item.document);
    created.push(file);
    if (item.document) {
      const doc = { ...item.document, fileId: file.id };
      setDocument(doc);
      patchFile(file.id, { parseStatus: "ready", documentModelId: file.id, parserId: "inline" });
      void persistSearch(file.id, file.name, extractIndexText(doc));
    } else {
      void parseFile(file.id);
    }
    void hashFile(file.id);
  }
  if (source.type === "import") {
    pushHistory({
      label: created.length === 1 ? `Import ${created[0]!.name}` : `Import ${created.length} files`,
      kind: "import",
      inputIds: [],
      outputIds: created.map((f) => f.id),
    });
  }
  refreshSuggestions();
  return created;
}

function patchFile(id: string, patch: Partial<FileRecord>) {
  workspaceStore.setState((s) => {
    const prev = s.files[id];
    if (!prev) return s;
    const next = { ...prev, ...patch, modifiedAt: Date.now() };
    void persistFile(next);
    return { files: { ...s.files, [id]: next } };
  });
}

async function hashFile(id: string) {
  try {
    const file = workspaceStore.getState().files[id];
    if (!file) return;
    const blob = await getBlob(file.storageRef);
    const hash = await sha256Blob(blob);
    patchFile(id, { sha256: hash });
  } catch {
    /* hashing is best-effort */
  }
}

export async function parseFile(id: string) {
  const existing = inflightParses.get(id);
  if (existing) return existing;
  const run = (async () => {
    const release = await parseSemaphore.acquire();
    const job = createJob({ title: `Parse ${workspaceStore.getState().files[id]?.name ?? id}`, inputIds: [id] });
    setJobStatus(job.id, "running");
    try {
      const file = workspaceStore.getState().files[id];
      if (!file) throw new OmniError("NotFound", "File disappeared");
      patchFile(id, { parseStatus: "parsing" });
      const parser = findParser(file);
      if (!parser) {
        const blob = await getBlob(file.storageRef);
        const { parseBinary } = await import("@/parsers/binary");
        const doc = await parseBinary(file, { blob });
        setDocument(doc);
        patchFile(id, { parseStatus: "ready", documentModelId: file.id, parserId: "binary" });
        logJob(job.id, "info", "Opened as binary");
        setJobStatus(job.id, "success");
        return;
      }
      const blob = await getBlob(file.storageRef);
      logJob(job.id, "info", `Parser ${parser.id} v${parser.version}`);
      const doc = await parser.parse(file, {
        blob,
        onProgress: (p) => {
          patchJob(job.id, { progress: p.ratio ?? null, message: p.message });
        },
      });
      setDocument(doc);
      patchFile(id, {
        parseStatus: "ready",
        documentModelId: file.id,
        parserId: parser.id,
        metadata: { ...file.metadata, ...(summarizeDoc(doc) ?? {}) },
      });
      await persistSearch(file.id, file.name, `${file.name}\n${extractIndexText(doc)}`);
      setJobStatus(job.id, "success", { progress: 1 });
      refreshSuggestions();
    } catch (err) {
      const msg = errorMessage(err);
      patchFile(id, { parseStatus: "error", parseError: msg });
      setJobStatus(job.id, isCancelled(err) ? "cancelled" : "failed", {
        error: { code: err instanceof OmniError ? err.code : "ParserFailure", message: msg },
      });
    } finally {
      release();
      inflightParses.delete(id);
    }
  })();
  inflightParses.set(id, run);
  return run;
}

function summarizeDoc(doc: ReturnType<typeof getDocument>): Record<string, unknown> | undefined {
  if (!doc) return;
  if (doc.kind === "pdf") return { pages: doc.pageCount, tables: doc.pages.reduce((n, p) => n + p.tables.length, 0) };
  if (doc.kind === "spreadsheet") return { sheets: doc.sheets.length, rows: doc.sheets[0]?.rows.length ?? 0 };
  if (doc.kind === "table") return { rows: doc.rows.length, columns: doc.columns.length };
  if (doc.kind === "image" || doc.kind === "svg") return { width: doc.width, height: doc.height };
  if (doc.kind === "archive") return { entries: doc.entries.length };
  return;
}

export function openTab(fileId: string) {
  const state = workspaceStore.getState();
  const file = state.files[fileId];
  if (!file) return;
  const existing = state.tabs.find((t) => t.fileId === fileId);
  if (existing) {
    workspaceStore.setState({ activeTabId: existing.id, selectedIds: [fileId] });
    return;
  }
  const tab: TabState = {
    id: makeId("tb"),
    fileId,
    title: file.name,
    dirty: false,
    pinned: false,
  };
  workspaceStore.setState({
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
    selectedIds: [fileId],
  });
  void saveUi();
}

export function closeTab(tabId: string, others = false) {
  const state = workspaceStore.getState();
  if (others) {
    const keep = state.tabs.filter((t) => t.id === tabId || t.pinned);
    workspaceStore.setState({ tabs: keep, activeTabId: tabId });
    void saveUi();
    return;
  }
  const tab = state.tabs.find((t) => t.id === tabId);
  const tabs = state.tabs.filter((t) => t.id !== tabId);
  const idx = state.tabs.findIndex((t) => t.id === tabId);
  const next = tabs[Math.min(idx, tabs.length - 1)] ?? null;
  workspaceStore.setState({
    tabs,
    activeTabId: state.activeTabId === tabId ? next?.id ?? null : state.activeTabId,
    closedTabs: tab ? [tab, ...state.closedTabs].slice(0, 20) : state.closedTabs,
  });
  void saveUi();
}

export function togglePinTab(tabId: string) {
  workspaceStore.setState((s) => ({
    tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, pinned: !t.pinned } : t)),
  }));
  void saveUi();
}

export function reopenClosedTab() {
  const state = workspaceStore.getState();
  const [tab, ...rest] = state.closedTabs;
  if (!tab) return;
  if (!state.files[tab.fileId]) {
    workspaceStore.setState({ closedTabs: rest });
    return;
  }
  workspaceStore.setState({
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
    closedTabs: rest,
  });
}

export function selectFiles(ids: string[], additive = false) {
  workspaceStore.setState((s) => ({
    selectedIds: additive ? [...new Set([...s.selectedIds, ...ids])] : ids,
  }));
}

export function availableActions(fileIds: string[]): FileAction[] {
  const state = workspaceStore.getState();
  const files = fileIds.map((id) => state.files[id]).filter(Boolean) as FileRecord[];
  if (!files.length) return [];
  const kinds = new Set(files.map((f) => f.kind));
  return actionRegistry
    .all()
    .filter((a) => {
      if (!files.every((f) => a.accepts.includes(f.kind))) return false;
      try {
        return a.canRun({
          files,
          documents: files.map((f) => getDocument(f.id)),
        });
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title) || kinds.size);
}

export async function runAction(
  actionId: string,
  fileIds: string[],
  config: Record<string, unknown> = {},
  opts: { open?: boolean } = {},
): Promise<FileRecord[]> {
  const action = actionRegistry.get(actionId);
  if (!action) throw new OmniError("ActionUnavailable", `Unknown action ${actionId}`);
  const state = workspaceStore.getState();
  const files = fileIds.map((id) => state.files[id]).filter(Boolean) as FileRecord[];
  if (!files.length) throw new OmniError("NotFound", "No files selected");
  if (!action.canRun({ files, documents: files.map((f) => getDocument(f.id)) })) {
    throw new OmniError("ActionUnavailable", `${action.title} cannot run on the current selection`);
  }
  const controller = new AbortController();
  const job = createJob({
    title: action.title,
    actionId,
    inputIds: fileIds,
    execution: action.execution,
  });
  abortControllers.set(job.id, controller);
  const release = await actionSemaphore.acquire();
  setJobStatus(job.id, "running");
  logJob(job.id, "info", `LOCAL · ${action.id}`);
  try {
    const result = await action.execute({
      files,
      getBlob: async (id) => {
        const f = workspaceStore.getState().files[id];
        if (!f) throw new OmniError("NotFound", "Missing file");
        return getBlob(f.storageRef);
      },
      getDocument: (id) => getDocument(id),
      config,
      signal: controller.signal,
      onProgress: (p) => patchJob(job.id, { progress: p.ratio ?? null, message: p.message }),
    });
    const generatedId = ensureGeneratedFolder();
    const outputs = await importBlobs(
      result.artifacts.map((a) => ({
        name: a.name,
        blob: a.blob,
        mime: a.mime,
        kind: a.kind,
        document: a.document,
        metadata: a.metadata,
      })),
      { type: "derived", actionId, inputIds: fileIds },
      generatedId,
    );
    const edge = {
      id: makeId("ln"),
      fromIds: fileIds,
      toIds: outputs.map((o) => o.id),
      actionId,
      actionTitle: action.title,
      at: Date.now(),
      jobId: job.id,
    };
    workspaceStore.setState((s) => ({ lineage: [...s.lineage, edge] }));
    void persistLineage(edge);
    pushHistory({
      label: action.title,
      kind: "transform",
      actionId,
      inputIds: fileIds,
      outputIds: outputs.map((o) => o.id),
    });
    if (outputs[0] && opts.open !== false) openTab(outputs[0].id);
    setJobStatus(job.id, result.warnings?.length ? "warning" : "success", {
      outputIds: outputs.map((o) => o.id),
      progress: 1,
    });
    if (result.warnings) result.warnings.forEach((w) => logJob(job.id, "warn", w));
    return outputs;
  } catch (err) {
    const msg = errorMessage(err);
    setJobStatus(job.id, isCancelled(err) ? "cancelled" : "failed", {
      error: { code: err instanceof OmniError ? err.code : "ParserFailure", message: msg },
    });
    logJob(job.id, "error", msg);
    throw err;
  } finally {
    abortControllers.delete(job.id);
    release();
  }
}

export function cancelJob(id: string) {
  abortControllers.get(id)?.abort();
  setJobStatus(id, "cancelled");
}

export async function exportWith(exporterId: string, fileId: string, config: Record<string, unknown> = {}) {
  const exporter = exporterRegistry.get(exporterId);
  if (!exporter) throw new OmniError("ActionUnavailable", "Exporter unavailable");
  const file = workspaceStore.getState().files[fileId];
  if (!file) throw new OmniError("NotFound", "File missing");
  const artifact = await exporter.export({
    files: [file],
    getBlob: async (id) => {
      const f = workspaceStore.getState().files[id];
      if (!f) throw new OmniError("NotFound", "Missing file");
      return getBlob(f.storageRef);
    },
    getDocument: (id) => getDocument(id),
    config,
  });
  const { downloadBlob } = await import("@/lib/utils");
  downloadBlob(artifact.blob, artifact.name);
  return artifact;
}

export function ensureFolder(name: string, parentId: string | null = null): string {
  const state = workspaceStore.getState();
  const found = Object.values(state.folders).find((f) => f.name === name && f.parentId === parentId);
  if (found) return found.id;
  const folder: FolderRecord = { id: makeId("fd"), name, parentId, createdAt: Date.now() };
  workspaceStore.setState((s) => ({ folders: { ...s.folders, [folder.id]: folder } }));
  void persistFolder(folder);
  return folder.id;
}

export function ensureGeneratedFolder() {
  return ensureFolder("Generated");
}

export function pushHistory(partial: Omit<HistoryOp, "id" | "at">) {
  const op: HistoryOp = { ...partial, id: makeId("op"), at: Date.now() };
  workspaceStore.setState((s) => {
    const ops = s.history.ops.slice(0, s.history.pointer + 1).concat(op);
    const history = { ops, pointer: ops.length - 1 };
    void persistHistory(history);
    return { history };
  });
}

export function undo() {
  const s = workspaceStore.getState();
  if (s.history.pointer < 0) return;
  const op = s.history.ops[s.history.pointer]!;
  if (op.outputIds.length) {
    workspaceStore.setState((st) => {
      const files = { ...st.files };
      for (const id of op.outputIds) {
        if (files[id]) files[id] = { ...files[id]!, hidden: true };
      }
      return { files, history: { ...st.history, pointer: st.history.pointer - 1 }, selectedIds: op.inputIds };
    });
  } else {
    workspaceStore.setState((st) => ({ history: { ...st.history, pointer: st.history.pointer - 1 } }));
  }
}

export function redo() {
  const s = workspaceStore.getState();
  const next = s.history.ops[s.history.pointer + 1];
  if (!next) return;
  if (next.outputIds.length) {
    workspaceStore.setState((st) => {
      const files = { ...st.files };
      for (const id of next.outputIds) {
        if (files[id]) files[id] = { ...files[id]!, hidden: false };
      }
      return {
        files,
        history: { ...st.history, pointer: st.history.pointer + 1 },
        selectedIds: next.outputIds,
      };
    });
  } else {
    workspaceStore.setState((st) => ({ history: { ...st.history, pointer: st.history.pointer + 1 } }));
  }
}

export async function renameFile(id: string, name: string) {
  const file = workspaceStore.getState().files[id];
  if (!file) return;
  const next = name.trim();
  if (!next || next === file.name) return;
  pushHistory({ label: `Rename ${file.name}`, kind: "rename", inputIds: [id], outputIds: [] });
  patchFile(id, { name: next, extension: extname(next) });
  workspaceStore.setState((s) => ({
    tabs: s.tabs.map((t) => (t.fileId === id ? { ...t, title: next } : t)),
  }));
}

export async function deleteFiles(ids: string[]) {
  const s = workspaceStore.getState();
  pushHistory({ label: ids.length === 1 ? `Delete ${s.files[ids[0]!]?.name}` : `Delete ${ids.length} files`, kind: "delete", inputIds: ids, outputIds: [] });
  workspaceStore.setState((st) => {
    const files = { ...st.files };
    for (const id of ids) delete files[id];
    const tabs = st.tabs.filter((t) => !ids.includes(t.fileId));
    return {
      files,
      tabs,
      activeTabId: tabs.find((t) => t.id === st.activeTabId)?.id ?? tabs[0]?.id ?? null,
      selectedIds: st.selectedIds.filter((id) => !ids.includes(id)),
    };
  });
  for (const id of ids) {
    const f = s.files[id];
    deleteDocument(id);
    if (f) void deleteFilePersist(id, f.storageRef);
  }
}

export async function duplicateFile(id: string) {
  const file = workspaceStore.getState().files[id];
  if (!file) return;
  const blob = await getBlob(file.storageRef);
  const copies = await importBlobs(
    [{ name: `${basename(file.name)} copy.${file.extension || "bin"}`, blob, mime: file.detectedMime, kind: file.kind }],
    { type: "import", origin: "picker" },
    file.folderId,
  );
  if (copies[0]) openTab(copies[0].id);
}

export function lineageFor(fileId: string) {
  const { lineage, files } = workspaceStore.getState();
  const ancestors: string[] = [];
  const descendants: string[] = [];
  const walkUp = (id: string) => {
    for (const e of lineage) {
      if (e.toIds.includes(id)) {
        for (const f of e.fromIds) {
          if (!ancestors.includes(f)) {
            ancestors.push(f);
            walkUp(f);
          }
        }
      }
    }
  };
  const walkDown = (id: string) => {
    for (const e of lineage) {
      if (e.fromIds.includes(id)) {
        for (const t of e.toIds) {
          if (!descendants.includes(t)) {
            descendants.push(t);
            walkDown(t);
          }
        }
      }
    }
  };
  walkUp(fileId);
  walkDown(fileId);
  return { ancestors, descendants, edges: lineage.filter((e) => e.fromIds.includes(fileId) || e.toIds.includes(fileId)), files };
}

export async function searchWorkspace(query: string) {
  const q = query.trim();
  if (!q) return [];
  const state = workspaceStore.getState();
  const hits: Array<{ fileId: string; name: string; kind: DocumentKind; snippet: string; field: "name" | "text" | "metadata"; score: number }> = [];
  for (const f of Object.values(state.files)) {
    if (f.hidden) continue;
    const nameScore = scoreSearch(q, [f.name, f.kind, f.detectedMime, f.extension]);
    if (nameScore > 0) {
      hits.push({ fileId: f.id, name: f.name, kind: f.kind, snippet: f.name, field: "name", score: nameScore + 5 });
    }
    const doc = getDocument(f.id);
    const text = extractIndexText(doc);
    if (text) {
      const idx = text.toLowerCase().indexOf(q.toLowerCase());
      if (idx >= 0) {
        const snippet = text.slice(Math.max(0, idx - 40), idx + q.length + 60).replace(/\s+/g, " ");
        hits.push({ fileId: f.id, name: f.name, kind: f.kind, snippet, field: "text", score: 10 });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 80);
}

export function refreshSuggestions() {
  const state = workspaceStore.getState();
  const files = Object.values(state.files).filter((f) => !f.hidden);
  const suggestions: Suggestion[] = [];
  for (const f of files) {
    const doc = getDocument(f.id);
    if (doc?.kind === "pdf") {
      const tableCount = doc.pages.reduce((n, p) => n + p.tables.length, 0);
      if (tableCount > 0) {
        suggestions.push({
          id: `sug-tables-${f.id}`,
          title: `This PDF contains ${tableCount} table${tableCount === 1 ? "" : "s"}`,
          detail: `Extract tables from ${f.name}`,
          actionId: "pdf.extract-tables",
          fileIds: [f.id],
          grounded: true,
        });
      }
    }
    if (doc?.kind === "spreadsheet" || doc?.kind === "table") {
      const rows = doc.kind === "table" ? doc.rows : doc.sheets[0]?.rows ?? [];
      const cols = doc.kind === "table" ? doc.columns : doc.sheets[0]?.columns ?? [];
      const empty = rows.filter((r) => r.every((c) => c === null || c === "")).length;
      if (empty) {
        suggestions.push({
          id: `sug-empty-${f.id}`,
          title: `${empty} empty rows in ${f.name}`,
          detail: "Remove empty rows",
          actionId: "table.remove-empty-rows",
          fileIds: [f.id],
          grounded: true,
        });
      }
      void cols;
    }
    if (f.kind === "image") {
      suggestions.push({
        id: `sug-ocr-${f.id}`,
        title: `OCR ${f.name}`,
        detail: "Extract text locally with Tesseract",
        actionId: "image.ocr",
        fileIds: [f.id],
        grounded: true,
      });
    }
    if (f.kind === "pdf") {
      suggestions.push({
        id: `sug-recipe-pdf-${f.id}`,
        title: `PDF → Excel for ${f.name}`,
        detail: "Extract · clean · normalize · XLSX",
        actionId: "recipe:pdf-to-excel",
        fileIds: [f.id],
        grounded: true,
      });
    }
    if (f.kind === "spreadsheet" || f.kind === "table") {
      suggestions.push({
        id: `sug-recipe-csv-${f.id}`,
        title: `Clean ${f.name} → Excel`,
        detail: "Drop duplicates · fill missing · XLSX",
        actionId: "recipe:csv-clean-xlsx",
        fileIds: [f.id],
        grounded: true,
      });
    }
  }
  const images = files.filter((f) => f.kind === "image");
  if (images.length >= 3) {
    suggestions.push({
      id: "sug-batch-images",
      title: `${images.length} images in workspace`,
      detail: "Batch-resize or convert the set",
      actionId: "image.resize",
      fileIds: images.map((f) => f.id),
      grounded: true,
    });
  }
  const csvs = files.filter((f) => f.extension === "csv" || f.kind === "spreadsheet" || f.kind === "table");
  if (csvs.length >= 2) {
    const schemas = csvs.map((f) => {
      const d = getDocument(f.id);
      if (d?.kind === "table") return d.columns.map((c) => c.name).join("|");
      if (d?.kind === "spreadsheet") return d.sheets[0]?.columns.map((c) => c.name).join("|") ?? "";
      return "";
    });
    if (schemas[0] && schemas.every((s) => s === schemas[0])) {
      suggestions.push({
        id: "sug-merge",
        title: `${csvs.length} tables share the same columns`,
        detail: "Merge into one sheet",
        actionId: "table.merge",
        fileIds: csvs.map((f) => f.id),
        grounded: true,
      });
    }
  }
  const hashes = new Map<string, string[]>();
  for (const f of files) {
    if (!f.sha256) continue;
    const arr = hashes.get(f.sha256) ?? [];
    arr.push(f.id);
    hashes.set(f.sha256, arr);
  }
  for (const [hash, ids] of hashes) {
    if (ids.length > 1) {
      suggestions.push({
        id: `sug-dup-${hash.slice(0, 8)}`,
        title: `${ids.length} exact duplicate files`,
        detail: "Same SHA-256 — inspect, do not auto-delete",
        fileIds: ids,
        grounded: true,
      });
    }
  }
  workspaceStore.setState({ suggestions: suggestions.slice(0, 12) });
}

export async function createPipeline(name = "Untitled pipeline"): Promise<Pipeline> {
  const pipeline: Pipeline = {
    id: makeId("pl"),
    name,
    nodes: [],
    edges: [],
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  workspaceStore.setState((s) => ({
    pipelines: { ...s.pipelines, [pipeline.id]: pipeline },
    activePipelineId: pipeline.id,
    layout: { ...s.layout, activity: "pipelines" },
  }));
  await persistPipeline(pipeline);
  return pipeline;
}

export function savePipeline(pipeline: Pipeline) {
  const next = { ...pipeline, modifiedAt: Date.now() };
  workspaceStore.setState((s) => ({ pipelines: { ...s.pipelines, [next.id]: next } }));
  void persistPipeline(next);
}

export async function runPipeline(pipelineId: string) {
  const pipeline = workspaceStore.getState().pipelines[pipelineId];
  if (!pipeline) throw new OmniError("NotFound", "Pipeline missing");
  const byId = new Map(pipeline.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, string[]>();
  for (const n of pipeline.nodes) incoming.set(n.id, []);
  for (const e of pipeline.edges) {
    incoming.get(e.target)?.push(e.source);
  }
  const incomingCount = new Map<string, number>();
  for (const n of pipeline.nodes) incomingCount.set(n.id, incoming.get(n.id)?.length ?? 0);
  const queue = pipeline.nodes.filter((n) => (incomingCount.get(n.id) ?? 0) === 0).map((n) => n.id);
  const outputs = new Map<string, string[]>();
  const order: string[] = [];
  const counts = new Map(incomingCount);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of pipeline.edges.filter((x) => x.source === id)) {
      const c = (counts.get(e.target) ?? 1) - 1;
      counts.set(e.target, c);
      if (c === 0) queue.push(e.target);
    }
  }
  if (order.length !== pipeline.nodes.length) {
    throw new OmniError("InvalidConnection", "Pipeline has a cycle");
  }
  for (const nodeId of order) {
    const node = byId.get(nodeId)!;
    updateNodeStatus(pipelineId, nodeId, "running");
    const started = Date.now();
    try {
      if (node.data.kind === "input") {
        if (!node.data.fileId) throw new OmniError("NotFound", "Input node has no file");
        outputs.set(nodeId, [node.data.fileId]);
        updateNodeStatus(pipelineId, nodeId, "success", { outputFileIds: [node.data.fileId], elapsedMs: Date.now() - started });
        continue;
      }
      const srcIds = (incoming.get(nodeId) ?? []).flatMap((s) => outputs.get(s) ?? []);
      if (node.data.kind === "action") {
        if (!node.data.actionId) throw new OmniError("ActionUnavailable", "Node missing action");
        const produced = await runAction(node.data.actionId, srcIds, node.data.config);
        const ids = produced.map((f) => f.id);
        outputs.set(nodeId, ids);
        updateNodeStatus(pipelineId, nodeId, "success", { outputFileIds: ids, elapsedMs: Date.now() - started });
        continue;
      }
      if (node.data.kind === "output") {
        outputs.set(nodeId, srcIds);
        if (node.data.exporterId && srcIds[0]) {
          await exportWith(node.data.exporterId, srcIds[0], node.data.config);
        }
        updateNodeStatus(pipelineId, nodeId, "success", { outputFileIds: srcIds, elapsedMs: Date.now() - started });
      }
    } catch (err) {
      updateNodeStatus(pipelineId, nodeId, "failed", { error: errorMessage(err), elapsedMs: Date.now() - started });
      throw err;
    }
  }
}

function updateNodeStatus(
  pipelineId: string,
  nodeId: string,
  status: Pipeline["nodes"][number]["data"]["status"],
  extra?: Partial<Pipeline["nodes"][number]["data"]>,
) {
  const p = workspaceStore.getState().pipelines[pipelineId];
  if (!p) return;
  savePipeline({
    ...p,
    nodes: p.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status, ...extra } } : n)),
  });
}

export async function blobUrl(fileId: string): Promise<string> {
  const file = workspaceStore.getState().files[fileId];
  if (!file) throw new OmniError("NotFound", "File missing");
  const blob = await getBlob(file.storageRef);
  return objectUrlFor(file.storageRef, blob);
}

export function diagnosticsSnapshot() {
  const s = workspaceStore.getState();
  return {
    files: Object.keys(s.files).length,
    documents: Object.values(s.files).filter((f) => f.parseStatus === "ready").length,
    jobs: Object.values(s.jobs).filter((j) => j.status === "running" || j.status === "queued").length,
    tabs: s.tabs.length,
    workers: parseSemaphore.activeCount + actionSemaphore.activeCount,
    pipelines: Object.keys(s.pipelines).length,
  };
}

export async function runBatch(actionId: string, fileIds: string[], config: Record<string, unknown> = {}) {
  const settled = await Promise.all(
    fileIds.map(async (id) => {
      try {
        await runAction(actionId, [id], config);
        return { id, ok: true as const };
      } catch (err) {
        return { id, ok: false as const, error: errorMessage(err) };
      }
    }),
  );
  return settled;
}

export function setActiveSheet(fileId: string, index: number) {
  const doc = getDocument(fileId);
  if (!doc || doc.kind !== "spreadsheet") return;
  if (index < 0 || index >= doc.sheets.length) return;
  setDocument({ ...doc, activeSheet: index });
}

export async function retryJob(jobId: string) {
  const job = workspaceStore.getState().jobs[jobId];
  if (!job?.actionId || !job.inputIds.length) return;
  return runAction(job.actionId, job.inputIds);
}

async function waitParsed(id: string) {
  const file = workspaceStore.getState().files[id];
  if (!file) throw new OmniError("NotFound", "File missing");
  if (file.parseStatus === "ready" && getDocument(id)) return;
  await parseFile(id);
}

async function runRecipeChain(recipe: Recipe, fileIds: string[]): Promise<FileRecord[]> {
  for (const id of fileIds) await waitParsed(id);
  let current = fileIds;
  let last: FileRecord[] = [];
  for (const step of recipe.steps) {
    const next: FileRecord[] = [];
    for (const id of current) {
      await waitParsed(id);
      const produced = await runAction(step.actionId, [id], step.config ?? {}, { open: false });
      next.push(...produced);
    }
    last = next;
    current = next.map((f) => f.id);
    if (!current.length) break;
  }
  return last;
}

export async function runRecipe(recipeId: string, fileIds: string[]): Promise<FileRecord[]> {
  const recipe = getRecipe(recipeId);
  if (!recipe) throw new OmniError("ActionUnavailable", `Unknown recipe ${recipeId}`);
  if (!fileIds.length) throw new OmniError("NotFound", "No files selected for recipe");
  const last =
    recipe.mode === "each"
      ? (await Promise.all(fileIds.map((id) => runRecipeChain(recipe, [id])))).flat()
      : await runRecipeChain(recipe, fileIds);
  if (last[0]) openTab(last[0].id);
  return last;
}

export function recipesForFiles(fileIds: string[]) {
  const state = workspaceStore.getState();
  const files = fileIds.map((id) => state.files[id]).filter(Boolean) as FileRecord[];
  return recipesFor(files);
}

export async function createPipelineFromRecipe(recipeId: string, fileId?: string): Promise<Pipeline> {
  const recipe = getRecipe(recipeId);
  if (!recipe) throw new OmniError("ActionUnavailable", `Unknown recipe ${recipeId}`);
  const file = fileId ? workspaceStore.getState().files[fileId] : undefined;
  const nodes: Pipeline["nodes"] = [];
  const edges: Pipeline["edges"] = [];
  const inputId = makeId("nd");
  nodes.push({
    id: inputId,
    position: { x: 40, y: 140 },
    data: {
      kind: "input",
      fileId: file?.id,
      title: file?.name ?? "Input",
      accepts: [],
      produces: file ? [file.kind] : recipe.accepts,
      config: {},
      status: "idle",
      outputFileIds: file ? [file.id] : [],
      logs: [],
    },
  });
  let prev = inputId;
  recipe.steps.forEach((step, i) => {
    const action = actionRegistry.get(step.actionId);
    const id = makeId("nd");
    nodes.push({
      id,
      position: { x: 280 + i * 230, y: 140 },
      data: {
        kind: "action",
        actionId: step.actionId,
        title: action?.title ?? step.actionId,
        accepts: action?.accepts ?? [],
        produces: action?.produces ?? [],
        config: step.config ?? {},
        status: "idle",
        outputFileIds: [],
        logs: [],
      },
    });
    edges.push({ id: makeId("eg"), source: prev, target: id });
    prev = id;
  });
  const pipeline: Pipeline = {
    id: makeId("pl"),
    name: recipe.title,
    nodes,
    edges,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
  };
  workspaceStore.setState((s) => ({
    pipelines: { ...s.pipelines, [pipeline.id]: pipeline },
    activePipelineId: pipeline.id,
  }));
  await persistPipeline(pipeline);
  return pipeline;
}

export async function importFromDirectoryPicker(): Promise<FileRecord[]> {
  const w = window as unknown as {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  };
  if (!w.showDirectoryPicker) {
    throw new OmniError(
      "PermissionDenied",
      "This browser has no folder picker. Use Open files instead.",
    );
  }
  const dir = await w.showDirectoryPicker();
  const files: File[] = [];
  async function walk(handle: FileSystemDirectoryHandle, prefix: string, depth: number) {
    if (depth > 5 || files.length >= 400) return;
    const iter = (
      handle as unknown as { values: () => AsyncIterable<FileSystemHandle & { name: string }> }
    ).values();
    for await (const entry of iter) {
      if (entry.kind === "file") {
        const f = await (entry as FileSystemFileHandle).getFile();
        files.push(new File([f], prefix + f.name, { type: f.type }));
      } else if (entry.kind === "directory") {
        await walk(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`, depth + 1);
      }
    }
  }
  await walk(dir, "", 0);
  if (!files.length) throw new OmniError("NotFound", "Folder was empty");
  return importBrowserFiles(files, "fs-access");
}

export function upsertNote(fileId: string, body: string) {
  const s = workspaceStore.getState();
  const existing = Object.values(s.notes).find((n) => n.target.fileId === fileId && n.target.page == null);
  const now = Date.now();
  const note: Note = existing
    ? { ...existing, body, updatedAt: now }
    : { id: makeId("nt"), target: { fileId }, body, createdAt: now, updatedAt: now };
  workspaceStore.setState((st) => ({ notes: { ...st.notes, [note.id]: note } }));
  void persistNote(note);
}

export function collapseDuplicateFolders() {
  const s = workspaceStore.getState();
  const folders = Object.values(s.folders).slice().sort((a, b) => a.createdAt - b.createdAt);
  const keep = new Map<string, FolderRecord>();
  const remap = new Map<string, string>();
  for (const f of folders) {
    const key = `${f.parentId ?? ""}::${f.name}`;
    const existing = keep.get(key);
    if (existing) remap.set(f.id, existing.id);
    else keep.set(key, f);
  }
  if (!remap.size) return;
  const nextFolders: Record<string, FolderRecord> = {};
  for (const f of keep.values()) nextFolders[f.id] = f;
  const nextFiles: Record<string, FileRecord> = { ...s.files };
  for (const file of Object.values(nextFiles)) {
    if (file.folderId && remap.has(file.folderId)) {
      const moved = { ...file, folderId: remap.get(file.folderId)! };
      nextFiles[file.id] = moved;
      void persistFile(moved);
    }
  }
  workspaceStore.setState({ folders: nextFolders, files: nextFiles });
  for (const id of remap.keys()) void deleteFolderPersist(id);
}

export function collapseDuplicateDemoImports() {
  const s = workspaceStore.getState();
  const groups = new Map<string, FileRecord[]>();
  for (const f of Object.values(s.files)) {
    if (f.source.type !== "import" || f.source.origin !== "demo") continue;
    const base = f.name.replace(/ \(\d+\)(?=\.[^.]+$)/, "");
    const key = `${f.folderId ?? ""}::${base}`;
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }
  const drop: FileRecord[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.importedAt - b.importedAt);
    drop.push(...group.slice(1));
  }
  if (!drop.length) return;
  const dropIds = new Set(drop.map((f) => f.id));
  workspaceStore.setState((st) => {
    const files = { ...st.files };
    for (const id of dropIds) delete files[id];
    const tabs = st.tabs.filter((t) => !dropIds.has(t.fileId));
    return {
      files,
      tabs,
      activeTabId: tabs.find((t) => t.id === st.activeTabId)?.id ?? tabs[0]?.id ?? null,
      selectedIds: st.selectedIds.filter((id) => !dropIds.has(id)),
    };
  });
  for (const f of drop) {
    deleteDocument(f.id);
    void deleteFilePersist(f.id, f.storageRef);
  }
}
