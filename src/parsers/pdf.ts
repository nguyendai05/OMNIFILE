import type {
  FileParser,
  FileRecord,
  ParserContext,
  PdfDocument,
  PdfPageModel,
  PdfTextItem,
} from "@/core/types";
import { OmniError, throwIfAborted } from "@/core/errors";
import { extractTablesFromItems } from "./pdf-tables";
import { normalizePdfItem } from "./pdf-text";

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
  version: "1.2.0",
  label: "PDF",
  supports: (f: FileRecord) => f.kind === "pdf" || f.detectedMime === "application/pdf",
  async parse(file, ctx: ParserContext): Promise<PdfDocument> {
    throwIfAborted(ctx.signal);
    const pdfjsLib = await pdfjs();
    const data = new Uint8Array(await ctx.blob.arrayBuffer());
    let pdf;
    const loading = pdfjsLib.getDocument({ data, disableAutoFetch: true, disableStream: false });
    try {
      pdf = await loading.promise;
    } catch (err) {
      await loading.destroy();
      const msg = err instanceof Error ? err.message : "Không thể mở PDF";
      if (/password|encrypt/i.test(msg)) {
        throw new OmniError("PermissionDenied", "PDF được mã hóa và cần mật khẩu để mở");
      }
      throw new OmniError("CorruptedFile", msg, { cause: err });
    }
    try {
      const meta = await pdf.getMetadata().catch(() => ({ info: {} }));
      const infoRaw = (meta.info ?? {}) as Record<string, unknown>;
      const info: Record<string, string> = {};
      for (const [k, v] of Object.entries(infoRaw)) info[k] = infoString(v);

      const pages: PdfPageModel[] = [];
      const texts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        throwIfAborted(ctx.signal);
        ctx.onProgress?.({
          ratio: (i - 1) / pdf.numPages,
          message: `Trang ${i} / ${pdf.numPages}`,
        });
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        // Resolve font objects; text styles alone usually only say "sans-serif".
        await page.getOperatorList();
        const items: PdfTextItem[] = [];
        let text = "";
        for (const it of content.items) {
          if (!("str" in it)) continue;
          const font: unknown = page.commonObjs.has(it.fontName)
            ? page.commonObjs.get(it.fontName)
            : undefined;
          const fontName =
            font && typeof font === "object" && "name" in font
              ? String(font.name)
              : (content.styles[it.fontName]?.fontFamily ?? "");
          const item = normalizePdfItem(it, viewport, fontName, content.styles[it.fontName]);
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
          items,
          layoutVersion: 2,
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
        textComplete: pages.every((p) => Boolean(p.text.trim())),
        allText: texts.join("\n\n"),
      };
    } finally {
      await loading.destroy();
    }
  },
};

export async function renderPdfPage(
  blob: Blob,
  pageIndex: number,
  scale: number,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
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
