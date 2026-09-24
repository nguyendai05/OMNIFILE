import { normalizeSearch } from "../lib/locale.ts";
import type { CellValue, ColumnProfile, ColumnType, TableColumn } from "./types";

export function cellToString(v: CellValue): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function isEmptyCell(v: CellValue): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

export function inferCellType(v: CellValue): ColumnType {
  if (isEmptyCell(v)) return "empty";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  const s = String(v).trim();
  const low = s.toLowerCase();
  if (low === "true" || low === "false" || low === "yes" || low === "no") return "boolean";
  if (/^[+-]?\d+$/.test(s)) return "integer";
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return "number";
  if (/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/.test(s) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) {
    return "date";
  }
  return "text";
}

export function coerceCell(v: CellValue, type: ColumnType): CellValue {
  if (isEmptyCell(v)) return null;
  const s = String(v).trim();
  if (type === "boolean") {
    const low = s.toLowerCase();
    if (["true", "yes", "1"].includes(low)) return true;
    if (["false", "no", "0"].includes(low)) return false;
    return v;
  }
  if (type === "integer" || type === "number") {
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : v;
  }
  return s;
}

export function inferColumnType(values: CellValue[]): ColumnType {
  const counts: Record<string, number> = {};
  const unique = new Set<string>();
  let nonEmpty = 0;
  for (const v of values) {
    const t = inferCellType(v);
    if (t === "empty") continue;
    nonEmpty++;
    counts[t] = (counts[t] ?? 0) + 1;
    unique.add(cellToString(v));
  }
  return columnTypeFromCounts(counts, nonEmpty, unique.size);
}

function columnTypeFromCounts(counts: Record<string, number>, nonEmpty: number, unique: number): ColumnType {
  if (nonEmpty === 0) return "empty";
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = entries[0]![0] as ColumnType;
  if (top === "integer" && counts.number) return "number";
  if (top === "text" && nonEmpty > 0 && (counts[top] ?? 0) / nonEmpty < 0.7) return "text";
  if (top === "text" && unique > 0 && unique <= Math.min(12, Math.ceil(nonEmpty * 0.3))) return "categorical";
  if (top === "integer" && unique === nonEmpty && nonEmpty > 3) return "id";
  return top;
}

function numericMedian(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const middle = Math.floor(values.length / 2);
  let left = 0;
  let right = values.length - 1;
  // Limit partition work before falling back to sort on adversarial inputs.
  let budget = values.length * 4;
  while (left < right) {
    budget -= right - left + 1;
    if (budget < 0) {
      values.sort((a, b) => a - b);
      break;
    }
    const a = values[left]!;
    const b = values[(left + right) >>> 1]!;
    const c = values[right]!;
    const pivot = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    let lower = left;
    let cursor = left;
    let upper = right;
    while (cursor <= upper) {
      if (values[cursor]! < pivot) {
        [values[lower], values[cursor]] = [values[cursor]!, values[lower]!];
        lower++;
        cursor++;
      } else if (values[cursor]! > pivot) {
        [values[upper], values[cursor]] = [values[cursor]!, values[upper]!];
        upper--;
      } else {
        cursor++;
      }
    }
    if (middle < lower) right = lower - 1;
    else if (middle > upper) left = upper + 1;
    else break;
  }
  const upper = values[middle]!;
  if (values.length % 2) return upper;
  let lower = values[0]!;
  for (let i = 1; i < middle; i++) lower = Math.max(lower, values[i]!);
  // Preserve subnormal rounding and halve operands only when their sum overflows.
  const sum = lower + upper;
  return Number.isFinite(sum) ? sum / 2 : lower / 2 + upper / 2;
}

function numericMean(values: number[], min: number, max: number): number | undefined {
  if (!values.length) return undefined;
  const scale = Math.max(Math.abs(min), Math.abs(max));
  if (scale === 0) return 0;
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const scaled = value / scale;
    const next = sum + scaled;
    correction += Math.abs(sum) >= Math.abs(scaled) ? (sum - next) + scaled : (scaled - next) + sum;
    sum = next;
  }
  return ((sum + correction) / values.length) * scale;
}

export function profileColumns(columns: TableColumn[], rows: CellValue[][]): ColumnProfile[] {
  return columns.map((col, i) => {
    let nullCount = 0;
    let emptyCount = 0;
    let whitespaceIssues = 0;
    let nonEmpty = 0;
    const sample: CellValue[] = [];
    const unique = new Set<string>();
    const counts: Record<string, number> = {};
    const nums: number[] = [];
    let min = Infinity;
    let max = -Infinity;
    for (const row of rows) {
      const v = row[i];
      if (v === null || v === undefined) {
        nullCount++;
        emptyCount++;
        continue;
      }
      if (typeof v === "string") {
        if (v.trim() === "") {
          emptyCount++;
          nullCount++;
          continue;
        }
        if (v !== v.trim() || /\s{2,}/.test(v)) whitespaceIssues++;
      }
      const t = inferCellType(v);
      counts[t] = (counts[t] ?? 0) + 1;
      nonEmpty++;
      unique.add(cellToString(v));
      if (sample.length < 8) sample.push(v);
      if (t === "number" || t === "integer") {
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(n)) {
          nums.push(n);
          min = Math.min(min, n);
          max = Math.max(max, n);
        }
      }
    }
    const mean = numericMean(nums, min, max);
    const median = numericMedian(nums);
    return {
      id: col.id,
      name: col.name,
      inferredType: columnTypeFromCounts(counts, nonEmpty, unique.size),
      nullCount,
      emptyCount,
      uniqueCount: unique.size,
      min: nums.length ? min : sample.length ? cellToString(sample[0]!) : undefined,
      max: nums.length ? max : undefined,
      mean,
      median,
      mixedTypes: Object.keys(counts).length > 1,
      whitespaceIssues,
      constant: unique.size === 1 && nonEmpty > 1,
      sample,
    };
  });
}

export function removeEmptyRows(rows: CellValue[][]): CellValue[][] {
  return rows.filter((r) => r.some((c) => !isEmptyCell(c)));
}

export function normalizeHeaders(columns: TableColumn[]): TableColumn[] {
  const used = new Set<string>();
  return columns.map((c, i) => {
    let name = c.name.replace(/\s+/g, " ").trim();
    name = name.replace(/[_-]+/g, " ");
    name = name
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    name = name.replace(/\s*\(\$\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!name) name = `Column ${i + 1}`;
    let candidate = name;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${name} ${n++}`;
    }
    used.add(candidate.toLowerCase());
    return { ...c, name: candidate };
  });
}

function normalizedRowKey(row: CellValue[]): string {
  // JSON preserves cell boundaries even when input contains the old separator.
  return JSON.stringify(Array.from(row, (cell) => cellToString(cell).trim()));
}

export function dropDuplicateRows(rows: CellValue[][]): { rows: CellValue[][]; removed: number } {
  const seen = new Set<string>();
  const out: CellValue[][] = [];
  for (const r of rows) {
    const key = normalizedRowKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return { rows: out, removed: rows.length - out.length };
}

export function fillMissing(rows: CellValue[][], columns: TableColumn[], strategy: "empty-string" | "zero" | "ffill" = "ffill"): CellValue[][] {
  const last: CellValue[] = columns.map(() => null);
  return rows.map((r) =>
    columns.map((col, i) => {
      const v = r[i] ?? null;
      if (!isEmptyCell(v)) {
        last[i] = v;
        return v;
      }
      if (strategy === "empty-string") return "";
      if (strategy === "zero" && (col.type === "number" || col.type === "integer")) return 0;
      return last[i] ?? null;
    }),
  );
}

export function detectAnomalies(profiles: ColumnProfile[], rows: CellValue[][]): string[] {
  const issues: string[] = [];
  let emptyRows = 0;
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.every(isEmptyCell)) emptyRows++;
    keys.add(normalizedRowKey(row));
  }
  if (emptyRows) issues.push(`${emptyRows} empty row${emptyRows === 1 ? "" : "s"}`);
  const dup = rows.length - keys.size;
  if (dup) issues.push(`${dup} duplicate row${dup === 1 ? "" : "s"}`);
  for (const p of profiles) {
    if (p.nullCount) issues.push(`${p.name}: ${p.nullCount} missing`);
    if (p.mixedTypes) issues.push(`${p.name}: mixed types`);
    if (p.whitespaceIssues) issues.push(`${p.name}: whitespace issues`);
    if (p.constant) issues.push(`${p.name}: constant column`);
    if (p.inferredType === "number" || p.inferredType === "integer") {
      if (typeof p.mean === "number" && typeof p.median === "number") {
        /* outliers computed in profiler UI from min/max vs mean */
      }
    }
  }
  return issues;
}

export function aoaToTable(aoa: CellValue[][], title = "Bảng"): { columns: TableColumn[]; rows: CellValue[][] } {
  if (!aoa.length) return { columns: [], rows: [] };
  let width = 0;
  for (const row of aoa) width = Math.max(width, row.length);
  const header = aoa[0] ?? [];
  const hasHeader = header.some((c) => typeof c === "string" && /\p{L}/u.test(c));
  const names = hasHeader
    ? Array.from({ length: width }, (_, i) => cellToString(header[i] ?? "").trim() || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const data = (hasHeader ? aoa.slice(1) : aoa).map((r) =>
    Array.from({ length: width }, (_, i) => (r[i] === undefined ? null : r[i]!)),
  );
  const columns: TableColumn[] = names.map((name, i) => ({
    id: `c${i}`,
    name,
    type: inferColumnType(data.map((r) => r[i] ?? null)),
  }));
  void title;
  return { columns, rows: data };
}

export function tableToAoa(columns: TableColumn[], rows: CellValue[][]): CellValue[][] {
  return [columns.map((c) => c.name), ...rows];
}

export function shannonEntropy(bytes: Uint8Array): number {
  if (!bytes.length) return 0;
  const counts = new Array<number>(256).fill(0);
  for (const b of bytes) counts[b]!++;
  let h = 0;
  const n = bytes.length;
  for (const c of counts) {
    if (!c) continue;
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

export function extractStrings(bytes: Uint8Array, minLen = 4, limit = 200): string[] {
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.length >= minLen) out.push(cur);
    cur = "";
  };
  const n = Math.min(bytes.length, 1_000_000);
  for (let i = 0; i < n; i++) {
    const b = bytes[i]!;
    if (b >= 32 && b < 127) cur += String.fromCharCode(b);
    else push();
    if (out.length >= limit) break;
  }
  push();
  return out.slice(0, limit);
}

export function hexDump(bytes: Uint8Array, offset = 0): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.subarray(i, i + 16);
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(47, " ");
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`${(offset + i).toString(16).padStart(8, "0")}  ${hex}  ${ascii}`);
  }
  return lines.join("\n");
}

export function toCsv(columns: TableColumn[], rows: CellValue[][]): string {
  const esc = (v: CellValue) => {
    const s = cellToString(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.map((c) => esc(c.name)).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  return lines.join("\n");
}

export function parseCsvText(text: string, delimiter = ""): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let inQuotes = false;
  let recordStarted = false;
  const delim = delimiter || detectDelimiter(text);
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell.length === 0) {
      inQuotes = true;
      recordStarted = true;
      i++;
      continue;
    }
    if (text.startsWith(delim, i)) {
      row.push(cell);
      cell = "";
      recordStarted = true;
      i += delim.length;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      recordStarted = false;
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += ch;
    recordStarted = true;
    i++;
  }
  if (recordStarted) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function detectDelimiter(text: string): string {
  const candidates = [",", "\t", ";", "|"];
  const records: number[][] = [];
  let counts = candidates.map(() => 1);
  let inQuotes = false;
  let fieldStart = true;
  let hasContent = false;
  const limit = Math.min(text.length, 4000);
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < limit && records.length < 8; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (ch === '"' && fieldStart) {
      inQuotes = true;
      hasContent = true;
      fieldStart = false;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (hasContent) records.push(counts);
      counts = candidates.map(() => 1);
      hasContent = false;
      fieldStart = true;
      if (ch === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    const candidate = candidates.indexOf(ch);
    if (candidate >= 0) counts[candidate]!++;
    fieldStart = candidate >= 0;
    if (candidate >= 0 || ch.trim()) hasContent = true;
  }
  // Do not let a truncated final record distort the consistency score.
  if (hasContent && (i >= text.length || !records.length)) records.push(counts);
  let best = ",";
  let bestFrequency = 0;
  let bestWidth = 1;
  for (let candidate = 0; candidate < candidates.length; candidate++) {
    const frequencies = new Map<number, number>();
    for (const record of records) {
      const width = record[candidate]!;
      if (width > 1) frequencies.set(width, (frequencies.get(width) ?? 0) + 1);
    }
    for (const [width, frequency] of frequencies) {
      if (frequency > bestFrequency || (frequency === bestFrequency && width > bestWidth)) {
        bestFrequency = frequency;
        bestWidth = width;
        best = candidates[candidate]!;
      }
    }
  }
  return best;
}

export function canConnect(
  produces: string[],
  accepts: string[],
): { ok: boolean; reason?: string } {
  if (accepts.includes("*")) return { ok: true };
  const adapters: Record<string, string[]> = {
    table: ["spreadsheet", "table", "json"],
    spreadsheet: ["table", "spreadsheet", "json"],
    json: ["table", "text", "json"],
    text: ["markdown", "text", "code"],
    markdown: ["text", "html", "markdown"],
    pdf: ["pdf"],
    image: ["image", "svg"],
    svg: ["image", "svg"],
    docx: ["text", "docx"],
    presentation: ["text", "presentation"],
  };
  for (const p of produces) {
    if (accepts.includes(p)) return { ok: true };
    const extra = adapters[p] ?? [];
    if (extra.some((k) => accepts.includes(k))) return { ok: true };
  }
  return {
    ok: false,
    reason: `Cannot connect ${produces.join(", ") || "unknown"} → ${accepts.join(", ") || "unknown"}`,
  };
}

const SYNONYMS: Array<{ phrase: string; keys: string[] }> = [
  { phrase: "excel", keys: ["xlsx", "spreadsheet", "table", "csv"] },
  { phrase: "make smaller", keys: ["compress", "resize"] },
  { phrase: "smaller", keys: ["compress", "resize"] },
  { phrase: "ocr", keys: ["ocr", "text", "recognize"] },
  { phrase: "table", keys: ["table", "extract", "spreadsheet"] },
  { phrase: "tables", keys: ["table", "extract"] },
  { phrase: "clean", keys: ["empty", "duplicate", "normalize", "missing"] },
  { phrase: "compress", keys: ["compress", "resize"] },
  { phrase: "convert", keys: ["convert", "export"] },
  { phrase: "merge", keys: ["merge"] },
  { phrase: "split", keys: ["split"] },
  { phrase: "hash", keys: ["hash", "duplicate"] },
  { phrase: "compare", keys: ["compare", "diff"] },
  { phrase: "extract", keys: ["extract"] },
  { phrase: "chart", keys: ["chart", "profile"] },
  { phrase: "zip", keys: ["archive", "extract"] },
  { phrase: "background", keys: ["background"] },
];

export function scoreSearch(query: string, haystacks: string[]): number {
  const q = normalizeSearch(query).trim();
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  let score = 0;
  const hay = haystacks.map(normalizeSearch);
  for (const h of hay) {
    if (h === q) score += 20;
    else if (h.startsWith(q)) score += 12;
    else if (h.includes(q)) score += 8;
    for (const t of tokens) {
      if (h.includes(t)) score += 3;
    }
  }
  for (const syn of SYNONYMS) {
    if (q.includes(syn.phrase) || syn.phrase.includes(q)) {
      if (hay.some((h) => syn.keys.some((k) => h.includes(k)))) score += 6;
    }
  }
  return score;
}
