import type { DocumentKind } from "./types";

export interface MimeGuess {
  mime: string;
  kind: DocumentKind;
  extension: string;
}

const EXT_MAP: Record<string, MimeGuess> = {
  pdf: { mime: "application/pdf", kind: "pdf", extension: "pdf" },
  png: { mime: "image/png", kind: "image", extension: "png" },
  jpg: { mime: "image/jpeg", kind: "image", extension: "jpg" },
  jpeg: { mime: "image/jpeg", kind: "image", extension: "jpeg" },
  webp: { mime: "image/webp", kind: "image", extension: "webp" },
  gif: { mime: "image/gif", kind: "image", extension: "gif" },
  bmp: { mime: "image/bmp", kind: "image", extension: "bmp" },
  svg: { mime: "image/svg+xml", kind: "svg", extension: "svg" },
  csv: { mime: "text/csv", kind: "spreadsheet", extension: "csv" },
  tsv: { mime: "text/tab-separated-values", kind: "spreadsheet", extension: "tsv" },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "spreadsheet",
    extension: "xlsx",
  },
  xls: { mime: "application/vnd.ms-excel", kind: "spreadsheet", extension: "xls" },
  json: { mime: "application/json", kind: "json", extension: "json" },
  jsonl: { mime: "application/jsonl", kind: "json", extension: "jsonl" },
  xml: { mime: "application/xml", kind: "xml", extension: "xml" },
  yaml: { mime: "application/yaml", kind: "yaml", extension: "yaml" },
  yml: { mime: "application/yaml", kind: "yaml", extension: "yml" },
  txt: { mime: "text/plain", kind: "text", extension: "txt" },
  md: { mime: "text/markdown", kind: "markdown", extension: "md" },
  markdown: { mime: "text/markdown", kind: "markdown", extension: "md" },
  html: { mime: "text/html", kind: "html", extension: "html" },
  htm: { mime: "text/html", kind: "html", extension: "htm" },
  css: { mime: "text/css", kind: "code", extension: "css" },
  js: { mime: "text/javascript", kind: "code", extension: "js" },
  ts: { mime: "text/typescript", kind: "code", extension: "ts" },
  tsx: { mime: "text/tsx", kind: "code", extension: "tsx" },
  jsx: { mime: "text/jsx", kind: "code", extension: "jsx" },
  py: { mime: "text/x-python", kind: "code", extension: "py" },
  log: { mime: "text/plain", kind: "text", extension: "log" },
  zip: { mime: "application/zip", kind: "archive", extension: "zip" },
  tar: { mime: "application/x-tar", kind: "archive", extension: "tar" },
  gz: { mime: "application/gzip", kind: "archive", extension: "gz" },
  tgz: { mime: "application/gzip", kind: "archive", extension: "tgz" },
  "7z": { mime: "application/x-7z-compressed", kind: "unknown", extension: "7z" },
  rar: { mime: "application/vnd.rar", kind: "unknown", extension: "rar" },
  mp3: { mime: "audio/mpeg", kind: "audio", extension: "mp3" },
  wav: { mime: "audio/wav", kind: "audio", extension: "wav" },
  ogg: { mime: "audio/ogg", kind: "audio", extension: "ogg" },
  aac: { mime: "audio/aac", kind: "audio", extension: "aac" },
  mp4: { mime: "video/mp4", kind: "video", extension: "mp4" },
  webm: { mime: "video/webm", kind: "video", extension: "webm" },
  mov: { mime: "video/quicktime", kind: "video", extension: "mov" },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "docx",
    extension: "docx",
  },
  doc: { mime: "application/msword", kind: "unknown", extension: "doc" },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    kind: "presentation",
    extension: "pptx",
  },
  ppt: { mime: "application/vnd.ms-powerpoint", kind: "unknown", extension: "ppt" },
  odt: { mime: "application/vnd.oasis.opendocument.text", kind: "unknown", extension: "odt" },
};

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

export function guessFromExtension(name: string): MimeGuess | null {
  const i = name.lastIndexOf(".");
  if (i <= 0) return null;
  const ext = name.slice(i + 1).toLowerCase();
  return EXT_MAP[ext] ?? null;
}

export function guessFromMagic(bytes: Uint8Array): MimeGuess | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return { mime: "application/pdf", kind: "pdf", extension: "pdf" };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return { mime: "image/png", kind: "image", extension: "png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", kind: "image", extension: "jpg" };
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return { mime: "image/gif", kind: "image", extension: "gif" };
  }
  if (startsWith(bytes, [0x42, 0x4d])) {
    return { mime: "image/bmp", kind: "image", extension: "bmp" };
  }
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WEBP")) {
    return { mime: "image/webp", kind: "image", extension: "webp" };
  }
  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WAVE")) {
    return { mime: "audio/wav", kind: "audio", extension: "wav" };
  }
  if (startsWith(bytes, [0x1f, 0x8b])) {
    return { mime: "application/gzip", kind: "archive", extension: "gz" };
  }
  if (asciiAt(bytes, 257, "ustar") || asciiAt(bytes, 0, "ustar")) {
    return { mime: "application/x-tar", kind: "archive", extension: "tar" };
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    return { mime: "application/zip", kind: "archive", extension: "zip" };
  }
  if (startsWith(bytes, [0x49, 0x44, 0x33]) || startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3])) {
    return { mime: "audio/mpeg", kind: "audio", extension: "mp3" };
  }
  if (bytes.length > 8 && asciiAt(bytes, 4, "ftyp")) {
    return { mime: "video/mp4", kind: "video", extension: "mp4" };
  }
  if (asciiAt(bytes, 0, "OggS")) {
    return { mime: "audio/ogg", kind: "audio", extension: "ogg" };
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { mime: "video/webm", kind: "video", extension: "webm" };
  }
  if (asciiAt(bytes, 0, "{") || asciiAt(bytes, 0, "[")) {
    return { mime: "application/json", kind: "json", extension: "json" };
  }
  if (asciiAt(bytes, 0, "<?xml") || asciiAt(bytes, 0, "<svg") || asciiAt(bytes, 0, "<html")) {
    if (asciiAt(bytes, 0, "<svg") || bytesIncludes(bytes, "<svg")) {
      return { mime: "image/svg+xml", kind: "svg", extension: "svg" };
    }
    if (bytesIncludes(bytes, "<html") || bytesIncludes(bytes, "<HTML")) {
      return { mime: "text/html", kind: "html", extension: "html" };
    }
    return { mime: "application/xml", kind: "xml", extension: "xml" };
  }
  if (isMostlyText(bytes)) {
    return { mime: "text/plain", kind: "text", extension: "txt" };
  }
  return null;
}

function bytesIncludes(bytes: Uint8Array, text: string): boolean {
  const n = Math.min(bytes.length, 256);
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[i]!);
  return s.toLowerCase().includes(text.toLowerCase());
}

export function isMostlyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  const n = Math.min(bytes.length, 800);
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i]!;
    if (b === 9 || b === 10 || b === 13) continue;
    if (b < 32 && b !== 0) odd++;
    else if (b === 0) odd += 2;
  }
  return odd / n < 0.05;
}

export function refineZipKind(names: string[]): MimeGuess {
  const set = new Set(names.map((n) => n.replace(/\\/g, "/")));
  if ([...set].some((n) => n.startsWith("word/"))) {
    return {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "docx",
      extension: "docx",
    };
  }
  if ([...set].some((n) => n.startsWith("xl/"))) {
    return {
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind: "spreadsheet",
      extension: "xlsx",
    };
  }
  if ([...set].some((n) => n.startsWith("ppt/"))) {
    return {
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kind: "presentation",
      extension: "pptx",
    };
  }
  return { mime: "application/zip", kind: "archive", extension: "zip" };
}

export function detectMime(name: string, declared: string, head: Uint8Array): MimeGuess {
  const magic = guessFromMagic(head);
  const ext = guessFromExtension(name);
  if (magic && magic.kind !== "archive" && magic.kind !== "text") return magic;
  if (magic?.kind === "archive" && ext && (ext.kind === "docx" || ext.kind === "spreadsheet" || ext.kind === "presentation")) {
    return ext;
  }
  if (magic) {
    if (ext && magic.kind === "text") return ext;
    if (ext && magic.kind === "archive") return magic;
    return magic;
  }
  if (ext) return ext;
  if (declared && declared !== "application/octet-stream") {
    const fromDecl = Object.values(EXT_MAP).find((v) => v.mime === declared);
    if (fromDecl) return fromDecl;
  }
  return { mime: declared || "application/octet-stream", kind: "unknown", extension: extnameOnly(name) };
}

function extnameOnly(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function kindLabel(kind: DocumentKind): string {
  const map: Record<DocumentKind, string> = {
    pdf: "PDF",
    spreadsheet: "Bảng tính",
    table: "Bảng",
    text: "Văn bản",
    markdown: "Markdown",
    code: "Mã nguồn",
    html: "HTML",
    image: "Hình ảnh",
    svg: "SVG",
    archive: "Tệp nén",
    json: "JSON",
    xml: "XML",
    yaml: "YAML",
    binary: "Nhị phân",
    audio: "Âm thanh",
    video: "Video",
    presentation: "Bản trình chiếu",
    docx: "Tài liệu",
    folder: "Thư mục",
    unknown: "Không xác định",
  };
  return map[kind];
}

export function isUnavailableArchive(ext: string): boolean {
  return ext === "7z" || ext === "rar";
}
