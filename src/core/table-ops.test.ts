import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearch } from "../lib/locale.ts";

test("Vietnamese search matches accented, unaccented and decomposed text", () => {
  const labels = ["Trích xuất bảng", "Đổi kích thước ảnh"];
  assert.equal(normalizeSearch("ĐƯỜNG dẫn"), "duong dan");
  assert.equal(scoreSearch("trich xuat", labels), scoreSearch("trích xuất", labels));
  assert.ok(scoreSearch("doi kich thuoc", labels) > 0);
  assert.equal(scoreSearch("trích xuất".normalize("NFD"), labels), scoreSearch("trích xuất", labels));
  assert.equal(labels[0], "Trích xuất bảng");
});
import {
  aoaToTable,
  canConnect,
  detectAnomalies,
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
import type { CellValue, TableColumn } from "./types.ts";

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

test("duplicate detection preserves distinct cells containing separator characters", () => {
  const rows = [["a\u0001b", "c"], ["a", "b\u0001c"], [" a\u0001b ", "c"]];
  const result = dropDuplicateRows(rows);
  assert.deepEqual(result.rows, rows.slice(0, 2));
  assert.equal(result.removed, 1);
  assert.deepEqual(detectAnomalies([], rows), ["1 duplicate row"]);
});

test("CSV delimiter detection ignores quoted separators and multiline content", () => {
  const text = 'name;notes\nAlice;"one,two,three\nfour,five,six"\nBob;"x,y,z"';
  assert.equal(detectDelimiter(text), ";");
  assert.deepEqual(parseCsvText(text), [["name", "notes"], ["Alice", "one,two,three\nfour,five,six"], ["Bob", "x,y,z"]]);
});

test("CSV delimiter detection prefers a consistent field count", () => {
  const text = "name;notes\nAlice;a,b,c,d\nBob;x\nCarol;e,f,g\n";
  assert.equal(detectDelimiter(text), ";");
});

test("CSV parser preserves BOM-prefixed quotes, CR rows and final empty quoted records", () => {
  assert.deepEqual(parseCsvText('\ufeff"name",value\r"a\rb",1\r"",2\r', ","), [["name", "value"], ["a\rb", "1"], ["", "2"]]);
  assert.deepEqual(parseCsvText('""', ","), [[""]]);
  assert.deepEqual(parseCsvText('a\r\n""', ","), [["a"], [""]]);
  assert.deepEqual(parseCsvText("", ","), []);
  assert.deepEqual(parseCsvText("a,b,", ","), [["a", "b", ""]]);
});

test("CSV parser keeps quotes within unquoted text and supports an explicit multi-character delimiter", () => {
  assert.deepEqual(parseCsvText('name,notes\nA,5" screen\nB,plain', ","), [["name", "notes"], ["A", '5" screen'], ["B", "plain"]]);
  assert.deepEqual(parseCsvText('a||b\n"x||y"||z', "||"), [["a", "b"], ["x||y", "z"]]);
});

test("table conversion recognizes Unicode headers and avoids the argument-count limit on large inputs", () => {
  assert.equal(aoaToTable([["数値"], [1]]).columns[0]!.name, "数値");
  const aoa: CellValue[][] = Array.from({ length: 150_000 }, (_, i) => [i]);
  const result = aoaToTable(aoa);
  assert.equal(result.rows.length, aoa.length);
  assert.equal(result.rows.at(-1)![0], 149_999);
});

test("profiler keeps finite mean and median for large finite values", () => {
  const columns: TableColumn[] = [{ id: "n", name: "Number", type: "number" }];
  const values = [[Number.MAX_VALUE], [Number.MAX_VALUE]];
  const profile = profileColumns(columns, values)[0]!;
  assert.equal(profile.mean, Number.MAX_VALUE);
  assert.equal(profile.median, Number.MAX_VALUE);
  assert.equal(profileColumns(columns, [[-Number.MAX_VALUE], [Number.MAX_VALUE]])[0]!.mean, 0);
  assert.ok(Math.abs(profileColumns(columns, [[1e16], [1], [-1e16]])[0]!.mean! - 1 / 3) < Number.EPSILON);
  assert.equal(profileColumns(columns, [[Number.MIN_VALUE], [Number.MIN_VALUE]])[0]!.median, Number.MIN_VALUE);
});

test("profiler rounds unequal positive and negative subnormal medians correctly", () => {
  const columns: TableColumn[] = [{ id: "n", name: "Number", type: "number" }];
  for (const sign of [1, -1]) {
    const values = [[sign * Number.MIN_VALUE], [sign * 2 * Number.MIN_VALUE]];
    assert.equal(profileColumns(columns, values)[0]!.median, sign * 2 * Number.MIN_VALUE);
  }
});

test("profiler computes exact medians without mutating input for varied distributions", () => {
  const columns: TableColumn[] = [{ id: "n", name: "Number", type: "number" }];
  let seed = 42;
  for (const length of [1, 2, 3, 10, 101, 1000]) {
    const random = Array.from({ length }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed % 2001) - 1000;
    });
    for (const values of [random, [...random].sort((a, b) => a - b), [...random].sort((a, b) => b - a), Array<number>(length).fill(7)]) {
      const rows = values.map((n) => [n]);
      const before = structuredClone(rows);
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(length / 2);
      const expected = length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
      const profile = profileColumns(columns, rows)[0]!;
      assert.equal(profile.median, expected);
      assert.equal(profile.min, sorted[0]);
      assert.equal(profile.max, sorted.at(-1));
      assert.deepEqual(rows, before);
    }
  }
});

test("profiler preserves samples, missing counts, unique counts and whitespace diagnostics", () => {
  const columns: TableColumn[] = [{ id: "v", name: "Value", type: "text" }];
  const profile = profileColumns(columns, [[null], [], ["  "], [" x "], ["a  b"], ["x"], ["x"]])[0]!;
  assert.equal(profile.nullCount, 3);
  assert.equal(profile.emptyCount, 3);
  assert.equal(profile.whitespaceIssues, 2);
  assert.equal(profile.uniqueCount, 3);
  assert.deepEqual(profile.sample, [" x ", "a  b", "x", "x"]);
});
