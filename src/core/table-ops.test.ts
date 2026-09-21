import assert from "node:assert/strict";
import test from "node:test";
import {
  aoaToTable,
  canConnect,
  detectDelimiter,
  dropDuplicateRows,
  fillMissing,
  normalizeHeaders,
  parseCsvText,
  profileColumns,
  removeEmptyRows,
  scoreSearch,
  shannonEntropy,
  toCsv,
} from "./table-ops.ts";

test("parseCsv handles quoted commas and multiline cells", () => {
  const text = `a,b\n"hello, world","line1\nline2"\n3,4\n`;
  const rows = parseCsvText(text, ",");
  assert.equal(rows[1]![0], "hello, world");
  assert.equal(rows[1]![1], "line1\nline2");
  assert.equal(rows[2]![0], "3");
});

test("detects delimiter", () => {
  assert.equal(detectDelimiter("a\tb\n1\t2\n"), "\t");
  assert.equal(detectDelimiter("a,b\n1,2\n"), ",");
});

test("remove empty rows and normalize headers", () => {
  const { columns, rows } = aoaToTable([
    ["region", "PRODUCT", "  units", "Revenue ($)"],
    ["North", "Atlas", "120", "14400"],
    ["", "", "", ""],
    ["South", "Beacon", "45", ""],
  ]);
  const cleaned = removeEmptyRows(rows);
  assert.equal(cleaned.length, 2);
  const headers = normalizeHeaders(columns);
  assert.equal(headers[0]!.name, "Region");
  assert.equal(headers[1]!.name, "Product");
  assert.equal(headers[2]!.name, "Units");
  assert.equal(headers[3]!.name, "Revenue");
});

test("drop duplicates and fill missing", () => {
  const { columns, rows } = aoaToTable([
    ["id", "name"],
    ["1", "A"],
    ["1", "A"],
    ["2", ""],
  ]);
  const d = dropDuplicateRows(rows);
  assert.equal(d.removed, 1);
  const filled = fillMissing(d.rows, columns, "ffill");
  assert.equal(filled[1]![1], "A");
});

test("profiler finds nulls and types", () => {
  const { columns, rows } = aoaToTable([
    ["n", "flag"],
    ["1", "true"],
    ["", "false"],
    ["3", "true"],
  ]);
  const p = profileColumns(columns, rows);
  assert.equal(p[0]!.nullCount, 1);
  assert.ok(p[0]!.inferredType === "integer" || p[0]!.inferredType === "id");
});

test("csv roundtrip", () => {
  const { columns, rows } = aoaToTable([
    ["a", "b"],
    ['say "hi"', "2"],
  ]);
  const csv = toCsv(columns, rows);
  assert.ok(csv.includes('""'));
});

test("action graph rejects incompatible types", () => {
  const bad = canConnect(["audio"], ["spreadsheet"]);
  assert.equal(bad.ok, false);
  const good = canConnect(["table"], ["spreadsheet"]);
  assert.equal(good.ok, true);
  const pdf = canConnect(["pdf"], ["pdf"]);
  assert.equal(pdf.ok, true);
});

test("semantic search scores excel → xlsx", () => {
  const s = scoreSearch("excel", ["Export Excel", "table.export-xlsx", "xlsx"]);
  assert.ok(s > 0);
  const s2 = scoreSearch("make smaller", ["Compress JPEG", "compress", "resize"]);
  assert.ok(s2 > 0);
});

test("entropy is 0 for uniform bytes and higher for mixed", () => {
  const zeros = new Uint8Array(64);
  const mixed = Uint8Array.from({ length: 64 }, (_, i) => i);
  assert.equal(shannonEntropy(zeros), 0);
  assert.ok(shannonEntropy(mixed) > 3);
});
