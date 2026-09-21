import type { FileParser, FileRecord, ParserContext, StructuredDocument } from "@/core/types";
import { OmniError, throwIfAborted } from "@/core/errors";

function countPaths(value: unknown, depth = 0): number {
  if (depth > 40) return 1;
  if (value && typeof value === "object") {
    const entries = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
    return 1 + entries.reduce((n: number, v) => n + countPaths(v, depth + 1), 0);
  }
  return 1;
}

export const jsonParser: FileParser = {
  id: "json",
  version: "1.0.0",
  label: "JSON",
  supports: (f: FileRecord) => f.kind === "json" || f.extension === "json" || f.extension === "jsonl",
  async parse(file, ctx: ParserContext): Promise<StructuredDocument> {
    throwIfAborted(ctx.signal);
    const text = await ctx.blob.text();
    if (file.extension === "jsonl") {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const parsed: unknown[] = [];
      let error: string | undefined;
      for (let i = 0; i < lines.length; i++) {
        try {
          parsed.push(JSON.parse(lines[i]!));
        } catch (err) {
          error = `Line ${i + 1}: ${err instanceof Error ? err.message : "invalid JSON"}`;
          break;
        }
      }
      return {
        kind: "json",
        fileId: file.id,
        text,
        parsed,
        valid: !error,
        error,
        pathCount: countPaths(parsed),
      };
    }
    try {
      const parsed = JSON.parse(text);
      return { kind: "json", fileId: file.id, text, parsed, valid: true, pathCount: countPaths(parsed) };
    } catch (err) {
      return {
        kind: "json",
        fileId: file.id,
        text,
        parsed: null,
        valid: false,
        error: err instanceof Error ? err.message : "Invalid JSON",
        pathCount: 0,
      };
    }
  },
};

export const yamlParser: FileParser = {
  id: "yaml",
  version: "1.0.0",
  label: "YAML",
  supports: (f: FileRecord) => f.kind === "yaml" || f.extension === "yaml" || f.extension === "yml",
  async parse(file, ctx: ParserContext): Promise<StructuredDocument> {
    throwIfAborted(ctx.signal);
    const text = await ctx.blob.text();
    const yaml = await import("js-yaml");
    try {
      const parsed = yaml.load(text);
      return { kind: "yaml", fileId: file.id, text, parsed, valid: true, pathCount: countPaths(parsed) };
    } catch (err) {
      return {
        kind: "yaml",
        fileId: file.id,
        text,
        parsed: null,
        valid: false,
        error: err instanceof Error ? err.message : "Invalid YAML",
        pathCount: 0,
      };
    }
  },
};

export const xmlParser: FileParser = {
  id: "xml",
  version: "1.0.0",
  label: "XML",
  supports: (f: FileRecord) => f.kind === "xml" || f.extension === "xml",
  async parse(file, ctx: ParserContext): Promise<StructuredDocument> {
    throwIfAborted(ctx.signal);
    const text = await ctx.blob.text();
    try {
      const { XMLParser } = await import("fast-xml-parser");
      const parser = new XMLParser({ ignoreAttributes: false, maxNestedTags: 40 });
      const parsed = parser.parse(text);
      return { kind: "xml", fileId: file.id, text, parsed, valid: true, pathCount: countPaths(parsed) };
    } catch (err) {
      throw new OmniError("CorruptedFile", err instanceof Error ? err.message : "XML parse failed", { cause: err });
    }
  },
};
