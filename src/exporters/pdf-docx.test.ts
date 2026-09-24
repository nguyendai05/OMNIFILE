import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import mammoth from "mammoth";
import { XMLValidator } from "fast-xml-parser";
import { exportPdfToDocx, parsePageRange, DOCX_MIME } from "./pdf-docx.ts";
import type { PdfDocument, PdfPageModel } from "../core/types.ts";
import { extractTablesFromItems } from "../parsers/pdf-tables.ts";
import { normalizePdfItem, wordFont } from "../parsers/pdf-text.ts";

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
  assert.match(plain.text, /Alpha\s+42/);
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

test("layout retains font families, page margins, alignment and source line spacing", async () => {
  const p = page(0, "Title Body line Next line Date");
  p.items = [
    {
      str: "Title",
      x: 256,
      y: 720,
      w: 100,
      h: 20,
      fontName: "ABCDEF+TimesNewRomanPS-BoldMT",
      bold: true,
    },
    { str: "Body line", x: 54, y: 676, w: 504, h: 12, fontName: "Times-Roman" },
    { str: "Next line", x: 54, y: 658, w: 504, h: 12, fontName: "Times-Roman" },
    { str: "Date", x: 498, y: 620, w: 60, h: 11, fontName: "CourierNewPSMT" },
  ];
  const out = await unpack((await exportPdfToDocx(pdf([p]))).blob);
  assert.match(out.xml, /w:ascii="Times New Roman"/);
  assert.match(out.xml, /w:ascii="Courier New"/);
  assert.match(out.xml, /<w:jc w:val="center"/);
  assert.match(out.xml, /<w:jc w:val="right"/);
  assert.match(out.xml, /w:left="1080"/);
  assert.match(out.xml, /w:after="84"[^>]*w:line="276"/);
  assert.match(out.xml, /w:lineRule="exact"/);
});

test("two columns retain column reading order below a spanning heading", async () => {
  const p = page(0, "Heading Left Right");
  p.items = [{ str: "Heading", x: 250, y: 740, w: 112, h: 20 }];
  for (let i = 0; i < 4; i++) {
    p.items.push(
      {
        str: `Left ${i}: a sufficiently long sentence in this paragraph.`,
        x: 54,
        y: 700 - i * 18,
        w: 220,
        h: 12,
      },
      {
        str: `Right ${i}: another long sentence in the other paragraph.`,
        x: 338,
        y: 700 - i * 18,
        w: 220,
        h: 12,
      },
    );
  }
  p.tables = extractTablesFromItems(p.items, 0);
  const out = await unpack((await exportPdfToDocx(pdf([p]))).blob);
  assert.ok(out.text.indexOf("Heading") < out.text.indexOf("Left 0"));
  assert.ok(out.text.indexOf("Left 3") < out.text.indexOf("Right 0"));
  assert.match(out.xml, /w:val="nil"/);
  assert.equal(out.text.split("Left 0").length - 1, 1);
});

test("editable tables preserve unequal column widths and source cell fonts", async () => {
  const p = page(0, "Product Total Alpha 42");
  p.items = [
    { str: "Product", x: 54, y: 700, w: 150, h: 14, fontName: "Times-Roman", bold: true },
    { str: "Total", x: 450, y: 700, w: 54, h: 14, fontName: "Times-Roman" },
    { str: "Alpha", x: 54, y: 680, w: 100, h: 12, fontName: "Times-Roman", italic: true },
    { str: "42", x: 480, y: 680, w: 24, h: 12, fontName: "Courier" },
  ];
  p.tables = extractTablesFromItems(p.items, 0);
  const out = await unpack((await exportPdfToDocx(pdf([p]))).blob);
  const widths = [...out.xml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => +m[1]!);
  assert.equal(widths.length, 2);
  assert.ok(widths[0]! > widths[1]! * 2);
  assert.match(out.xml, /w:ascii="Courier New"/);
  assert.match(out.xml, /<w:i\/>/);
  const plain = await unpack((await exportPdfToDocx(pdf([p]), { formatting: false })).blob);
  assert.ok(!plain.xml.includes('w:ascii="Courier New"'));
  assert.ok(!plain.xml.includes("<w:b/>"));
});

test("superscripts and small fragments are retained without splitting or duplication", async () => {
  const p = page(0, "E = mc2");
  p.items = [
    { str: "E = mc", x: 54, y: 700, w: 42, h: 12 },
    { str: "2", x: 96, y: 705, w: 4, h: 7 },
  ];
  const out = await unpack((await exportPdfToDocx(pdf([p]))).blob);
  assert.match(out.text, /E = mc2/);
  assert.match(out.xml, /<w:position w:val="5pt"/);
});

test("PDF coordinates apply crop offset, UserUnit and page rotation before export", () => {
  const input = { str: "Crop", transform: [12, 0, 0, 12, 72, 700], width: 30, height: 12 };
  const normal = normalizePdfItem(
    input,
    { transform: [2, 0, 0, -2, -40, 1520], height: 1520, scale: 1 },
    "Times-Roman",
    { ascent: 0.9 },
  );
  assert.equal(normal.x, 104);
  assert.equal(normal.y, 1400);
  assert.equal(normal.w, 60);
  assert.equal(normal.h, 24);
  assert.equal(normal.ascent, 0.9);
  assert.equal(normal.angle, 0);
  const rotated = normalizePdfItem(
    { ...input, transform: [0, 12, -12, 0, 72, 700] },
    { transform: [0, 1, 1, 0, 0, 0], height: 612, scale: 1 },
    "Helvetica",
  );
  assert.equal(rotated.x, 700);
  assert.equal(rotated.y, 540);
  assert.equal(rotated.angle, 0);
  assert.equal(rotated.h, 12);
});

test("font aliases resolve without losing custom families", () => {
  assert.equal(wordFont("ABCDEF+TimesNewRomanPS-ItalicMT"), "Times New Roman");
  assert.equal(wordFont("Helvetica-Bold"), "Arial");
  assert.equal(wordFont("CourierNewPSMT"), "Courier New");
  assert.equal(wordFont("ABCDEF+Roboto-Bold"), "Roboto");
  assert.equal(wordFont("g_d0_f1", "serif"), "Times New Roman");
  assert.equal(wordFont("g_d0_f1", "sans-serif"), "Arial");
});

test("a side note beside a table survives exactly once", async () => {
  const p = page(0, "Name Count Alpha 42 Side note");
  p.items = [
    { str: "Name", x: 50, y: 700, w: 40, h: 10 },
    { str: "Count", x: 150, y: 700, w: 40, h: 10 },
    { str: "Alpha", x: 50, y: 680, w: 40, h: 10 },
    { str: "42", x: 150, y: 680, w: 40, h: 10 },
  ];
  p.tables = extractTablesFromItems(p.items, 0);
  p.items.push({ str: "Side note", x: 350, y: 700, w: 60, h: 10 });
  const out = await unpack((await exportPdfToDocx(pdf([p]))).blob);
  for (const text of ["Name", "Count", "Alpha", "42", "Side note"])
    assert.equal(out.text.split(text).length - 1, 1, text);
});
