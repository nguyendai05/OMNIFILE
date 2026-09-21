import assert from "node:assert/strict";
import test from "node:test";
import type { LineageEdge } from "./types.ts";

function walk(lineage: LineageEdge[], fileId: string) {
  const ancestors: string[] = [];
  const descendants: string[] = [];
  const walkUp = (id: string) => {
    for (const e of lineage) {
      if (e.toIds.includes(id)) {
        for (const f of e.fromIds) {
          if (!ancestors.includes(f)) {
            ancestors.push(f);
            walkUp(f);
          }
        }
      }
    }
  };
  const walkDown = (id: string) => {
    for (const e of lineage) {
      if (e.fromIds.includes(id)) {
        for (const t of e.toIds) {
          if (!descendants.includes(t)) {
            descendants.push(t);
            walkDown(t);
          }
        }
      }
    }
  };
  walkUp(fileId);
  walkDown(fileId);
  return { ancestors, descendants };
}

test("lineage traces pdf → table → xlsx", () => {
  const lineage: LineageEdge[] = [
    { id: "1", fromIds: ["pdf"], toIds: ["table"], actionId: "pdf.extract-tables", actionTitle: "Extract tables", at: 1 },
    { id: "2", fromIds: ["table"], toIds: ["clean"], actionId: "table.remove-empty-rows", actionTitle: "Remove empty rows", at: 2 },
    { id: "3", fromIds: ["clean"], toIds: ["norm"], actionId: "table.normalize-headers", actionTitle: "Normalize headers", at: 3 },
    { id: "4", fromIds: ["norm"], toIds: ["xlsx"], actionId: "table.export-xlsx", actionTitle: "Export Excel", at: 4 },
  ];
  const up = walk(lineage, "xlsx");
  assert.ok(up.ancestors.includes("pdf"));
  assert.ok(up.ancestors.includes("table"));
  assert.ok(up.ancestors.includes("norm"));
  assert.equal(walk(lineage, "pdf").descendants.includes("xlsx"), true);
});
