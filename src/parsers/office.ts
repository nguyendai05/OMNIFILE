import type { DocxDocument, ExtractedTable, FileParser, FileRecord, ParserContext, PresentationDocument } from "@/core/types";
import { OmniError, throwIfAborted } from "@/core/errors";

function extractHeadingsFromHtml(html: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  const re = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    out.push({ level: Number(m[1]), text: m[2]!.replace(/<[^>]+>/g, "").trim() });
  }
  return out;
}

function tablesFromHtml(html: string): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const re = /<table[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = re.exec(html))) {
    const block = m[0];
    const rows: string[][] = [];
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let r: RegExpExecArray | null;
    while ((r = rowRe.exec(block))) {
      const cells: string[] = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let c: RegExpExecArray | null;
      while ((c = cellRe.exec(r[0]))) {
        cells.push(c[1]!.replace(/<[^>]+>/g, "").trim());
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) {
      tables.push({ index, page: 0, headers: rows[0] ?? [], rows: rows.slice(1), confidence: 0.7 });
      index++;
    }
  }
  return tables;
}

export const docxParser: FileParser = {
  id: "docx",
  version: "1.0.0",
  label: "DOCX",
  supports: (f: FileRecord) => f.kind === "docx" || f.extension === "docx",
  async parse(file, ctx: ParserContext): Promise<DocxDocument> {
    throwIfAborted(ctx.signal);
    const mammoth = await import("mammoth");
    const buf = await ctx.blob.arrayBuffer();
    let html = "";
    let text = "";
    try {
      const htmlRes = await mammoth.convertToHtml({ arrayBuffer: buf });
      html = htmlRes.value;
      const textRes = await mammoth.extractRawText({ arrayBuffer: buf });
      text = textRes.value;
    } catch (err) {
      throw new OmniError("CorruptedFile", "Không thể đọc DOCX", { cause: err });
    }
    const JSZip = (await import("jszip")).default;
    let hasMacros = false;
    try {
      const zip = await JSZip.loadAsync(ctx.blob);
      hasMacros = Object.keys(zip.files).some((n) => /vba|\.bin$/i.test(n) || n.includes("macros"));
    } catch {
      /* ignore */
    }
    return {
      kind: "docx",
      fileId: file.id,
      html,
      text,
      headings: extractHeadingsFromHtml(html),
      tables: tablesFromHtml(html),
      hasMacros,
    };
  },
};

export const pptxParser: FileParser = {
  id: "pptx",
  version: "1.0.0",
  label: "PPTX",
  supports: (f: FileRecord) => f.kind === "presentation" || f.extension === "pptx",
  async parse(file, ctx: ParserContext): Promise<PresentationDocument> {
    throwIfAborted(ctx.signal);
    const JSZip = (await import("jszip")).default;
    let zip;
    try {
      zip = await JSZip.loadAsync(ctx.blob);
    } catch (err) {
      throw new OmniError("CorruptedFile", "Không thể đọc PPTX", { cause: err });
    }
    const slideFiles = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const slides: PresentationDocument["slides"] = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.files[slideFiles[i]!]!.async("string");
      const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1]!).filter(Boolean);
      slides.push({ index: i, title: texts[0] ?? `Slide ${i + 1}`, text: texts.join("\n") });
    }
    return {
      kind: "presentation",
      fileId: file.id,
      slides,
      text: slides.map((s, i) => `--- Slide ${i + 1} ---\n${s.text}`).join("\n\n"),
    };
  },
};
