import type { ArchiveDocument, FileAction } from "@/core/types";
import { OmniError } from "@/core/errors";
import { isUnsafePath, MAX_UNCOMPRESSED } from "@/parsers/archive";

export const extractArchiveAction: FileAction = {
  id: "archive.extract",
  title: "Extract all",
  description: "Unpack safe archive members into the workspace",
  category: "Archive",
  accepts: ["archive"],
  produces: ["unknown"],
  execution: "local",
  keywords: ["extract", "unzip", "archive"],
  canRun: ({ documents }) => documents[0]?.kind === "archive",
  async execute(ctx) {
    const file = ctx.files[0]!;
    const doc = ctx.getDocument(file.id) as ArchiveDocument | undefined;
    if (!doc || doc.kind !== "archive") throw new OmniError("ParserFailure", "Archive not parsed");
    if (doc.totalUncompressed > MAX_UNCOMPRESSED) {
      throw new OmniError("ResourceLimit", "Archive exceeds the uncompressed size safety limit");
    }
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await ctx.getBlob(file.id));
    const artifacts = [];
    let extracted = 0;
    for (const entry of doc.entries) {
      if (entry.isDir || entry.unsafe) continue;
      const check = isUnsafePath(entry.path);
      if (check.unsafe) continue;
      const z = zip.file(entry.path);
      if (!z) continue;
      const blob = await z.async("blob");
      extracted += blob.size;
      if (extracted > MAX_UNCOMPRESSED) throw new OmniError("ResourceLimit", "Extraction aborted — size limit");
      const base = entry.path.split("/").filter(Boolean).pop() ?? entry.path;
      artifacts.push({
        name: base,
        blob,
        mime: blob.type || "application/octet-stream",
        kind: "unknown" as const,
        metadata: { archivePath: entry.path },
      });
      if (artifacts.length >= 80) break;
    }
    if (!artifacts.length) throw new OmniError("ParserFailure", "No safe files to extract");
    return {
      artifacts,
      warnings: artifacts.length >= 80 ? ["Extraction capped at 80 files"] : undefined,
    };
  },
};
