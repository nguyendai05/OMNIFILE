import assert from "node:assert/strict";
import test from "node:test";
import { OmniError } from "./errors.ts";
import { planPipeline } from "./pipeline-graph.ts";

const nodes = (...ids: string[]) => ids.map((id) => ({ id }));
const edge = (source: string, target: string) => ({ source, target });

test("plans branching graphs in stable dependency order and preserves input order", () => {
  const graphNodes = nodes("export", "right", "left", "input", "isolated");
  const graphEdges = [edge("right", "export"), edge("input", "left"), edge("input", "right"), edge("left", "export")];
  const plan = planPipeline(graphNodes, graphEdges);
  assert.deepEqual(plan.order, ["input", "isolated", "left", "right", "export"]);
  assert.deepEqual(plan.incoming.get("export"), ["right", "left"]);
  assert.equal(plan.byId.get("export"), graphNodes[0]);
  assert.deepEqual(graphNodes.map((node) => node.id), ["export", "right", "left", "input", "isolated"]);
});

test("supports empty graphs and IDs matching object prototype keys", () => {
  assert.deepEqual(planPipeline([], []).order, []);
  assert.deepEqual(planPipeline(nodes("__proto__", "constructor"), [edge("__proto__", "constructor")]).order, ["__proto__", "constructor"]);
});

test("rejects duplicated node IDs before execution", () => {
  assert.throws(() => planPipeline(nodes("input", "input"), []), (error) =>
    error instanceof OmniError && error.code === "InvalidConnection" && /trùng/.test(error.message));
});

test("reports missing edge endpoints separately from cycles", () => {
  for (const graphEdges of [[edge("missing", "input")], [edge("input", "missing")], [edge("missing", "other")]]) {
    assert.throws(() => planPipeline(nodes("input"), graphEdges), (error) =>
      error instanceof OmniError && error.code === "InvalidConnection" && /không tồn tại/.test(error.message));
  }
});

test("rejects self loops and cycles in disconnected components", () => {
  for (const graphEdges of [[edge("a", "a")], [edge("a", "b"), edge("b", "a")]]) {
    assert.throws(() => planPipeline(nodes("isolated", "a", "b"), graphEdges), (error) =>
      error instanceof OmniError && error.code === "InvalidConnection" && /vòng lặp/.test(error.message));
  }
});

test("visits graph edges a constant number of times on long chains", () => {
  const count = 3000;
  const graphNodes = Array.from({ length: count }, (_, i) => ({ id: String(i) }));
  let sourceReads = 0;
  const graphEdges = Array.from({ length: count - 1 }, (_, i) => ({
    get source() { sourceReads++; return String(i); },
    target: String(i + 1),
  }));
  const plan = planPipeline(graphNodes, graphEdges);
  assert.deepEqual(plan.order, graphNodes.map((node) => node.id));
  assert.ok(sourceReads < count * 5, `read edge sources ${sourceReads} times for ${count} nodes`);
});
