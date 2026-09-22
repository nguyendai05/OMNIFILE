import { useLanguage } from "@/lib/use-language";
import { t as tr } from "@/lib/locale";
import { uiLabel } from "@/lib/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { ChevronLeft, ChevronRight, Minus, Plus, Search } from "lucide-react";
import type {
  ArchiveDocument,
  BinaryDocument,
  DocumentModel,
  FileRecord,
  ImageDocument,
  MediaDocument,
  PdfDocument,
  PresentationDocument,
  SpreadsheetDocument,
  StructuredDocument,
  TableDocument,
  TextDocument,
  DocxDocument,
} from "@/core/types";
import { blobUrl, setActiveSheet } from "@/core/engine";
import { getBlob } from "@/core/storage";
import { cellToString, hexDump, profileColumns } from "@/core/table-ops";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDocument } from "./hooks";
import { runActionUi } from "./run";
import { renderPdfPage } from "@/parsers/pdf";

export function DocumentEditor({ file }: { file: FileRecord }) {
  useLanguage();
  const doc = useDocument(file.id);
  if (file.parseStatus === "parsing" || file.parseStatus === "queued") {
    return <PaneMessage title={tr("Đang đọc tệp")} body={tr(`CỤC BỘ · ${file.name}`)} />;
  }
  if (file.parseStatus === "error") {
    return <PaneMessage title={tr("Không thể đọc tệp")} body={file.parseError ?? tr("Lỗi không xác định")} />;
  }
  if (!doc) return <PaneMessage title={tr("Đang mở")} body={tr("Đang chuẩn bị nội dung tài liệu.")} />;
  switch (doc.kind) {
    case "pdf":
      return <PdfEditor file={file} doc={doc} />;
    case "spreadsheet":
      return <SheetEditor file={file} sheet={doc.sheets[doc.activeSheet] ?? doc.sheets[0]} workbook={doc} />;
    case "table":
      return <SheetEditor file={file} sheet={{ name: doc.title, columns: doc.columns, rows: doc.rows }} table={doc} />;
    case "image":
    case "svg":
      return <ImageEditor file={file} doc={doc} />;
    case "text":
    case "markdown":
    case "code":
    case "html":
      return <TextEditor file={file} doc={doc} />;
    case "json":
    case "xml":
    case "yaml":
      return <StructuredEditor file={file} doc={doc} />;
    case "archive":
      return <ArchiveEditor file={file} doc={doc} />;
    case "binary":
    case "unknown":
      return <HexEditor file={file} doc={doc} />;
    case "audio":
    case "video":
      return <MediaEditor file={file} doc={doc} />;
    case "docx":
      return <DocxEditor file={file} doc={doc} />;
    case "presentation":
      return <PptxEditor file={file} doc={doc} />;
    default:
      return <HexEditor file={file} doc={undefined} />;
  }
}

function PaneMessage({ title, body }: { title: string; body: string }) {
  useLanguage();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm font-medium">{tr(title)}</p>
      <p className="max-w-md text-xs text-muted">{tr(body)}</p>
    </div>
  );
}

function PdfEditor({ file, doc }: { file: FileRecord; doc: PdfDocument }) {
  useLanguage();
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(1.15);
  const [query, setQuery] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    blobUrl(file.id).then((u) => {
      if (!gone) setUrl(u);
    });
    return () => {
      gone = true;
    };
  }, [file.id]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    (async () => {
      const blob = await getBlob(file.storageRef);
      const rendered = await renderPdfPage(blob, page, scale);
      if (cancelled || !canvasRef.current) return;
      const dest = canvasRef.current;
      dest.width = rendered.width;
      dest.height = rendered.height;
      dest.getContext("2d")?.drawImage(rendered, 0, 0);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file.storageRef, page, scale, url]);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return doc.pages
      .map((p, i) => ({ i, n: p.text.toLowerCase().split(q).length - 1 }))
      .filter((x) => x.n > 0);
  }, [doc.pages, query]);

  const tables = doc.pages.flatMap((p) => p.tables.map((t) => ({ ...t, page: p.index })));

  return (
    <div className="flex h-full min-h-0">
      <div className="hidden w-36 shrink-0 overflow-auto border-r border-border bg-sidebar p-2 md:block">
        {doc.pages.map((p) => (
          <button
            key={p.index}
            onClick={() => setPage(p.index)}
            className={cn(
              "mb-1 w-full rounded-sm border px-2 py-2 text-left text-[10px]",
              page === p.index ? "border-accent bg-surface-2" : "border-transparent hover:bg-surface-2",
            )}
          >
            {tr("Trang")} {p.index + 1}
            {p.tables.length ? <span className="mt-1 block text-accent">{p.tables.length} {tr("bảng")}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <Button size="icon" variant="ghost" onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft />
          </Button>
          <span className="mono text-[11px] text-muted">
            {page + 1} / {doc.pageCount}
          </span>
          <Button size="icon" variant="ghost" onClick={() => setPage((p) => Math.min(doc.pageCount - 1, p + 1))}>
            <ChevronRight />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}>
            <Minus />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setScale((s) => Math.min(2.4, s + 0.15))}>
            <Plus />
          </Button>
          <div className="relative ml-auto w-48">
            <Search className="pointer-events-none absolute left-2 top-1.5 size-3.5 text-faint" />
            <Input className="pl-7" placeholder={tr("Tìm trong PDF")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-background p-4">
          <canvas ref={canvasRef} className="mx-auto max-w-full bg-surface-2 shadow-[var(--shadow-border)]" />
        </div>
        {query && (
          <div className="border-t border-border px-3 py-2 text-[11px] text-muted">
            {matches.length ? (
              <div className="flex flex-wrap gap-1">
                {matches.map((m) => (
                  <button key={m.i} className="rounded-sm bg-surface-3 px-1.5 py-0.5 hover:bg-accent/20" onClick={() => setPage(m.i)}>
                    {tr("tr.")}{m.i + 1} ×{m.n}
                  </button>
                ))}
              </div>
            ) : (
              tr("Không tìm thấy kết quả")
            )}
          </div>
        )}
      </div>
      {tables.length > 0 && (
        <div className="hidden w-56 shrink-0 overflow-auto border-l border-border p-2 lg:block">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Bảng được phát hiện")}</p>
          {tables.map((t) => (
            <button
              key={`${t.page}-${t.index}`}
              className="mb-2 w-full rounded-md border border-border bg-surface-2 p-2 text-left"
              onClick={() => {
                setPage(t.page);
                void runActionUi("pdf.extract-tables", [file.id], { tableIndex: t.index });
              }}
            >
              <div className="text-[11px] font-medium">{tr("Bảng")} {t.index + 1}</div>
              <div className="text-[10px] text-muted">
                {tr("Trang")} {t.page + 1} · {t.headers.length} {tr("cột ·")} {t.rows.length} {tr("dòng")}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SheetEditor({
  file,
  sheet,
  workbook,
  table,
}: {
  file: FileRecord;
  sheet?: SpreadsheetDocument["sheets"][number];
  workbook?: SpreadsheetDocument;
  table?: TableDocument;
}) {
  useLanguage();
  const parentRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"grid" | "profile" | "chart">("grid");
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [chartColId, setChartColId] = useState<string | null>(null);
  const [chartKind, setChartKind] = useState<"bar" | "line">("bar");
  const rows = useMemo(() => sheet?.rows ?? [], [sheet?.rows]);
  const columns = useMemo(() => sheet?.columns ?? [], [sheet?.columns]);
  const profiles = useMemo(() => profileColumns(columns, rows), [columns, rows]);
  const filtered = useMemo(() => {
    let list = rows.map((r, i) => ({ r, i }));
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(({ r }) => r.some((c) => cellToString(c).toLowerCase().includes(needle)));
    }
    if (sort) {
      list = [...list].sort((a, b) => {
        const av = a.r[sort.i];
        const bv = b.r[sort.i];
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
        return cellToString(av).localeCompare(cellToString(bv)) * sort.dir;
      });
    }
    return list;
  }, [rows, q, sort]);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 18,
  });
  const numeric = profiles.filter((p) => p.inferredType === "number" || p.inferredType === "integer");
  const activeChartId = chartColId ?? numeric[0]?.id;
  const chartCol = numeric.find((p) => p.id === activeChartId) ?? numeric[0];
  const chartIndex = chartCol ? columns.findIndex((c) => c.id === chartCol.id) : -1;
  const chartData =
    chartIndex >= 0
      ? rows.slice(0, 80).map((r, i) => {
          const raw = r[chartIndex];
          const v = typeof raw === "number" ? raw : Number(raw ?? 0);
          return { i: i + 1, v: Number.isFinite(v) ? v : 0 };
        })
      : [];

  if (!sheet) return <PaneMessage title={tr("Trang tính trống")} body={tr("Không có dữ liệu dạng bảng.")} />;

  const tableActions = [
    { id: "table.remove-empty-rows", label: tr("Dòng trống") },
    { id: "table.normalize-headers", label: tr("Tiêu đề cột") },
    { id: "table.drop-duplicates", label: tr("Dòng trùng") },
    { id: "table.fill-missing", label: tr("Điền ô trống") },
    { id: "table.export-xlsx", label: "Excel" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        {workbook?.sheets.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setActiveSheet(file.id, i)}
            className={cn("rounded-sm px-2 py-1 text-[11px]", i === workbook.activeSheet ? "bg-surface-3" : "text-muted hover:bg-surface-2")}
          >
            {s.name}
          </button>
        ))}
        {table && <span className="text-[11px] text-muted">{table.title}</span>}
        <span className="mono ml-2 text-[10px] text-faint">
          {rows.length} × {columns.length}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {(["grid", "profile", "chart"] as const).map((t) => (
            <Button key={t} size="xs" variant={tab === t ? "secondary" : "ghost"} onClick={() => setTab(t)}>
              {uiLabel(t)}
            </Button>
          ))}
          <Input className="ml-2 w-40" placeholder={tr("Lọc dòng")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1">
        {tableActions.map((a) => (
          <Button key={a.id} size="xs" variant="ghost" onClick={() => void runActionUi(a.id, [file.id])}>
            {tr(a.label)}
          </Button>
        ))}
        <span className="ml-auto text-[10px] text-faint">{tr("Sắp xếp chỉ đổi cách xem · thao tác tạo tệp mới")}</span>
      </div>
      {tab === "grid" && (
        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
          <div className="sticky top-0 z-10 flex border-b border-border bg-surface-2 text-[11px] font-medium">
            <div className="w-12 shrink-0 border-r border-border px-2 py-1.5 text-faint">#</div>
            {columns.map((c, ci) => (
              <button
                key={c.id}
                className="min-w-32 flex-1 border-r border-border px-2 py-1.5 text-left hover:bg-surface-3"
                onClick={() => setSort((s) => (s?.i === ci ? { i: ci, dir: s.dir === 1 ? -1 : 1 } : { i: ci, dir: 1 }))}
              >
                {c.name}
                <span className="ml-1 font-normal text-faint">{uiLabel(c.type)}</span>
                {sort?.i === ci ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
              </button>
            ))}
          </div>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((v) => {
              const { r, i } = filtered[v.index]!;
              return (
                <div
                  key={i}
                  className="absolute left-0 flex w-full border-b border-border/60 text-[12px]"
                  style={{ height: v.size, transform: `translateY(${v.start}px)` }}
                >
                  <div className="w-12 shrink-0 border-r border-border px-2 py-1.5 mono text-faint">{i + 1}</div>
                  {columns.map((c, ci) => (
                    <div key={c.id} className="min-w-32 flex-1 truncate border-r border-border/60 px-2 py-1.5">
                      {cellToString(r[ci] ?? null)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {tab === "profile" && (
        <div className="flex-1 overflow-auto p-3">
          <table className="w-full text-left text-[12px]">
            <thead className="text-[10px] uppercase text-muted">
              <tr>
                {[tr("Cột"), tr("Kiểu"), tr("Ô trống"), tr("Duy nhất"), tr("Nhỏ nhất"), tr("Lớn nhất"), tr("Trung bình")].map((h) => (
                  <th key={h} className="pb-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-1.5">{p.name}</td>
                  <td className="text-muted">{uiLabel(p.inferredType)}</td>
                  <td className="mono">{p.nullCount}</td>
                  <td className="mono">{p.uniqueCount}</td>
                  <td className="mono">{p.min ?? "—"}</td>
                  <td className="mono">{p.max ?? "—"}</td>
                  <td className="mono">{typeof p.mean === "number" ? p.mean.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "chart" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
            {numeric.map((p) => (
              <Button key={p.id} size="xs" variant={p.id === chartCol?.id ? "secondary" : "ghost"} onClick={() => setChartColId(p.id)}>
                {p.name}
              </Button>
            ))}
            <Button size="xs" variant={chartKind === "bar" ? "secondary" : "ghost"} onClick={() => setChartKind("bar")}>
              {tr("Cột")}
            </Button>
            <Button size="xs" variant={chartKind === "line" ? "secondary" : "ghost"} onClick={() => setChartKind("line")}>
              {tr("Đường")}
            </Button>
          </div>
          <div className="min-h-0 flex-1 p-4">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                {chartKind === "line" ? (
                  <LineChart data={chartData}>
                    <XAxis dataKey="i" stroke="var(--color-faint)" fontSize={10} />
                    <YAxis stroke="var(--color-faint)" fontSize={10} />
                    <RTooltip contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", fontSize: 12 }} />
                    <Line type="monotone" dataKey="v" stroke="var(--color-accent)" dot={false} />
                  </LineChart>
                ) : (
                  <BarChart data={chartData}>
                    <XAxis dataKey="i" stroke="var(--color-faint)" fontSize={10} />
                    <YAxis stroke="var(--color-faint)" fontSize={10} />
                    <RTooltip contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", fontSize: 12 }} />
                    <Bar dataKey="v" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            ) : (
              <PaneMessage title={tr("Không có cột số")} body={tr("Biểu đồ sử dụng dữ liệu số trong bảng.")} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ImageEditor({ file, doc }: { file: FileRecord; doc: ImageDocument }) {
  useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    blobUrl(file.id).then(setUrl);
  }, [file.id]);
  const hist = doc.histogram
    ? {
        r: downsample(doc.histogram.r, 48),
        g: downsample(doc.histogram.g, 48),
        b: downsample(doc.histogram.b, 48),
      }
    : null;
  const histMax = hist ? Math.max(...hist.r, ...hist.g, ...hist.b, 1) : 1;
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle,var(--color-surface-3)_1px,transparent_1px)] bg-size-[16px_16px] p-6">
        {url ? (
          <img
            src={url}
            alt={file.name}
            className="max-h-none origin-center outline outline-1 -outline-offset-1 outline-foreground/10"
            style={{ transform: `scale(${zoom})` }}
          />
        ) : null}
      </div>
      <div className="hidden w-56 shrink-0 overflow-auto border-l border-border p-3 text-[12px] lg:block">
        <p className="text-[10px] uppercase tracking-wide text-muted">{tr("Hình ảnh")}</p>
        <p className="mt-1 mono">
          {doc.width} × {doc.height}
        </p>
        <p className="text-muted">{doc.format.toUpperCase()}</p>
        {doc.hasAlpha && <Badge className="mt-2">{tr("trong suốt")}</Badge>}
        <div className="mt-3 flex gap-1">
          <Button size="xs" variant="secondary" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
            +
          </Button>
          <Button size="xs" variant="secondary" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
            −
          </Button>
        </div>
        {hist && (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] uppercase text-muted">{tr("Biểu đồ phân bố")}</p>
            {(["r", "g", "b"] as const).map((ch) => (
              <div key={ch} className="flex h-8 items-end gap-px">
                {hist[ch].map((v, i) => (
                  <div
                    key={i}
                    className={cn("flex-1", ch === "r" ? "bg-danger/70" : ch === "g" ? "bg-success/70" : "bg-info/70")}
                    style={{ height: `${(v / histMax) * 100}%` }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TextEditor({ file, doc }: { file: FileRecord; doc: TextDocument }) {
  useLanguage();
  const [mode, setMode] = useState<"edit" | "preview">(doc.kind === "markdown" ? "preview" : "edit");
  const html = useMemo(() => {
    if (doc.kind !== "markdown") return "";
    return DOMPurify.sanitize(marked.parse(doc.text, { async: false }) as string);
  }, [doc.kind, doc.text]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] text-muted">
        <span>
          {doc.wordCount} {tr("từ ·")} {doc.lineCount} {tr("dòng ·")} {doc.encoding}
        </span>
        {doc.kind === "markdown" && (
          <div className="ml-auto flex gap-1">
            <Button size="xs" variant={mode === "edit" ? "secondary" : "ghost"} onClick={() => setMode("edit")}>{tr("Mã nguồn")}
            </Button>
            <Button size="xs" variant={mode === "preview" ? "secondary" : "ghost"} onClick={() => setMode("preview")}>{tr("Xem trước")}
            </Button>
          </div>
        )}
      </div>
      {doc.kind === "html" ? (
        <iframe sandbox="" title={file.name} className="h-full w-full bg-surface-2" srcDoc={DOMPurify.sanitize(doc.text)} />
      ) : mode === "preview" && doc.kind === "markdown" ? (
        <div className="prose-invert max-w-none flex-1 overflow-auto px-6 py-4 text-sm [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_p]:mb-3 [&_p]:text-pretty" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-5">{doc.text}</pre>
      )}
    </div>
  );
}

function StructuredEditor({ file, doc }: { file: FileRecord; doc: StructuredDocument }) {
  useLanguage();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Badge tone={doc.valid ? "success" : "danger"}>{doc.valid ? tr("hợp lệ") : tr("không hợp lệ")}</Badge>
        <span className="text-[11px] text-muted">{doc.pathCount} {tr("nút")}</span>
        <span className="ml-auto text-[11px] text-faint">{file.name}</span>
      </div>
      {doc.error && <div className="border-b border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{doc.error}</div>}
      <pre className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-5">{doc.text}</pre>
    </div>
  );
}

function ArchiveEditor({ file, doc }: { file: FileRecord; doc: ArchiveDocument }) {
  useLanguage();
  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-muted">
        {doc.entries.length} {tr("mục · tỷ lệ")} {doc.ratio.toFixed(1)}×
        <Button size="xs" variant="secondary" onClick={() => void runActionUi("archive.extract", [file.id])}>{tr("Giải nén tệp an toàn")}
        </Button>
      </div>
      {doc.warnings.map((w) => (
        <p key={w} className="mb-1 text-xs text-warn">
          {w}
        </p>
      ))}
      <div className="flex-1 overflow-auto border border-border">
        {doc.entries.map((e) => (
          <div key={e.path} className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-[12px]">
            <span className="min-w-0 flex-1 truncate font-mono">{e.path}</span>
            <span className="mono text-faint">{e.size}</span>
            {e.unsafe && <Badge tone="danger">{e.reason ?? tr("không an toàn")}</Badge>}
          </div>
        ))}
      </div>
    </div>
  );
}

function HexEditor({ file, doc }: { file: FileRecord; doc?: BinaryDocument }) {
  useLanguage();
  const [text, setText] = useState("");
  useEffect(() => {
    let gone = false;
    getBlob(file.storageRef).then(async (blob) => {
      const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
      if (!gone) setText(hexDump(bytes, 0));
    });
    return () => {
      gone = true;
    };
  }, [file.storageRef]);
  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-muted">
        <span className="mono">magic {doc?.magicHex || "—"}</span>
        {doc && <span>entropy {doc.entropy.toFixed(2)}</span>}
      </div>
      <pre className="flex-1 overflow-auto bg-surface-2 p-3 font-mono text-[11px] leading-5">{text}</pre>
      {doc?.strings.length ? (
        <div className="mt-2 max-h-32 overflow-auto border-t border-border pt-2 text-[11px]">
          <p className="mb-1 text-muted">{tr("Chuỗi ký tự")}</p>
          {doc.strings.slice(0, 40).map((s, i) => (
            <div key={i} className="truncate font-mono text-foreground/80">
              {s}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MediaEditor({ file, doc }: { file: FileRecord; doc: MediaDocument }) {
  useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    blobUrl(file.id).then(setUrl);
  }, [file.id]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      {url && doc.kind === "audio" && <audio controls src={url} className="w-full max-w-xl" />}
      {url && doc.kind === "video" && <video controls src={url} className="max-h-[70%] max-w-full" />}
      {doc.waveform && (
        <div className="flex h-16 w-full max-w-xl items-end gap-px">
          {doc.waveform.map((v, i) => (
            <div key={i} className="flex-1 bg-accent/80" style={{ height: `${Math.max(4, v * 100)}%` }} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        {doc.duration ? `${doc.duration.toFixed(1)}s` : ""} {doc.width && doc.height ? tr(`${doc.width}×${doc.height}`) : ""}
      </p>
      <p className="text-[11px] text-faint">{tr("Trình duyệt hỗ trợ phát và chụp nội dung, chưa hỗ trợ chuyển mã.")}</p>
    </div>
  );
}

function DocxEditor({ file, doc }: { file: FileRecord; doc: DocxDocument }) {
  useLanguage();
  const html = useMemo(() => DOMPurify.sanitize(doc.html), [doc.html]);
  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-48 overflow-auto border-r border-border p-3 text-[12px] md:block">
        <p className="mb-2 text-[10px] uppercase text-muted">{tr("Mục lục")}</p>
        {doc.headings.map((h, i) => (
          <div key={i} className="truncate" style={{ paddingLeft: (h.level - 1) * 8 }}>
            {h.text}
          </div>
        ))}
        {doc.hasMacros && <Badge tone="warn" className="mt-3">{tr("có macro (không thực thi)")}</Badge>}
      </aside>
      <div className="flex-1 overflow-auto px-8 py-6 text-sm" dangerouslySetInnerHTML={{ __html: html }} />
      <span className="hidden">{file.id}</span>
    </div>
  );
}

function PptxEditor({ file, doc }: { file: FileRecord; doc: PresentationDocument }) {
  useLanguage();
  const [i, setI] = useState(0);
  const slide = doc.slides[i];
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-40 overflow-auto border-r border-border p-2">
        {doc.slides.map((s) => (
          <button
            key={s.index}
            onClick={() => setI(s.index)}
            className={cn("mb-1 w-full rounded-sm px-2 py-2 text-left text-[11px]", i === s.index ? "bg-surface-3" : "hover:bg-surface-2")}
          >
            {s.index + 1}. {s.title}
          </button>
        ))}
      </aside>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="aspect-video w-full max-w-3xl rounded-lg border border-border bg-surface-2 p-8 shadow-[var(--shadow-border)]">
          <h2 className="mb-4 text-lg font-semibold">{slide?.title}</h2>
          <pre className="whitespace-pre-wrap text-sm text-muted">{slide?.text}</pre>
        </div>
      </div>
      <span className="hidden">{file.id}</span>
    </div>
  );
}

void 0 as unknown as DocumentModel;

function downsample(arr: number[], buckets: number): number[] {
  const out: number[] = [];
  const step = arr.length / buckets;
  for (let i = 0; i < buckets; i++) {
    let s = 0;
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    for (let j = a; j < b && j < arr.length; j++) s += arr[j] ?? 0;
    out.push(s);
  }
  return out;
}
