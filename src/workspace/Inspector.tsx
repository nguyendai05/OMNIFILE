import { useLanguage } from "@/lib/use-language";
import { t as tr } from "@/lib/locale";
import { actionRegistry } from "@/core/registries";
import { uiLabel } from "@/lib/locale";
import { availableActions, createPipelineFromRecipe, exportWith, lineageFor, recipesForFiles, upsertNote } from "@/core/engine";
import { exporterRegistry } from "@/core/registries";
import { useWorkspace, workspaceStore } from "@/core/store";
import { formatBytes, formatDuration } from "@/lib/utils";
import { kindLabel } from "@/core/mime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileKindIcon } from "./FileIcon";
import { useDocument } from "./hooks";
import { profileColumns } from "@/core/table-ops";
import { runActionUi, runBatchUi, runRecipeUi } from "./run";

export function Inspector() {
  useLanguage();
  const selected = useWorkspace((s) => s.selectedIds);
  const files = useWorkspace((s) => s.files);
  const notes = useWorkspace((s) => s.notes);
  const activeTab = useWorkspace((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const current = files[selected[0] ?? ""] ?? (activeTab ? files[activeTab.fileId] : undefined);
  const doc = useDocument(current?.id);
  const jobs = useWorkspace((s) => Object.values(s.jobs).slice(-8).reverse());
  const ids = selected.length ? selected : current ? [current.id] : [];
  const note = current
    ? Object.values(notes).find((n) => n.target.fileId === current.id && n.target.page == null)
    : undefined;

  if (!current) {
    return (
      <div className="p-4 text-[12px] text-muted">{tr("Chọn tệp để xem thông tin, thao tác khả dụng và nguồn gốc.")}
      </div>
    );
  }

  const actions = availableActions(ids);
  const recipes = recipesForFiles(ids);
  const exporters = exporterRegistry.all().filter((e) => e.accepts.includes(current.kind));
  const lin = lineageFor(current.id);
  const profiles =
    doc?.kind === "table"
      ? profileColumns(doc.columns, doc.rows)
      : doc?.kind === "spreadsheet"
        ? profileColumns(doc.sheets[0]?.columns ?? [], doc.sheets[0]?.rows ?? [])
        : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <section className="border-b border-border p-3">
        <div className="flex items-start gap-2">
          <FileKindIcon kind={current.kind} className="mt-0.5" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">{current.name}</h2>
            <p className="text-[11px] text-muted">
              {tr(kindLabel(current.kind))} · {formatBytes(current.size)}
            </p>
          </div>
        </div>
        <dl className="mt-3 space-y-1 text-[11px]">
          <div className="flex justify-between gap-2">
            <dt className="shrink-0 text-faint">MIME</dt>
            <dd className="min-w-0 truncate text-right">{current.detectedMime}</dd>
          </div>
          <div>
            <dt className="text-faint">SHA-256</dt>
            <dd className="mt-0.5 break-all font-mono text-[10px] text-muted">{current.sha256 ?? tr("đang tính mã băm…")}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-faint">{tr("Bộ đọc tệp")}</dt>
            <dd>{current.parserId ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-faint">{tr("Nơi xử lý")}</dt>
            <dd>
              <Badge tone="accent">{tr("CỤC BỘ")}</Badge>
            </dd>
          </div>
          {current.source.type === "derived" && (
            <div className="flex justify-between gap-2">
              <dt className="shrink-0 text-faint">{tr("Tạo từ")}</dt>
              <dd className="min-w-0 truncate text-right">{current.source.actionId}</dd>
            </div>
          )}
        </dl>
      </section>

      {recipes.length > 0 && (
        <section className="border-b border-border p-3">
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Quy trình mẫu")}</h3>
          <div className="flex flex-col gap-1">
            {recipes.map((r) => (
              <div key={r.id} className="rounded-md border border-border bg-surface-2 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[12px] font-medium">{tr(r.title)}</div>
                    <p className="mt-0.5 text-[11px] text-muted">{tr(r.description)}</p>
                  </div>
                  <Badge tone="accent">{tr("CỤC BỘ")}</Badge>
                </div>
                <div className="mt-2 flex gap-1">
                  <Button size="xs" onClick={() => void runRecipeUi(r.id, ids)}>{tr("Chạy")}
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      void createPipelineFromRecipe(r.id, current.id).then(() =>
                        workspaceStore.setState((s) => ({ layout: { ...s.layout, activity: "pipelines" } })),
                      );
                    }}
                  >{tr("Mở quy trình")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="border-b border-border p-3">
        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Thao tác")}{ids.length > 1 ? tr(` · ${ids.length} tệp`) : ""}
        </h3>
        <div className="flex flex-col gap-1">
          {actions.length === 0 && <p className="text-[11px] text-faint">{tr("Chưa có thao tác cho loại tệp này.")}</p>}
          {actions.map((a) => (
            <button
              key={a.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-surface-2"
              onClick={() => void (ids.length > 1 ? runBatchUi(a.id, ids) : runActionUi(a.id, ids))}
            >
              <span>{tr(a.title)}</span>
              <Badge tone={a.execution === "local" ? "accent" : a.execution === "cloud-ai" ? "warn" : "info"}>
                {uiLabel(a.execution)}
              </Badge>
            </button>
          ))}
        </div>
      </section>

      {exporters.length > 0 && (
        <section className="border-b border-border p-3">
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Xuất tệp")}</h3>
          <div className="flex flex-wrap gap-1">
            {exporters.map((e) => (
              <Button key={e.id} size="xs" variant="secondary" onClick={() => void exportWith(e.id, current.id)}>
                {tr(e.title)}
              </Button>
            ))}
          </div>
        </section>
      )}

      {doc?.kind === "pdf" && (
        <section className="border-b border-border p-3 text-[12px]">
          <h3 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted">PDF</h3>
          <p>
            {doc.pageCount} {tr("trang ·")} {doc.pages.reduce((n, p) => n + p.tables.length, 0)} {tr("bảng")}
          </p>
          {doc.info.Title && <p className="text-muted">{doc.info.Title}</p>}
        </section>
      )}

      {profiles && (
        <section className="border-b border-border p-3 text-[11px]">
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Thống kê dữ liệu")}</h3>
          {profiles.slice(0, 8).map((p) => (
            <div key={p.id} className="mb-1 flex justify-between gap-2">
              <span className="truncate">{p.name}</span>
              <span className="text-muted">
                {uiLabel(p.inferredType)} · {p.nullCount} {tr("ô trống ·")} {p.uniqueCount} {tr("duy nhất")}
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="border-b border-border p-3 text-[12px]">
        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Nguồn gốc")}</h3>
        {lin.edges.length === 0 && <p className="text-faint">{tr("Tệp gốc — chưa tạo tệp dẫn xuất.")}</p>}
        {lin.edges.map((e) => (
          <div key={e.id} className="mb-2">
            <div className="font-medium">{tr(actionRegistry.get(e.actionId)?.title ?? e.actionTitle)}</div>
            <div className="text-[11px] text-muted">
              {e.fromIds.map((id) => files[id]?.name ?? id).join(", ")} → {e.toIds.map((id) => files[id]?.name ?? id).join(", ")}
            </div>
          </div>
        ))}
      </section>

      <section className="border-b border-border p-3">
        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Ghi chú")}</h3>
        <textarea
          key={current.id}
          defaultValue={note?.body ?? ""}
          onBlur={(e) => upsertNote(current.id, e.target.value)}
          placeholder={tr("Ghi chú cho tệp này")}
          className="h-20 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-accent"
        />
      </section>

      <section className="p-3 text-[11px]">
        <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Tác vụ gần đây")}</h3>
        {jobs.map((j) => (
          <div key={j.id} className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate">{tr(j.title)}</span>
            <span className="status-color" data-status={uiLabel(j.status)}>
              {uiLabel(j.status)}
              {j.finishedAt && j.startedAt ? ` · ${formatDuration(j.finishedAt - j.startedAt)}` : ""}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
