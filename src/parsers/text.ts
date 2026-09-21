import type { FileParser, FileRecord, ParserContext, TextDocument } from "@/core/types";
import { throwIfAborted } from "@/core/errors";

function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes).replace(/^\uFEFF/, ""), encoding: "utf-16le" };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes).replace(/^\uFEFF/, ""), encoding: "utf-16be" };
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes).slice(1), encoding: "utf-8-bom" };
  }
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (utf8.includes("\uFFFD") && bytes.some((b) => b > 127)) {
    try {
      return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" };
    } catch {
      /* keep utf8 */
    }
  }
  return { text: utf8.replace(/^\uFEFF/, ""), encoding: "utf-8" };
}

function headings(text: string) {
  const out: { level: number; text: string; offset: number }[] = [];
  const re = /^(#{1,6})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ level: m[1]!.length, text: m[2]!.trim(), offset: m.index });
  }
  return out;
}

function langFromExt(ext: string): string | undefined {
  const map: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    tsx: "tsx",
    jsx: "jsx",
    py: "python",
    css: "css",
    html: "html",
    json: "json",
    md: "markdown",
  };
  return map[ext];
}

function wordCount(text: string): number {
  const parts = text.trim().split(/\s+/);
  return parts[0] === "" ? 0 : parts.length;
}

export const textParser: FileParser = {
  id: "text",
  version: "1.0.0",
  label: "Text",
  supports: (f: FileRecord) =>
    f.kind === "text" || f.kind === "markdown" || f.kind === "code" || f.kind === "html" || f.detectedMime.startsWith("text/"),
  async parse(file, ctx: ParserContext): Promise<TextDocument> {
    throwIfAborted(ctx.signal);
    const bytes = new Uint8Array(await ctx.blob.arrayBuffer());
    const { text, encoding } = decodeText(bytes);
    const kind: TextDocument["kind"] =
      file.kind === "markdown" || file.extension === "md"
        ? "markdown"
        : file.kind === "html" || file.extension === "html" || file.extension === "htm"
          ? "html"
          : file.kind === "code"
            ? "code"
            : "text";
    return {
      kind,
      fileId: file.id,
      text,
      encoding,
      language: langFromExt(file.extension),
      lineCount: text ? text.split(/\r?\n/).length : 0,
      wordCount: wordCount(text),
      headings: kind === "markdown" ? headings(text) : undefined,
    };
  },
};
