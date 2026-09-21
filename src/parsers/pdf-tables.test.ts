import assert from "node:assert/strict";
import test from "node:test";
import { clusterRows, extractTablesFromItems } from "./pdf-tables.ts";
import type { PdfTextItem } from "../core/types.ts";

function item(str: string, x: number, y: number): PdfTextItem {
  return { str, x, y, w: 40, h: 10 };
}

test("clusters rows by y", () => {
  const rows = clusterRows([
    item("A", 10, 100),
    item("B", 80, 100.5),
    item("C", 10, 80),
  ]);
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
