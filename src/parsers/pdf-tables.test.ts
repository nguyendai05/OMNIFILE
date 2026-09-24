import assert from "node:assert/strict";
import test from "node:test";
import { clusterRows, extractTablesFromItems } from "./pdf-tables.ts";
import type { PdfTextItem } from "../core/types.ts";

function item(str: string, x: number, y: number): PdfTextItem {
  return { str, x, y, w: 40, h: 10 };
}

test("clusters rows by y", () => {
  const rows = clusterRows([item("A", 10, 100), item("B", 80, 100.5), item("C", 10, 80)]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]![0]!.str, "A");
});

test("extracts a regular grid as a table", () => {
  const items: PdfTextItem[] = [];
  const headers = ["region", "PRODUCT", "units", "Revenue"];
  const body = [
    ["North", "Atlas", "120", "14400"],
    ["South", "Beacon", "45", "9600"],
  ];
  const xs = [48, 168, 308, 428];
  headers.forEach((h, i) => items.push(item(h, xs[i]!, 680)));
  body.forEach((row, r) => row.forEach((c, i) => items.push(item(c, xs[i]!, 662 - r * 18))));
  const tables = extractTablesFromItems(items, 0);
  assert.ok(tables.length >= 1);
  assert.equal(tables[0]!.headers.length, 4);
  assert.ok(tables[0]!.rows.length >= 2);
});

test("text fragments and ordinary word spaces are not table columns", () => {
  const items = [700, 684, 668].flatMap((y) => [
    { ...item("Normal", 50, y), w: 35 },
    { ...item("paragraph", 89, y), w: 48 },
    { ...item("text", 141, y), w: 20 },
  ]);
  assert.deepEqual(extractTablesFromItems(items, 0), []);
});

test("table cells join split words, retain geometry and accept right aligned numbers", () => {
  const items = [
    { ...item("Pro", 48, 700), w: 15 },
    { ...item("duct", 63, 700), w: 20 },
    { ...item("Amount", 220, 700), w: 40 },
    item("Alpha", 48, 682),
    { ...item("123.45", 230, 682), w: 30 },
    item("Beta", 48, 664),
    { ...item("9", 255, 664), w: 5 },
  ];
  const tables = extractTablesFromItems(items, 0);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0]!.headers, ["Product", "Amount"]);
  assert.deepEqual(tables[0]!.rows, [
    ["Alpha", "123.45"],
    ["Beta", "9"],
  ]);
  assert.equal(tables[0]!.bounds?.left, 48);
  assert.equal(tables[0]!.bounds?.right, 260);
  assert.equal(tables[0]!.columnBounds?.length, 2);
});

test("parallel prose columns are not treated as a data table", () => {
  const items = [700, 684, 668].flatMap((y) => [
    { ...item("A long paragraph of prose in the left column of this document.", 50, y), w: 210 },
    { ...item("Another paragraph of prose in the right column of this document.", 320, y), w: 210 },
  ]);
  assert.deepEqual(extractTablesFromItems(items, 0), []);
});

test("short prose lines in two columns are not a table either", () => {
  const items = [700, 682, 664, 646].flatMap((y) => [
    { ...item("The first column contains a paragraph", 54, y), w: 185 },
    { ...item("The second column begins here as well", 330, y), w: 180 },
  ]);
  assert.deepEqual(extractTablesFromItems(items, 0), []);
});

test("a header can align left while numeric body values align right in the same lane", () => {
  const items = [
    item("Product", 54, 570),
    item("Amount", 450, 570),
    item("Alpha", 54, 550),
    { ...item("124.50", 464.4, 550), w: 39.6 },
    item("Beta", 54, 530),
    { ...item("9.00", 477.6, 530), w: 26.4 },
  ];
  assert.deepEqual(extractTablesFromItems(items, 0)[0]?.headers, ["Product", "Amount"]);
});

test("row clustering removes duplicate painted text and invalid coordinates", () => {
  const text = item("Once", 50, 700);
  const rows = clusterRows([text, { ...text, x: 50.1 }, item("Invalid", NaN, 700)]);
  assert.deepEqual(rows, [[text]]);
});

test("duplicate paint detection crosses coordinate buckets without dropping distinct text", () => {
  const first = item("Once", 10.49, 700);
  const differentWidth = { ...first, w: 41 };
  const separate = { ...first, x: 11.01 };
  const rows = clusterRows([first, { ...first, x: 10.51 }, differentWidth, separate]);
  assert.deepEqual(rows, [[first, differentWidth, separate]]);
});

test("row baseline follows the largest fragment after a superscript", () => {
  const superscript = { ...item("2", 20, 705), w: 4, h: 6 };
  const base = { ...item("x", 10, 700), w: 10 };
  const following = item("value", 30, 700);
  assert.deepEqual(clusterRows([superscript, base, following]), [[base, superscript, following]]);
});

test("dense fragmented rows avoid rescanning prior fragments", () => {
  let geometryReads = 0;
  const fragments = Array.from({ length: 2_000 }, (_, i) => ({
    str: "x",
    get x() {
      geometryReads++;
      return i * 4;
    },
    y: 700,
    w: 3,
    get h() {
      geometryReads++;
      return i % 2 ? 6 : 10;
    },
  }));
  const rows = clusterRows(fragments);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.length, fragments.length);
  // Count geometry reads instead of wall time so this also works on slow CI hosts.
  assert.ok(geometryReads < fragments.length * 100, `${geometryReads} geometry reads`);
});
