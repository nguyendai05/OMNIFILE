import assert from "node:assert/strict";
import test from "node:test";
import { compareJsonValues, compareTableRows, comparisonText } from "./compare-data.ts";

test("JSON comparison treats prototype-named keys as own data", () => {
  const value = JSON.parse('{"__proto__":{"admin":true},"constructor":7,"toString":"custom"}');
  const added = compareJsonValues({}, value);
  assert.equal(added.metrics?.changed, 3);
  assert.deepEqual(added.hunks.map(h => h.type), ["add", "add", "add"]);
  assert.deepEqual(compareJsonValues(value, {}).hunks.map(h => h.type), ["remove", "remove", "remove"]);
});

test("JSON comparison handles deep input without recursive stack overflow", () => {
  let left: unknown = 1;
  let right: unknown = 2;
  for (let i = 0; i < 12000; i++) { left = { child: left }; right = { child: right }; }
  const result = compareJsonValues(left, right);
  assert.equal(result.metrics?.changed, 1);
  assert.equal(result.hunks[0]?.left, "1");
  assert.equal(result.hunks[0]?.right, "2");
});

test("JSON comparison serializes deeply added, removed, and replaced subtrees without recursion", () => {
  const depth = 12000;
  let deep: unknown = 1;
  for (let i = 0; i < depth; i++) deep = { child: deep };
  const serialized = '{"child":'.repeat(depth) + "1" + "}".repeat(depth);
  assert.equal(compareJsonValues({}, { deep }).hunks[0]?.right, serialized);
  assert.equal(compareJsonValues({ deep }, {}).hunks[0]?.left, serialized);
  const replaced = compareJsonValues({ deep }, { deep: null }).hunks[0];
  assert.equal(replaced?.left, serialized);
  assert.equal(replaced?.right, "null");
});

test("JSON comparison preserves native escaping and nested array serialization", () => {
  const value = { text: 'line\n\t"\\\u0000', "a\"b": [null, true, false, 0, ["x", { empty: {}, array: [] }]] };
  assert.equal(compareJsonValues({}, { value }).hunks[0]?.right, JSON.stringify(value));
  assert.equal(compareJsonValues({ value }, {}).hunks[0]?.left, JSON.stringify(value));
});

test("deep array serialization preserves escaping, empty containers and nulls", () => {
  const depth = 12000;
  const leaf = [null, { 'key"': 'text\n\u0000', empty: [], object: {} }, false];
  let deep: unknown = leaf;
  for (let i = 0; i < depth; i++) deep = [deep];
  const serialized = "[".repeat(depth) + JSON.stringify(leaf) + "]".repeat(depth);
  assert.equal(compareJsonValues(null, deep).hunks[0]?.right, serialized);
});

test("JSON paths distinguish literal dotted keys from nested keys", () => {
  const result = compareJsonValues({ "a.b": 1, a: { b: 1 } }, { "a.b": 2, a: { b: 2 } });
  assert.deepEqual(result.hunks.map(h => h.path), ['$["a.b"]', "$.a.b"]);
});

test("JSON output is capped while retaining an accurate total and traversal order", () => {
  const result = compareJsonValues(Array(2000).fill(1), Array(2000).fill(2));
  assert.equal(result.metrics?.changed, 2000);
  assert.equal(result.hunks.length, 400);
  assert.equal(result.hunks[0]?.path, "$[0]");
  assert.equal(result.hunks[399]?.path, "$[399]");
  assert.equal(compareJsonValues({ b: 2, a: 1 }, { a: 1, b: 2 }).metrics?.changed, 0);
});

test("table comparison preserves added or removed empty rows", () => {
  assert.deepEqual(compareTableRows([["same"]], [["same"], []]).hunks,
    [{ type: "add", left: undefined, right: "[]", path: "row 2" }]);
  assert.equal(compareTableRows([[]], []).hunks[0]?.type, "remove");
});

test("table comparison preserves cell types and caps details without losing totals", () => {
  assert.equal(compareTableRows([[1]], [["1"]]).metrics?.changed, 1);
  const result = compareTableRows(Array.from({ length: 1000 }, () => [1]), Array.from({ length: 1000 }, () => [2]));
  assert.equal(result.metrics?.changed, 1000);
  assert.equal(result.hunks.length, 200);
});

test("text comparison uses complete structured document text beyond the search index limit", () => {
  const prefix = "x".repeat(100_000);
  const doc = { kind: "xml" as const, fileId: "a", text: prefix + "left", parsed: null, valid: true, pathCount: 0 };
  assert.equal(comparisonText(doc), prefix + "left");
  assert.notEqual(comparisonText(doc), comparisonText({ ...doc, text: prefix + "right" }));
});
