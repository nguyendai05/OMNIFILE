import type { FileParser, FileRecord, ParserContext, PdfDocument, PdfPageModel, PdfTextItem } from "@/core/types";
import { OmniError, throwIfAborted } from "@/core/errors";
import { extractTablesFromItems } from "./pdf-tables";

let workerReady = false;

async function pdfjs() {
  const mod = await import("pdfjs-dist");
  if (!workerReady) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    mod.GlobalWorkerOptions.workerSrc = worker.default;
    workerReady = true;
  }
  return mod;
}

function infoString(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "str" in v) return String((v as { str: string }).str);
  return String(v);
}

export const pdfParser: FileParser = {
  id: "pdf",
  version: "1.0.0",
  label: "PDF",
  supports: (f: FileRecord) => f.kind === "pdf" || f.detectedMime === "application/pdf",
  async parse(file, ctx: ParserContext): Promise<PdfDocument> {
    throwIfAborted(ctx.signal);
    const pdfjsLib = await pdfjs();
    const data = new Uint8Array(await ctx.blob.arrayBuffer());
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data, disableAutoFetch: true, disableStream: false }).promise;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể mở PDF";
      if (/password|encrypt/i.test(msg)) {
        throw new OmniError("PermissionDenied", "PDF được mã hóa và cần mật khẩu để mở");
      }
      throw new OmniError("CorruptedFile", msg, { cause: err });
    }
    const meta = await pdf.getMetadata().catch(() => ({ info: {} }));
    const infoRaw = (meta.info ?? {}) as Record<string, unknown>;
    const info: Record<string, string> = {};
    for (const [k, v] of Object.entries(infoRaw)) info[k] = infoString(v);

    const pages: PdfPageModel[] = [];
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      throwIfAborted(ctx.signal);
      ctx.onProgress?.({ ratio: (i - 1) / pdf.numPages, message: `Trang ${i} / ${pdf.numPages}` });
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      let text = "";
      for (const it of content.items) {
        if (!("str" in it)) continue;
        const tr = it.transform as number[];
        const item: PdfTextItem = {
          str: it.str,
          x: tr[4] ?? 0,
          y: tr[5] ?? 0,
          w: it.width ?? 0,
          h: it.height ?? 0,
        };
        items.push(item);
        text += it.str;
        if ("hasEOL" in it && it.hasEOL) text += "\n";
        else text += " ";
      }
      const tables = extractTablesFromItems(items, i - 1);
      pages.push({
        index: i - 1,
        width: viewport.width,
        height: viewport.height,
        rotation: page.rotate,
        text: text.replace(/[ \t]+\n/g, "\n").trim(),
        tables,
      });
      texts.push(pages[pages.length - 1]!.text);
    }
    ctx.onProgress?.({ ratio: 1, message: "Hoàn tất" });
    return {
      kind: "pdf",
      fileId: file.id,
      pageCount: pdf.numPages,
      pages,
      info,
      encrypted: false,
      textComplete: true,
      allText: texts.join("\n\n"),
    };
  },
};

export async function renderPdfPage(blob: Blob, pageIndex: number, scale: number, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  throwIfAborted(signal);
  const pdfjsLib = await pdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new OmniError("ParserFailure", "Không thể khởi tạo vùng vẽ");
  await page.render({ canvas, viewport }).promise;
  return canvas;
}
