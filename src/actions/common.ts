import type { FileAction } from "@/core/types";
import { sha256Blob } from "@/core/hash";

export const hashAction: FileAction = {
  id: "common.hash",
  title: "Tính mã băm SHA-256",
  description: "Tính và lưu mã băm của tệp ngay trên thiết bị",
  category: "Inspect",
  accepts: ["pdf", "spreadsheet", "table", "text", "markdown", "code", "html", "image", "svg", "archive", "json", "xml", "yaml", "binary", "audio", "video", "presentation", "docx", "unknown"],
  produces: ["json"],
  execution: "local",
  keywords: ["hash", "sha256", "checksum", "duplicate"],
  canRun: () => true,
  async execute(ctx) {
    const rows = [];
    for (const f of ctx.files) {
      const blob = await ctx.getBlob(f.id);
      const hash = await sha256Blob(blob, ctx.signal);
      rows.push({ name: f.name, sha256: hash, size: f.size });
    }
    const text = JSON.stringify(rows, null, 2);
    return {
      artifacts: [
        {
          name: ctx.files.length === 1 ? `${ctx.files[0]!.name}.sha256.json` : "hashes.json",
          blob: new Blob([text], { type: "application/json" }),
          mime: "application/json",
          kind: "json",
        },
      ],
    };
  },
};

export const metadataAction: FileAction = {
  id: "common.metadata",
  title: "Xuất thông tin tệp",
  description: "Xuất thông tin tệp dưới dạng JSON",
  category: "Inspect",
  accepts: ["pdf", "spreadsheet", "table", "text", "markdown", "code", "html", "image", "svg", "archive", "json", "xml", "yaml", "binary", "audio", "video", "presentation", "docx", "unknown"],
  produces: ["json"],
  execution: "local",
  keywords: ["metadata", "inspect", "properties"],
  canRun: () => true,
  async execute(ctx) {
    const payload = ctx.files.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      mime: f.detectedMime,
      size: f.size,
      sha256: f.sha256,
      source: f.source,
      metadata: f.metadata,
    }));
    const text = JSON.stringify(payload, null, 2);
    return {
      artifacts: [
        {
          name: "metadata.json",
          blob: new Blob([text], { type: "application/json" }),
          mime: "application/json",
          kind: "json",
        },
      ],
    };
  },
};
