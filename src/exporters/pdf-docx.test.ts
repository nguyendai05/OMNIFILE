import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import mammoth from "mammoth";
import { XMLValidator } from "fast-xml-parser";
import { exportPdfToDocx, parsePageRange, DOCX_MIME } from "./pdf-docx.ts";
import type { PdfDocument, PdfPageModel } from "../core/types.ts";

const page = (index: number, text: string): PdfPageModel => ({
  index,
  text,
  width: 612,
  height: 792,
  rotation: 0,
  tables: [],
});
const pdf = (pages: PdfPageModel[]): PdfDocument => ({
  kind: "pdf",
  fileId: "test",
  pageCount: pages.length,
  pages,
  info: {},
  encrypted: false,
  textComplete: true,
  allText: pages.map((p) => p.text).join("\n"),
});
async function unpack(blob: Blob) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.equal(XMLValidator.validate(xml), true);
  return {
    xml,
    text: (await mammoth.extractRawText({ buffer })).value,
    html: (await mammoth.convertToHtml({ buffer })).value,
  };
}

test("page ranges are sorted, deduplicated and reject invalid / excessive values", () => {
  assert.deepEqual(parsePageRange("", 3), [0, 1, 2]);
  assert.deepEqual(parsePageRange("3, 1-2, 2", 3), [0, 1, 2]);
  for (const bad of ["0", "4", "2-1", "1,", "all", "1.5", "1-9999999999", "-1", "1e2"])
    assert.throws(() => parsePageRange(bad, 3));
});

test("DOCX roundtrip preserves Unicode, escaping, section sizes and selected pages", async () => {
  const doc = pdf([
    page(0, "Tiếng Việt & <script> \u0001"),
    { ...page(1, "Landscape"), width: 792, height: 612 },
    page(2, "Excluded"),
  ]);
  const { blob } = await exportPdfToDocx(doc, { pageRange: "1-2" });
  assert.equal(blob.type, DOCX_MIME);
  const out = await unpack(blob);
  assert.ok(out.text.includes("Tiếng Việt & <script>"));
  assert.ok(!out.text.includes("Excluded"));
  assert.ok(!out.xml.includes("\u0001"));
  assert.equal((out.xml.match(/<w:sectPr>/g) ?? []).length, 2);
  assert.match(out.xml, /w:w="15840" w:h="12240"/);
  assert.ok(!out.html.includes("<script>"));
});

test("positioned text keeps adjacent fragments together and font emphasis", async () => {
  const p = page(0, "Hello world");
  p.items = [
    { str: "Hel", x: 10, y: 700, w: 15, h: 16, bold: true },
    { str: "lo", x: 25, y: 700, w: 10, h: 16, italic: true },
    { str: "world", x: 40, y: 700, w: 30, h: 16 },
  ];
  const out = await unpack((await exportPdfToDocx(pdf([p]))).blob);
  assert.match(out.text, /Hello world/);
  assert.match(out.xml, /<w:b\/>/);
  assert.match(out.xml, /<w:i\/>/);
  assert.match(out.xml, /w:sz w:val="32"/);
  const plain = await unpack((await exportPdfToDocx(pdf([p]), { formatting: false })).blob);
  assert.ok(!plain.xml.includes('<w:sz w:val="32"'));
  assert.ok(!plain.xml.includes("<w:b/>"));
});

test("tables become editable cells without duplicating text and can be disabled", async () => {
  const p = page(0, "Name Amount Alpha 42 Notes");
  p.items = [
    { str: "Name", x: 10, y: 700, w: 40, h: 10 },
    { str: "Amount", x: 100, y: 700, w: 40, h: 10 },
    { str: "Alpha", x: 10, y: 680, w: 40, h: 10 },
    { str: "42", x: 100, y: 680, w: 40, h: 10 },
    { str: "Notes", x: 10, y: 600, w: 40, h: 10 },
  ];
  p.tables = [
    {
      index: 0,
      page: 0,
      headers: ["Name", "Amount"],
      rows: [["Alpha", "42"]],
      confidence: 1,
      bounds: { top: 700, bottom: 680 },
    },
  ];
  const out = await unpack((await exportPdfToDocx(pdf([p]))).blob);
  assert.match(out.html, /<table>/);
  assert.equal(out.text.split("Alpha").length - 1, 1);
  assert.ok(out.text.indexOf("Notes") > out.text.indexOf("42"));
  const plain = await unpack((await exportPdfToDocx(pdf([p]), { tables: false })).blob);
  assert.ok(!plain.html.includes("<table>"));
  assert.match(plain.text, /Alpha 42/);
});

test("scans fail clearly, mixed PDFs warn, and cancellation creates no artifact", async () => {
  await assert.rejects(exportPdfToDocx(pdf([page(0, "")])), /OCR/);
  const mixed = await exportPdfToDocx(pdf([page(0, "Text"), page(1, "")]));
  assert.ok(mixed.warnings.some((w) => w.includes("OCR): 2")));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    exportPdfToDocx(pdf([page(0, "Text")]), { signal: controller.signal }),
    /hủy/,
  );
  await assert.rejects(
    exportPdfToDocx(pdf([page(0, "Text"), page(1, "Next")]), {
      signal: new AbortController().signal,
      onProgress: () => {
        /* progress callback is exercised on all pages */
      },
      pageRange: "99",
    }),
    /Phạm vi/,
  );
});
