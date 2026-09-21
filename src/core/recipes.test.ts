import assert from "node:assert/strict";
import test from "node:test";
import { canConnect } from "./table-ops.ts";
import { RECIPES, getRecipe, recipesFor, resolveFileDrop } from "./recipes.ts";
import type { FileRecord } from "./types.ts";

function file(partial: Partial<FileRecord> & Pick<FileRecord, "id" | "name" | "kind">): FileRecord {
  return {
    extension: "",
    detectedMime: "application/octet-stream",
    declaredMime: "",
    size: 1,
    sha256: null,
    createdAt: 0,
    importedAt: 0,
    modifiedAt: 0,
    source: { type: "import", origin: "demo" },
    storageRef: partial.id,
    folderId: null,
    metadata: {},
    parseStatus: "ready",
    tags: [],
    ...partial,
  };
}

test("required demo recipes are registered", () => {
  assert.ok(getRecipe("pdf-to-excel"));
  assert.ok(getRecipe("image-ocr-md"));
  assert.ok(getRecipe("csv-clean-xlsx"));
  assert.ok(getRecipe("zip-extract"));
  assert.ok(RECIPES.every((r) => r.steps.length > 0));
});

test("PDF to Excel chain is type-compatible at each hop", () => {
  const hops: Array<[string[], string[]]> = [
    [["pdf"], ["pdf"]],
    [["table"], ["table", "spreadsheet"]],
    [["table"], ["table", "spreadsheet"]],
    [["table"], ["table", "spreadsheet"]],
  ];
  const recipe = getRecipe("pdf-to-excel")!;
  assert.equal(recipe.steps.length, hops.length);
  for (const [produces, accepts] of hops) {
    const check = canConnect(produces, accepts);
    assert.equal(check.ok, true, check.reason);
  }
});

test("recipesFor filters by kind and minFiles", () => {
  const pdf = file({ id: "a", name: "a.pdf", kind: "pdf" });
  const img = file({ id: "b", name: "b.png", kind: "image" });
  assert.ok(recipesFor([pdf]).some((r) => r.id === "pdf-to-excel"));
  assert.ok(!recipesFor([pdf]).some((r) => r.id === "image-ocr-md"));
  assert.ok(!recipesFor([img]).some((r) => r.id === "batch-compress-images"));
  assert.ok(recipesFor([img, { ...img, id: "c" }]).some((r) => r.id === "batch-compress-images"));
});

test("drop resolution never auto-picks a destructive action", () => {
  const a = file({ id: "1", name: "a.csv", kind: "spreadsheet" });
  const b = file({ id: "2", name: "b.csv", kind: "spreadsheet" });
  const opts = resolveFileDrop(a, b);
  assert.ok(opts.some((o) => o.intent === "compare"));
  assert.ok(opts.some((o) => o.actionId === "table.merge"));
  assert.equal(resolveFileDrop(a, a).length, 0);
});
