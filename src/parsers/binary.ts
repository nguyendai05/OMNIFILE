import type { BinaryDocument, FileParser, FileRecord, ParserContext } from "@/core/types";
import { extractStrings, shannonEntropy } from "@/core/table-ops";
import { throwIfAborted } from "@/core/errors";

export async function parseBinary(file: FileRecord, ctx: ParserContext): Promise<BinaryDocument> {
  throwIfAborted(ctx.signal);
  const size = Math.min(ctx.blob.size, 64 * 1024);
  const head = new Uint8Array(await ctx.blob.slice(0, size).arrayBuffer());
  const midStart = Math.max(0, Math.floor(ctx.blob.size / 2) - 4096);
  const mid = ctx.blob.size > size ? new Uint8Array(await ctx.blob.slice(midStart, midStart + 8192).arrayBuffer()) : head;
  const sample = head.length >= 8192 ? head.subarray(0, 8192) : head;
  const magic = Array.from(head.subarray(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  return {
    kind: file.kind === "unknown" ? "unknown" : "binary",
    fileId: file.id,
    magicHex: magic,
    entropy: shannonEntropy(sample.length ? sample : mid),
    strings: extractStrings(head),
    preview: head.subarray(0, 4096),
  };
}

export const binaryParser: FileParser = {
  id: "binary",
  version: "1.0.0",
  label: "Binary",
  supports: (f) => f.kind === "binary" || f.kind === "unknown",
  parse: parseBinary,
};
