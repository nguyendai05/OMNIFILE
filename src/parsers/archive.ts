import type { ArchiveDocument, ArchiveEntry, FileParser, FileRecord, ParserContext } from "@/core/types";
import { OmniError, throwIfAborted } from "@/core/errors";

const MAX_FILES = 5000;
const MAX_UNCOMPRESSED = 400 * 1024 * 1024;
const MAX_RATIO = 1000;
const MAX_DEPTH = 3;

function isUnsafePath(path: string): { unsafe: boolean; reason?: string } {
  const n = path.replace(/\\/g, "/");
  if (n.includes("\0")) return { unsafe: true, reason: "nul" };
  if (n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return { unsafe: true, reason: "absolute path" };
  const parts = n.split("/");
  let depth = 0;
  for (const p of parts) {
    if (p === "..") {
      depth--;
      if (depth < 0) return { unsafe: true, reason: "zip slip / path traversal" };
    } else if (p && p !== ".") depth++;
  }
  return { unsafe: false };
}

export const zipParser: FileParser = {
  id: "zip",
  version: "1.0.0",
  label: "ZIP",
  supports: (f: FileRecord) => f.kind === "archive" && (f.extension === "zip" || f.detectedMime === "application/zip"),
  async parse(file, ctx: ParserContext): Promise<ArchiveDocument> {
    throwIfAborted(ctx.signal);
    const JSZip = (await import("jszip")).default;
    let zip;
    try {
      zip = await JSZip.loadAsync(ctx.blob);
    } catch (err) {
      throw new OmniError("CorruptedFile", "Không thể đọc tệp nén", { cause: err });
    }
    const entries: ArchiveEntry[] = [];
    let total = 0;
    const warnings: string[] = [];
    const names = Object.keys(zip.files);
    if (names.length > MAX_FILES) warnings.push(`Archive lists ${names.length} entries; showing first ${MAX_FILES}`);
    for (const name of names.slice(0, MAX_FILES)) {
      const z = zip.files[name]!;
      const unsafe = isUnsafePath(name);
      const size = (z as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
      const compressed = (z as unknown as { _data?: { compressedSize?: number } })._data?.compressedSize ?? 0;
      total += size;
      if (compressed > 0 && size / compressed > MAX_RATIO) {
        warnings.push(`Suspicious compression ratio on ${name}`);
      }
      entries.push({
        path: name,
        size,
        compressedSize: compressed,
        isDir: z.dir,
        unsafe: unsafe.unsafe,
        reason: unsafe.reason,
      });
    }
    if (total > MAX_UNCOMPRESSED) warnings.push("Dung lượng giải nén vượt giới hạn an toàn");
    const compressed = ctx.blob.size || 1;
    return {
      kind: "archive",
      fileId: file.id,
      entries,
      totalUncompressed: total,
      compressed,
      ratio: total / compressed,
      warnings,
    };
  },
};

export const gzipParser: FileParser = {
  id: "gzip",
  version: "1.0.0",
  label: "GZIP / TAR",
  supports: (f: FileRecord) =>
    f.kind === "archive" && (f.extension === "gz" || f.extension === "tgz" || f.extension === "tar" || f.detectedMime.includes("gzip") || f.detectedMime.includes("tar")),
  async parse(file, ctx: ParserContext): Promise<ArchiveDocument> {
    throwIfAborted(ctx.signal);
    const fflate = await import("fflate");
    const bytes = new Uint8Array(await ctx.blob.arrayBuffer());
    let raw = bytes;
    if (file.extension === "gz" || file.extension === "tgz" || (bytes[0] === 0x1f && bytes[1] === 0x8b)) {
      try {
        raw = fflate.gunzipSync(bytes);
      } catch (err) {
        throw new OmniError("CorruptedFile", "Không thể giải nén GZIP", { cause: err });
      }
    }
    const entries: ArchiveEntry[] = [];
    if (file.extension === "tar" || file.extension === "tgz" || looksLikeTar(raw)) {
      let offset = 0;
      while (offset + 512 <= raw.length) {
        const block = raw.subarray(offset, offset + 512);
        const name = readTarString(block, 0, 100);
        if (!name) break;
        const sizeStr = readTarString(block, 124, 12).trim();
        const size = parseInt(sizeStr, 8) || 0;
        const unsafe = isUnsafePath(name);
        entries.push({ path: name, size, compressedSize: size, isDir: name.endsWith("/"), unsafe: unsafe.unsafe, reason: unsafe.reason });
        offset += 512 + Math.ceil(size / 512) * 512;
        if (entries.length > MAX_FILES) break;
      }
    } else {
      entries.push({
        path: file.name.replace(/\.gz$/i, ""),
        size: raw.length,
        compressedSize: bytes.length,
        isDir: false,
        unsafe: false,
      });
    }
    return {
      kind: "archive",
      fileId: file.id,
      entries,
      totalUncompressed: entries.reduce((a, e) => a + e.size, 0),
      compressed: bytes.length,
      ratio: entries.reduce((a, e) => a + e.size, 0) / Math.max(bytes.length, 1),
      warnings: [],
    };
  },
};

function readTarString(block: Uint8Array, start: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = block[start + i]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

function looksLikeTar(bytes: Uint8Array): boolean {
  if (bytes.length < 262) return false;
  const ustar = String.fromCharCode(...bytes.subarray(257, 262));
  return ustar === "ustar";
}

export { MAX_FILES, MAX_UNCOMPRESSED, MAX_RATIO, MAX_DEPTH, isUnsafePath };
