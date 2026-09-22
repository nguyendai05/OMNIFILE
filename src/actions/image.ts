import type { FileAction, ImageDocument } from "@/core/types";
import { OmniError } from "@/core/errors";

async function drawToCanvas(blob: Blob, mutate: (ctx: CanvasRenderingContext2D, w: number, h: number) => { w: number; h: number } | void) {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new OmniError("ParserFailure", "Không thể khởi tạo vùng vẽ");
  const size = mutate(ctx, bmp.width, bmp.height);
  if (size) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không thể mã hóa"))), mime, quality);
  });
}

export const rotateImageAction: FileAction = {
  id: "image.rotate",
  title: "Xoay 90°",
  description: "Xoay 90 độ theo chiều kim đồng hồ",
  category: "Hình ảnh",
  accepts: ["image"],
  produces: ["image"],
  execution: "local",
  keywords: ["rotate", "transform"],
  canRun: () => true,
  async execute(ctx) {
    const file = ctx.files[0]!;
    const blob = await ctx.getBlob(file.id);
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.height;
    canvas.height = bmp.width;
    const c = canvas.getContext("2d")!;
    c.translate(canvas.width / 2, canvas.height / 2);
    c.rotate(Math.PI / 2);
    c.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    bmp.close?.();
    const out = await toBlob(canvas, file.detectedMime.startsWith("image/") ? file.detectedMime : "image/png");
    return { artifacts: [{ name: file.name.replace(/(\.[^.]+)?$/, "-rot$1") || "rotated.png", blob: out, mime: out.type, kind: "image" }] };
  },
};

export const flipImageAction: FileAction = {
  id: "image.flip-h",
  title: "Lật ngang",
  description: "Lật ảnh theo trục dọc",
  category: "Hình ảnh",
  accepts: ["image"],
  produces: ["image"],
  execution: "local",
  keywords: ["flip", "mirror"],
  canRun: () => true,
  async execute(ctx) {
    const file = ctx.files[0]!;
    const blob = await ctx.getBlob(file.id);
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const c = canvas.getContext("2d")!;
    c.translate(canvas.width, 0);
    c.scale(-1, 1);
    c.drawImage(bmp, 0, 0);
    bmp.close?.();
    const out = await toBlob(canvas, "image/png");
    return { artifacts: [{ name: file.name.replace(/(\.[^.]+)?$/, "-flip.png"), blob: out, mime: "image/png", kind: "image" }] };
  },
};

export const resizeImageAction: FileAction = {
  id: "image.resize",
  title: "Đổi kích thước ảnh",
  description: "Đổi chiều rộng và giữ nguyên tỷ lệ ảnh",
  category: "Hình ảnh",
  accepts: ["image"],
  produces: ["image"],
  execution: "local",
  keywords: ["resize", "smaller", "scale", "compress"],
  configSchema: [{ key: "width", label: "Chiều rộng (px)", type: "number", default: 800 }],
  canRun: () => true,
  async execute(ctx) {
    const file = ctx.files[0]!;
    const blob = await ctx.getBlob(file.id);
    const bmp = await createImageBitmap(blob);
    const width = Number(ctx.config.width ?? 800);
    const height = Math.round((bmp.height / bmp.width) * width);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
    bmp.close?.();
    const out = await toBlob(canvas, "image/png");
    return { artifacts: [{ name: file.name.replace(/(\.[^.]+)?$/, `-${width}w.png`), blob: out, mime: "image/png", kind: "image" }] };
  },
};

export const compressImageAction: FileAction = {
  id: "image.compress",
  title: "Nén JPEG",
  description: "Nén lại thành JPEG với chất lượng 0,72",
  category: "Hình ảnh",
  accepts: ["image"],
  produces: ["image"],
  execution: "local",
  keywords: ["compress", "smaller", "jpeg", "quality"],
  canRun: () => true,
  async execute(ctx) {
    const file = ctx.files[0]!;
    const blob = await ctx.getBlob(file.id);
    const canvas = await drawToCanvas(blob, () => undefined);
    const out = await toBlob(canvas, "image/jpeg", 0.72);
    return { artifacts: [{ name: file.name.replace(/\.[^.]+$/, "") + "-compressed.jpg", blob: out, mime: "image/jpeg", kind: "image" }] };
  },
};

export const convertWebpAction: FileAction = {
  id: "image.convert-webp",
  title: "Chuyển sang WebP",
  description: "Chuyển hình ảnh sang định dạng WebP",
  category: "Hình ảnh",
  accepts: ["image"],
  produces: ["image"],
  execution: "local",
  keywords: ["convert", "webp"],
  canRun: () => true,
  async execute(ctx) {
    const file = ctx.files[0]!;
    const blob = await ctx.getBlob(file.id);
    const canvas = await drawToCanvas(blob, () => undefined);
    const out = await toBlob(canvas, "image/webp", 0.82);
    return { artifacts: [{ name: file.name.replace(/\.[^.]+$/, "") + ".webp", blob: out, mime: "image/webp", kind: "image" }] };
  },
};

let ocrAvailable: boolean | null = null;

export async function probeOcr(): Promise<boolean> {
  if (ocrAvailable !== null) return ocrAvailable;
  try {
    await import("tesseract.js");
    ocrAvailable = true;
  } catch {
    ocrAvailable = false;
  }
  return ocrAvailable;
}

export const ocrAction: FileAction = {
  id: "image.ocr",
  title: "Nhận dạng văn bản (OCR)",
  description: "Nhận dạng văn bản cục bộ bằng Tesseract.js",
  category: "Hình ảnh",
  accepts: ["image", "pdf"],
  produces: ["text"],
  execution: "local",
  keywords: ["ocr", "text", "recognize", "scan"],
  canRun: ({ files }) => files.some((f) => f.kind === "image" || f.kind === "pdf"),
  async execute(ctx) {
    const file = ctx.files[0]!;
    ctx.onProgress?.({ message: "Đang tải Tesseract" });
    let createWorker: typeof import("tesseract.js").createWorker;
    try {
      ({ createWorker } = await import("tesseract.js"));
    } catch {
      throw new OmniError("ActionUnavailable", "Không thể tải công cụ nhận dạng văn bản");
    }
    const worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          ctx.onProgress?.({ ratio: m.progress, message: `OCR ${Math.round(m.progress * 100)}%` });
        }
      },
    });
    try {
      let source: Blob | HTMLCanvasElement = await ctx.getBlob(file.id);
      if (file.kind === "pdf") {
        const { renderPdfPage } = await import("@/parsers/pdf");
        source = await renderPdfPage(source as Blob, 0, 2, ctx.signal);
      }
      const result = await worker.recognize(source);
      const text = result.data.text ?? "";
      if (!text.trim()) {
        return {
          artifacts: [
            {
              name: file.name.replace(/\.[^.]+$/, "") + ".ocr.txt",
              blob: new Blob([""], { type: "text/plain" }),
              mime: "text/plain",
              kind: "text",
              document: { kind: "text", fileId: "", text: "", encoding: "utf-8", lineCount: 0, wordCount: 0 },
            },
          ],
          warnings: ["Đã nhận dạng nhưng không tìm thấy văn bản đọc được"],
        };
      }
      return {
        artifacts: [
          {
            name: file.name.replace(/\.[^.]+$/, "") + ".ocr.txt",
            blob: new Blob([text], { type: "text/plain" }),
            mime: "text/plain",
            kind: "text",
            document: {
              kind: "text",
              fileId: "",
              text,
              encoding: "utf-8",
              lineCount: text.split(/\n/).length,
              wordCount: text.trim().split(/\s+/).length,
            },
          },
        ],
      };
    } finally {
      await worker.terminate();
    }
  },
};

export function imageOpsFrom(doc: ImageDocument | undefined) {
  return doc?.ops ?? [];
}
