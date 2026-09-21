import assert from "node:assert/strict";
import test from "node:test";
import { detectMime, guessFromMagic, refineZipKind } from "./mime.ts";

test("magic bytes detect pdf png jpeg zip", () => {
  const pdf = guessFromMagic(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]));
  assert.equal(pdf?.kind, "pdf");
  const png = guessFromMagic(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(png?.kind, "image");
  const zip = guessFromMagic(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));
  assert.equal(zip?.kind, "archive");
});

test("zip members refine office types", () => {
  assert.equal(refineZipKind(["xl/workbook.xml", "[Content_Types].xml"]).kind, "spreadsheet");
  assert.equal(refineZipKind(["word/document.xml"]).kind, "docx");
  assert.equal(refineZipKind(["ppt/slides/slide1.xml"]).kind, "presentation");
  assert.equal(refineZipKind(["readme.txt"]).kind, "archive");
});

test("extension wins for csv text", () => {
  const guess = detectMime("Sales.csv", "text/plain", new TextEncoder().encode("a,b\n1,2\n"));
  assert.equal(guess.kind, "spreadsheet");
  assert.equal(guess.extension, "csv");
});

test("unknown binary stays unknown", () => {
  const guess = detectMime("blob.bin", "application/octet-stream", Uint8Array.from([0, 1, 2, 3, 4, 0, 0, 0]));
  assert.equal(guess.kind, "unknown");
});
