import type { CellValue, CompareResult, DocumentModel } from "./types";

export function comparisonText(doc: DocumentModel | undefined): string | undefined {
  return doc && "text" in doc ? doc.text : undefined;
}

function stringifyJsonValue(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }
  // Native serialization is faster for ordinary values. Walk deeply nested
  // parsed JSON trees with ancestor frames when the native call stack runs out.
  type Frame = { value: object; keys?: string[]; length: number; index: number; written: boolean };
  const stack: Frame[] = [];
  const chunks: string[] = [];
  for (;;) {
    if (value !== null && typeof value === "object") {
      const keys = Array.isArray(value) ? undefined : Object.keys(value);
      chunks.push(keys ? "{" : "[");
      stack.push({ value, keys, length: keys ? keys.length : (value as unknown[]).length, index: 0, written: false });
    } else {
      chunks.push(JSON.stringify(value) ?? "null");
    }
    let next = false;
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      if (frame.index >= frame.length) {
        chunks.push(frame.keys ? "}" : "]");
        stack.pop();
        continue;
      }
      const key = frame.keys ? frame.keys[frame.index++]! : String(frame.index++);
      const child = (frame.value as Record<string, unknown>)[key];
      if (frame.keys && (child === undefined || typeof child === "function" || typeof child === "symbol")) continue;
      if (frame.written) chunks.push(",");
      frame.written = true;
      if (frame.keys) chunks.push(JSON.stringify(key), ":");
      value = child;
      next = true;
      break;
    }
    if (!next) break;
  }
  return chunks.join("");
}

export function compareJsonValues(a: unknown, b: unknown): CompareResult {
  const hunks: CompareResult["hunks"] = [];
  let changed = 0;
  type Frame = { a: object; b: object; path: string; keys?: string[]; length: number; index: number };
  const stack: Frame[] = [];
  let path = "$";
  // Keep only ancestor frames, rather than one queued item per array element.
  for (;;) {
    if (!Object.is(a, b)) {
      if (a !== null && b !== null && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
        const keys = Array.isArray(a) ? undefined : [...new Set([...Object.keys(a), ...Object.keys(b)])];
        stack.push({ a, b, path, keys, length: keys ? keys.length : Math.max((a as unknown[]).length, (b as unknown[]).length), index: 0 });
      } else {
        changed++;
        // Count all changes, but serialize only the details the viewer can show.
        if (hunks.length < 400) hunks.push({
          type: a === undefined ? "add" : b === undefined ? "remove" : "change",
          left: a === undefined ? undefined : stringifyJsonValue(a),
          right: b === undefined ? undefined : stringifyJsonValue(b),
          path,
        });
      }
    }
    while (stack.length && stack[stack.length - 1]!.index >= stack[stack.length - 1]!.length) stack.pop();
    const parent = stack[stack.length - 1];
    if (!parent) break;
    const index = parent.index++;
    const key = parent.keys ? parent.keys[index]! : String(index);
    path = parent.keys
      ? parent.path + (/^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`)
      : `${parent.path}[${index}]`;
    a = Object.hasOwn(parent.a, key) ? (parent.a as Record<string, unknown>)[key] : undefined;
    b = Object.hasOwn(parent.b, key) ? (parent.b as Record<string, unknown>)[key] : undefined;
  }
  return { kind: "json", summary: `${changed} khác biệt`, hunks, metrics: { changed } };
}

export function compareTableRows(left: CellValue[][], right: CellValue[][]): CompareResult {
  const hunks: CompareResult["hunks"] = [];
  let changed = 0;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    if (l && r && l.length === r.length && l.every((cell, j) => Object.is(cell, r[j]))) continue;
    changed++;
    if (hunks.length < 200) hunks.push({
      type: l === undefined ? "add" : r === undefined ? "remove" : "change",
      left: l === undefined ? undefined : JSON.stringify(l),
      right: r === undefined ? undefined : JSON.stringify(r),
      path: `row ${i + 1}`,
    });
  }
  return { kind: "spreadsheet", summary: `${changed} dòng khác nhau`, hunks, metrics: { changed } };
}
