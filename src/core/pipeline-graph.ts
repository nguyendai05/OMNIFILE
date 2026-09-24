import { OmniError } from "./errors.ts";

export function planPipeline<T extends { id: string }>(
  nodes: readonly T[],
  edges: readonly { source: string; target: string }[],
) {
  const byId = new Map<string, T>();
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    if (byId.has(node.id)) {
      throw new OmniError("InvalidConnection", `Quy trình có mã bước trùng lặp: ${node.id}`);
    }
    byId.set(node.id, node);
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const { source, target } of edges) {
    if (!byId.has(source) || !byId.has(target)) {
      throw new OmniError("InvalidConnection", `Kết nối tham chiếu bước không tồn tại: ${source} → ${target}`);
    }
    incoming.get(target)!.push(source);
    outgoing.get(source)!.push(target);
  }
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const node of nodes) {
    const count = incoming.get(node.id)!.length;
    counts.set(node.id, count);
    if (count === 0) order.push(node.id);
  }
  // Kahn's algorithm: append ready nodes and advance a cursor in O(V + E).
  for (let head = 0; head < order.length; head++) {
    for (const target of outgoing.get(order[head])!) {
      const count = counts.get(target)! - 1;
      counts.set(target, count);
      if (count === 0) order.push(target);
    }
  }
  if (order.length !== nodes.length) {
    throw new OmniError("InvalidConnection", "Quy trình có vòng lặp");
  }
  return { byId, incoming, order };
}
