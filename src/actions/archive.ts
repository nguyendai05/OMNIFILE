import type { ArchiveDocument, FileAction } from "@/core/types";
import { OmniError } from "@/core/errors";
import { isUnsafePath, MAX_UNCOMPRESSED } from "@/parsers/archive";

export const extractArchiveAction: FileAction = {
  id: "archive.extract",
  title: "Giải nén tất cả",
  description: "Giải nén các tệp an toàn vào không gian làm việc",
  category: "Tệp nén",
  accepts: ["archive"],
  produces: ["unknown"],
  execution: "local",
  keywords: ["extract", "unzip", "archive"],
  canRun: ({ documents }) => documents[0]?.kind === "archive",
  async execute(ctx) {
    const file = ctx.files[0]!;
    const doc = ctx.getDocument(file.id) as ArchiveDocument | undefined;
    if (!doc || doc.kind !== "archive") throw new OmniError("ParserFailure", "Tệp nén chưa được đọc");
    if (doc.totalUncompressed > MAX_UNCOMPRESSED) {
      throw new OmniError("ResourceLimit", "Dung lượng sau giải nén vượt giới hạn an toàn");
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
      if (extracted > MAX_UNCOMPRESSED) throw new OmniError("ResourceLimit", "Đã dừng giải nén do vượt giới hạn dung lượng");
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
    if (!artifacts.length) throw new OmniError("ParserFailure", "Không có tệp an toàn để giải nén");
    return {
      artifacts,
      warnings: artifacts.length >= 80 ? ["Mỗi lần chỉ giải nén tối đa 80 tệp"] : undefined,
    };
  },
};
