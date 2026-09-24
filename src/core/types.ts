export type DocumentKind =
  | "pdf"
  | "spreadsheet"
  | "table"
  | "text"
  | "markdown"
  | "code"
  | "html"
  | "image"
  | "svg"
  | "archive"
  | "json"
  | "xml"
  | "yaml"
  | "binary"
  | "audio"
  | "video"
  | "presentation"
  | "docx"
  | "folder"
  | "unknown";

export type ExecutionEnv = "local" | "server" | "cloud-ai";

export type FileSource =
  | { type: "import"; origin: "drop" | "picker" | "fs-access" | "demo" | "paste" }
  | {
      type: "derived";
      actionId: string;
      inputIds: string[];
      pipelineId?: string;
      nodeId?: string;
    }
  | { type: "extract"; parentId: string; entryPath: string };

export interface FileRecord {
  id: string;
  name: string;
  extension: string;
  detectedMime: string;
  declaredMime: string;
  size: number;
  sha256: string | null;
  createdAt: number;
  importedAt: number;
  modifiedAt: number;
  source: FileSource;
  storageRef: string;
  parentArtifactId?: string;
  folderId: string | null;
  metadata: Record<string, unknown>;
  parserId?: string;
  documentModelId?: string;
  kind: DocumentKind;
  parseStatus: "idle" | "queued" | "parsing" | "ready" | "error";
  parseError?: string;
  hidden?: boolean;
  pinned?: boolean;
  tags: string[];
}

export interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface TabState {
  id: string;
  fileId: string;
  title: string;
  dirty: boolean;
  pinned: boolean;
  view?: string;
}

export type JobStatus =
  | "queued"
  | "running"
  | "success"
  | "warning"
  | "failed"
  | "cancelled";

export interface JobLog {
  at: number;
  level: "info" | "warn" | "error";
  text: string;
}

export interface Job {
  id: string;
  title: string;
  actionId?: string;
  inputIds: string[];
  outputIds: string[];
  status: JobStatus;
  progress: number | null;
  message?: string;
  logs: JobLog[];
  error?: { code: string; message: string };
  startedAt?: number;
  finishedAt?: number;
  execution: ExecutionEnv;
}

export interface LineageEdge {
  id: string;
  fromIds: string[];
  toIds: string[];
  actionId: string;
  actionTitle: string;
  at: number;
  jobId?: string;
}

export interface HistoryOp {
  id: string;
  at: number;
  label: string;
  actionId?: string;
  inputIds: string[];
  outputIds: string[];
  kind: "import" | "transform" | "delete" | "rename" | "pipeline";
}

export interface HistoryState {
  ops: HistoryOp[];
  pointer: number;
}

export interface Note {
  id: string;
  target: {
    fileId: string;
    page?: number;
    sheet?: string;
    cell?: string;
    nodeId?: string;
  };
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface Suggestion {
  id: string;
  title: string;
  detail: string;
  actionId?: string;
  fileIds: string[];
  grounded: true;
}

export type ColumnType =
  | "text"
  | "number"
  | "integer"
  | "date"
  | "boolean"
  | "categorical"
  | "id"
  | "empty";

export type CellValue = string | number | boolean | null;

export interface TableColumn {
  id: string;
  name: string;
  type: ColumnType;
}

export interface ColumnProfile {
  id: string;
  name: string;
  inferredType: ColumnType;
  nullCount: number;
  emptyCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
  mixedTypes: boolean;
  whitespaceIssues: number;
  constant: boolean;
  sample: CellValue[];
}

export interface TableDocument {
  kind: "table";
  fileId: string;
  title: string;
  columns: TableColumn[];
  rows: CellValue[][];
  source?: { fileId: string; page?: number; bbox?: [number, number, number, number] };
  issues?: string[];
}

export interface SheetTab {
  name: string;
  columns: TableColumn[];
  rows: CellValue[][];
  formulas?: Record<string, string>;
}

export interface SpreadsheetDocument {
  kind: "spreadsheet";
  fileId: string;
  sheets: SheetTab[];
  activeSheet: number;
}

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontName?: string;
  fontFamily?: string;
  ascent?: number;
  descent?: number;
  /** Text angle after applying the page crop/rotation, in degrees. */
  angle?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface ExtractedTable {
  index: number;
  page: number;
  headers: string[];
  rows: string[][];
  confidence: number;
  /** PDF text baselines belonging to this table, in PDF coordinates. */
  bounds?: { top: number; bottom: number; left?: number; right?: number };
  columnBounds?: { left: number; right: number }[];
  /** Original fragments for each row/cell, including the first row. */
  cellItems?: PdfTextItem[][][];
}

export interface PdfPageModel {
  index: number;
  width: number;
  height: number;
  rotation: number;
  text: string;
  items?: PdfTextItem[];
  tables: ExtractedTable[];
  /** Version of the normalized PDF geometry and font metadata. */
  layoutVersion?: number;
}

export interface PdfDocument {
  kind: "pdf";
  fileId: string;
  pageCount: number;
  pages: PdfPageModel[];
  info: Record<string, string>;
  encrypted: boolean;
  textComplete: boolean;
  allText: string;
}

export interface ImageOp {
  id: string;
  type: "rotate" | "flip-h" | "flip-v" | "resize" | "crop" | "compress" | "convert";
  params: Record<string, unknown>;
}

export interface ImageDocument {
  kind: "image" | "svg";
  fileId: string;
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
  histogram?: { r: number[]; g: number[]; b: number[] };
  ops: ImageOp[];
  animated?: boolean;
}

export interface TextDocument {
  kind: "text" | "markdown" | "code" | "html";
  fileId: string;
  text: string;
  encoding: string;
  language?: string;
  lineCount: number;
  wordCount: number;
  headings?: { level: number; text: string; offset: number }[];
}

export interface StructuredDocument {
  kind: "json" | "xml" | "yaml";
  fileId: string;
  text: string;
  parsed: unknown;
  valid: boolean;
  error?: string;
  pathCount: number;
}

export interface ArchiveEntry {
  path: string;
  size: number;
  compressedSize: number;
  isDir: boolean;
  unsafe: boolean;
  reason?: string;
}

export interface ArchiveDocument {
  kind: "archive";
  fileId: string;
  entries: ArchiveEntry[];
  totalUncompressed: number;
  compressed: number;
  ratio: number;
  warnings: string[];
}

export interface MediaDocument {
  kind: "audio" | "video";
  fileId: string;
  duration?: number;
  width?: number;
  height?: number;
  codec?: string;
  channels?: number;
  sampleRate?: number;
  waveform?: number[];
}

export interface BinaryDocument {
  kind: "binary" | "unknown";
  fileId: string;
  magicHex: string;
  entropy: number;
  strings: string[];
  preview: Uint8Array;
}

export interface DocxDocument {
  kind: "docx";
  fileId: string;
  html: string;
  text: string;
  headings: { level: number; text: string }[];
  tables: ExtractedTable[];
  hasMacros: boolean;
}

export interface PresentationDocument {
  kind: "presentation";
  fileId: string;
  slides: { index: number; text: string; title: string }[];
  text: string;
}

export type DocumentModel =
  | PdfDocument
  | SpreadsheetDocument
  | TableDocument
  | TextDocument
  | ImageDocument
  | StructuredDocument
  | ArchiveDocument
  | MediaDocument
  | BinaryDocument
  | DocxDocument
  | PresentationDocument;

export interface ParserContext {
  blob: Blob;
  signal?: AbortSignal;
  onProgress?: (p: { ratio?: number; message: string }) => void;
}

export interface FileParser {
  id: string;
  version: string;
  label: string;
  supports(file: FileRecord): boolean;
  parse(file: FileRecord, ctx: ParserContext): Promise<DocumentModel>;
}

export interface ActionContext {
  files: FileRecord[];
  getBlob: (fileId: string) => Promise<Blob>;
  getDocument: (fileId: string) => DocumentModel | undefined;
  config: Record<string, unknown>;
  signal?: AbortSignal;
  onProgress?: (p: { ratio?: number; message: string }) => void;
}

export interface Artifact {
  name: string;
  blob: Blob;
  mime: string;
  kind: DocumentKind;
  document?: DocumentModel;
  metadata?: Record<string, unknown>;
}

export interface ActionResult {
  artifacts: Artifact[];
  warnings?: string[];
  logs?: string[];
}

export interface FileAction {
  id: string;
  title: string;
  description: string;
  category: string;
  accepts: DocumentKind[];
  produces: DocumentKind[];
  execution: ExecutionEnv;
  keywords: string[];
  configSchema?: { key: string; label: string; type: "string" | "number" | "boolean" | "select"; options?: string[]; default?: unknown }[];
  canRun(ctx: { files: FileRecord[]; documents: Array<DocumentModel | undefined> }): boolean;
  execute(ctx: ActionContext): Promise<ActionResult>;
}

export interface Exporter {
  id: string;
  title: string;
  accepts: DocumentKind[];
  extension: string;
  mime: string;
  export(ctx: ActionContext): Promise<Artifact>;
}

export interface CompareResult {
  kind: string;
  summary: string;
  hunks: Array<{
    type: "equal" | "add" | "remove" | "change";
    left?: string;
    right?: string;
    path?: string;
  }>;
  metrics?: Record<string, number | string>;
}

export interface PipelineNodeData {
  kind: "input" | "action" | "output";
  actionId?: string;
  fileId?: string;
  exporterId?: string;
  title: string;
  accepts: DocumentKind[];
  produces: DocumentKind[];
  config: Record<string, unknown>;
  status: JobStatus | "idle";
  outputFileIds: string[];
  error?: string;
  elapsedMs?: number;
  logs: string[];
}

export interface Pipeline {
  id: string;
  name: string;
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: PipelineNodeData;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
  createdAt: number;
  modifiedAt: number;
}

export interface PluginManifest {
  id: string;
  version: string;
  label: string;
  parsers?: FileParser[];
  actions?: FileAction[];
  exporters?: Exporter[];
}

export interface SearchHit {
  fileId: string;
  name: string;
  kind: DocumentKind;
  snippet: string;
  field: "name" | "text" | "metadata";
  score: number;
}

export interface LayoutState {
  explorerSize: number;
  inspectorSize: number;
  bottomSize: number;
  activity: "files" | "pipelines" | "history" | "lineage" | "search" | "batch";
  bottomTab: "jobs" | "console" | "output";
  explorerCollapsed: boolean;
  inspectorCollapsed: boolean;
  bottomCollapsed: boolean;
  stepsCollapsed: boolean;
  minimapVisible: boolean;
  focusMode: boolean;
  inspectorClosedSections?: string[];
  stepsSize?: number;
  stepsClosedGroups?: string[];
}

export interface UiState {
  theme: "dark" | "light";
  commandOpen: boolean;
  diagnosticsOpen: boolean;
  contextMenu: { x: number; y: number; fileIds: string[] } | null;
  dropMenu: {
    x: number;
    y: number;
    sourceIds: string[];
    targetId?: string;
    intent: string;
    options: Array<{ actionId: string; title: string; detail: string }>;
  } | null;
  actionDialog: { actionId: string; fileIds: string[] } | null;
  renameId: string | null;
  documentSearch: string;
  workspaceSearch: string;
  hexOffset: number;
}
