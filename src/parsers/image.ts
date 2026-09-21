import type { FileParser, FileRecord, ImageDocument, ParserContext } from "@/core/types";
import { OmniError, throwIfAborted } from "@/core/errors";

export async function loadImageBitmap(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }
  throw new OmniError("ParserFailure", "Image decoding is not supported in this browser");
}

function histogramFrom(canvas: HTMLCanvasElement | OffscreenCanvas): { r: number[]; g: number[]; b: number[] } {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const r = new Array(32).fill(0);
  const g = new Array(32).fill(0);
  const b = new Array(32).fill(0);
  if (!ctx) return { r, g, b };
  const w = Math.min(canvas.width, 256);
  const h = Math.min(canvas.height, 256);
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0; i < data.length; i += 16) {
    r[data[i]! >> 3]++;
    g[data[i + 1]! >> 3]++;
    b[data[i + 2]! >> 3]++;
  }
  return { r, g, b };
}

export const imageParser: FileParser = {
  id: "image",
  version: "1.0.0",
  label: "Image",
  supports: (f: FileRecord) => f.kind === "image" || f.kind === "svg" || f.detectedMime.startsWith("image/"),
  async parse(file, ctx: ParserContext): Promise<ImageDocument> {
    throwIfAborted(ctx.signal);
    if (file.kind === "svg" || file.detectedMime.includes("svg")) {
      const text = await ctx.blob.text();
      const w = Number(/width=["']?(\d+)/.exec(text)?.[1] ?? 0);
      const h = Number(/height=["']?(\d+)/.exec(text)?.[1] ?? 0);
      const vb = /viewBox=["']([\d.\s-]+)/.exec(text)?.[1]?.split(/[\s,]+/).map(Number);
      return {
        kind: "svg",
        fileId: file.id,
        width: w || vb?.[2] || 0,
        height: h || vb?.[3] || 0,
        format: "svg",
        hasAlpha: true,
        ops: [],
      };
    }
    const bmp = await loadImageBitmap(ctx.blob);
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(Math.min(bmp.width, 256), Math.min(bmp.height, 256)) : document.createElement("canvas");
    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = Math.min(bmp.width, 256);
      canvas.height = Math.min(bmp.height, 256);
    }
    const cctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    cctx?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const hist = cctx ? histogramFrom(canvas) : undefined;
    const format = file.extension || file.detectedMime.split("/")[1] || "image";
    const animated = format === "gif" || file.detectedMime === "image/gif";
    const doc: ImageDocument = {
      kind: "image",
      fileId: file.id,
      width: bmp.width,
      height: bmp.height,
      format,
      hasAlpha: file.detectedMime === "image/png" || file.detectedMime === "image/webp" || format === "png",
      histogram: hist,
      ops: [],
      animated,
    };
    bmp.close?.();
    return doc;
  },
};
