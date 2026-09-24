import { useLanguage } from "@/lib/use-language";
import { t as tr, restoreLanguage, setLanguage } from "@/lib/locale";
import { uiLabel } from "@/lib/locale";
import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Toaster, toast } from "sonner";
import {
  Files,
  GitBranch,
  History,
  Layers,
  Search,
  Moon,
  Sun,
  Command as CommandIcon,
  Upload,
  Activity,
  X,
  Pin,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelBottomClose,
  PanelBottomOpen,
  Maximize2,
  Minimize2,
  RotateCcw,
} from "lucide-react";
import { bootstrapRegistries } from "@/core/bootstrap";
import {
  applyTheme,
  availableActions,
  bootstrapWorkspace,
  cancelJob,
  closeTab,
  createPipeline,
  deleteFiles,
  duplicateFile,
  importBrowserFiles,
  importFromDirectoryPicker,
  openTab,
  redo,
  renameFile,
  reopenClosedTab,
  retryJob,
  saveUi,
  selectFiles,
  setTheme,
  togglePinTab,
  undo,
} from "@/core/engine";
import { listPlugins } from "@/core/registries";
import { diagnosticsSnapshot } from "@/core/engine";
import { useWorkspace, workspaceStore } from "@/core/store";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Explorer } from "./Explorer";
import { Inspector } from "./Inspector";
import { DocumentEditor } from "./editors";
import { CommandPalette } from "./CommandPalette";
import { PipelineView } from "./PipelineView";
import { LineageView } from "./LineageView";
import { CompareView } from "./CompareView";
import { seedDemoWorkspace } from "./seed";
import { useMediaQuery } from "./hooks";
import { FileKindIcon } from "./FileIcon";
import { runActionUi, runBatchUi, runRecipeUi } from "./run";
import { RECIPES } from "@/core/recipes";
import { errorMessage } from "@/core/errors";
import { setWorkspaceLayout } from "./layout";

bootstrapRegistries();

const activities = [
  { id: "files", icon: Files, label: "Tệp" },
  { id: "pipelines", icon: Layers, label: "Quy trình" },
  { id: "history", icon: History, label: "Lịch sử" },
  { id: "lineage", icon: GitBranch, label: "Nguồn gốc" },
  { id: "search", icon: Search, label: "Tìm kiếm" },
] as const;

export function Shell() {
  const language = useLanguage();
  const hydrated = useWorkspace((s) => s.hydrated);
  const theme = useWorkspace((s) => s.ui.theme);
  const layout = useWorkspace((s) => s.layout);
  const tabs = useWorkspace((s) => s.tabs);
  const activeTabId = useWorkspace((s) => s.activeTabId);
  const files = useWorkspace((s) => s.files);
  const jobs = useWorkspace((s) => Object.values(s.jobs));
  const suggestions = useWorkspace((s) => s.suggestions);
  const contextMenu = useWorkspace((s) => s.ui.contextMenu);
  const dropMenu = useWorkspace((s) => s.ui.dropMenu);
  const diagnosticsOpen = useWorkspace((s) => s.ui.diagnosticsOpen);
  const compare = useWorkspace((s) => s.compare);
  const history = useWorkspace((s) => s.history);
  const [mobileTab, setMobileTab] = useState<"files" | "view" | "actions">("view");
  const isMobile = useMediaQuery("(max-width: 768px)");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [diag, setDiag] = useState(diagnosticsSnapshot());
  const explorerOpen = !layout.explorerCollapsed && !layout.focusMode;
  const inspectorOpen = !layout.inspectorCollapsed && !layout.focusMode;
  const jobsOpen = !layout.bottomCollapsed && !layout.focusMode;

  useEffect(() => {
    restoreLanguage();
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    void (async () => {
      await bootstrapWorkspace();
      const s = workspaceStore.getState();
      if (!Object.keys(s.files).length) {
        try {
          await seedDemoWorkspace();
        } catch (err) {
          toast.error(tr("Không thể tải tệp mẫu"));
          console.error(err);
        }
      }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "o") {
        e.preventDefault();
        fileRef.current?.click();
      }
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        redo();
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        workspaceStore.setState((s) => ({ ui: { ...s.ui, diagnosticsOpen: !s.ui.diagnosticsOpen } }));
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        reopenClosedTab();
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setWorkspaceLayout({ activity: "search", explorerCollapsed: false, focusMode: false });
      }
      if (e.key === "Escape") {
        workspaceStore.setState((s) => ({ ui: { ...s.ui, contextMenu: null, dropMenu: null, commandOpen: false } }));
        if (workspaceStore.getState().layout.focusMode) setWorkspaceLayout({ focusMode: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!diagnosticsOpen) return;
    const id = window.setInterval(() => setDiag(diagnosticsSnapshot()), 500);
    return () => window.clearInterval(id);
  }, [diagnosticsOpen]);

  const activeFile = tabs.find((t) => t.id === activeTabId);
  const running = jobs.filter((j) => j.status === "running" || j.status === "queued").length;

  async function onFiles(list: FileList | File[] | null) {
    if (!list || (Array.isArray(list) ? !list.length : !list.length)) return;
    const arr = Array.from(list as FileList);
    toast.message(tr(`Đang nhập ${arr.length} tệp`));
    await importBrowserFiles(arr, "drop");
  }

  const activityRail = (
      <nav aria-label={tr("Điều hướng không gian làm việc")} className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-2">
        {activities.map((a) => (
          <button
            key={a.id}
            title={tr(a.label)}
            aria-label={tr(a.label)}
            aria-current={layout.activity === a.id ? "page" : undefined}
            onClick={() => {
              setWorkspaceLayout({ activity: a.id, explorerCollapsed: false, focusMode: false });
              if (isMobile && (a.id === "pipelines" || a.id === "lineage")) setMobileTab("view");
            }}
            className={cn(
              "flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground md:size-9",
              layout.activity === a.id && "bg-surface-3 text-foreground",
            )}
          >
            <a.icon className="size-4" />
          </button>
        ))}
      </nav>
  );

  const left = (
    <div className="flex h-full min-h-0">
      {isMobile && activityRail}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-2">
          <span className="text-xs font-medium">{tr(activities.find((a) => a.id === layout.activity)?.label ?? "Tệp")}</span>
          {!isMobile && <Button size="icon" variant="ghost" aria-label={tr("Thu gọn danh sách tệp")} title={tr("Thu gọn danh sách tệp")} onClick={() => setWorkspaceLayout({ explorerCollapsed: true })}><PanelLeftClose /></Button>}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
        {layout.activity === "files" && <Explorer />}
        {layout.activity === "pipelines" && (
          <div className="p-2">
            <Button size="sm" className="mb-2 w-full" onClick={() => void createPipeline()}>{tr("Quy trình mới")}
            </Button>
            <p className="px-1 text-[11px] text-muted">{tr("Mở và chỉnh sửa quy trình trong vùng làm việc chính.")}</p>
          </div>
        )}
        {layout.activity === "history" && (
          <div className="overflow-auto p-2 text-[12px]">
            {history.ops.map((op, i) => (
              <div key={op.id} className={cn("rounded-sm px-2 py-1.5", i === history.pointer && "bg-surface-3")}>
                <div className="font-medium">{tr(op.label)}</div>
                <div className="text-[10px] text-faint">{new Date(op.at).toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US")}</div>
              </div>
            ))}
            {!history.ops.length && <p className="p-3 text-muted">{tr("Chưa có thao tác nào.")}</p>}
          </div>
        )}
        {layout.activity === "lineage" && <LineageView compact />}
        {layout.activity === "search" && <WorkspaceSearch />}
        </div>
      </div>
    </div>
  );

  const center = (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-1">
        {tabs.map((t) => {
          const f = files[t.fileId];
          return (
            <div
              key={t.id}
              className={cn(
                "group flex shrink-0 items-center gap-1 border-r border-border px-2 py-1.5 text-[12px]",
                t.id === activeTabId ? "bg-background" : "text-muted hover:bg-surface-2",
              )}
              onContextMenu={(e) => {
                e.preventDefault();
                togglePinTab(t.id);
              }}
            >
              <button title={t.title} className="flex min-h-8 items-center gap-1" onClick={() => workspaceStore.setState({ activeTabId: t.id, selectedIds: [t.fileId] })}>
                {f && <FileKindIcon kind={f.kind} />}
                <span className="max-w-40 truncate">{t.title}</span>
                {t.pinned && <Pin className="size-2.5 text-accent" />}
              </button>
              <button className="rounded-sm p-1 text-muted hover:bg-surface-3 hover:text-foreground focus-visible:opacity-100 md:opacity-50 md:group-hover:opacity-100" onClick={() => closeTab(t.id)} aria-label={tr("Đóng thẻ")}>
                <X className="size-3" />
              </button>
            </div>
          );
        })}
        {!tabs.length && <span className="px-3 py-2 text-[12px] text-faint">{tr("Chưa mở tài liệu")}</span>}
      </div>
      <div className="min-h-0 flex-1">
        {layout.activity === "pipelines" ? (
          <PipelineView />
        ) : layout.activity === "lineage" ? (
          <LineageView />
        ) : compare ? (
          <CompareView />
        ) : activeFile && files[activeFile.fileId] ? (
          <DocumentEditor file={files[activeFile.fileId]!} />
        ) : (
          <EmptyState onPick={() => fileRef.current?.click()} />
        )}
      </div>
    </div>
  );

  const bottom = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1 text-[11px]">
        <span className="font-medium">{tr("Tác vụ")}</span>
        <Badge tone={running ? "info" : "muted"}>{running ? tr(`${running} đang chạy`) : tr("chờ")}</Badge>
        <span className="ml-auto hidden truncate text-faint xl:block">{tr("CỤC BỘ · tệp được xử lý trong trình duyệt")}</span>
        <Button className="ml-auto xl:ml-0" size="icon" variant="ghost" aria-label={tr("Thu gọn tác vụ")} title={tr("Thu gọn tác vụ")} onClick={() => setWorkspaceLayout({ bottomCollapsed: true })}><PanelBottomClose /></Button>
      </div>
      <div className="flex-1 overflow-auto">
        {jobs
          .slice()
          .reverse()
          .map((j) => (
            <div key={j.id} className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[12px]">
              <span className="status-color w-20 capitalize" data-status={j.status}>{uiLabel(j.status)}</span>
              <span className="min-w-0 flex-1 truncate">{tr(j.title)}</span>
              <span className="w-36 truncate text-faint">{tr(j.message ?? j.error?.message ?? "")}</span>
              <span className="w-16 text-right mono text-faint">{j.progress === null ? "—" : `${Math.round((j.progress ?? 0) * 100)}%`}</span>
              {(j.status === "running" || j.status === "queued") && (
                <button className="text-[11px] text-muted hover:text-foreground" onClick={() => cancelJob(j.id)}>{tr("Hủy")}
                </button>
              )}
              {j.status === "failed" && j.actionId && (
                <button
                  className="text-[11px] text-muted hover:text-foreground"
                  onClick={() => void retryJob(j.id).catch((err: unknown) => toast.error(tr(errorMessage(err))))}
                >{tr("Thử lại")}
                </button>
              )}
            </div>
          ))}
        {!jobs.length && <p className="p-3 text-[12px] text-faint">{tr("Chưa có tác vụ nào.")}</p>}
      </div>
    </div>
  );

  return (
    <div
      className="flex h-dvh min-h-0 flex-col bg-background text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.getData("application/omnifile-id")) return;
        void onFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold tracking-[0.14em]">OMNIFILE</span>
          <span className="hidden text-[11px] text-muted sm:inline">{tr("Công cụ xử lý tệp")}</span>
        </div>
        <button
          className="ml-4 hidden h-7 min-w-48 items-center gap-2 rounded-md border border-border bg-background px-2 text-[12px] text-muted md:flex"
          onClick={() => workspaceStore.setState((s) => ({ ui: { ...s.ui, commandOpen: true } }))}
        >
          <CommandIcon className="size-3.5" />{tr("Tìm kiếm hoặc chạy")}
          <kbd className="ml-auto text-[10px] text-faint">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <select
            aria-label={tr("Ngôn ngữ")}
            value={language}
            onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "vi")}
            className="h-8 max-w-28 rounded-md border border-border bg-surface px-1 text-[11px] text-foreground"
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
          <Badge tone="accent" className="hidden sm:inline-flex">{tr("CỤC BỘ")}</Badge>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" />{tr("Mở")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void importFromDirectoryPicker().catch((err: unknown) => {
                const msg = errorMessage(err);
                if (!/abort|cancel/i.test(msg)) toast.error(tr(msg));
              })
            }
            aria-label={tr("Mở thư mục")}
            title={tr("Mở thư mục")}
          >
            <FolderOpen className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={tr("Đổi giao diện sáng/tối")}>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </header>

      {suggestions.length > 0 && !layout.focusMode && (
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-surface-2 px-3 py-1.5 text-[12px]">
          {suggestions.slice(0, 4).map((s) => (
            <button
              key={s.id}
              className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-left hover:border-accent"
              onClick={() => {
                if (!s.actionId) return;
                if (s.actionId.startsWith("recipe:")) {
                  void runRecipeUi(s.actionId.slice("recipe:".length), s.fileIds);
                } else if (s.fileIds.length > 1) {
                  void runBatchUi(s.actionId, s.fileIds);
                } else {
                  void runActionUi(s.actionId, s.fileIds);
                }
              }}
            >
              <span className="font-medium">{tr(s.title)}</span>
              <span className="ml-2 text-muted">{tr(s.detail)}</span>
            </button>
          ))}
        </div>
      )}

      {isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {mobileTab === "files" && left}
            {mobileTab === "view" && center}
            {mobileTab === "actions" && <Inspector />}
          </div>
          <nav className="flex h-14 border-t border-border">
            {(["files", "view", "actions"] as const).map((t) => (
              <button
                key={uiLabel(t)}
                onClick={() => setMobileTab(t)}
                className={cn("flex-1 text-xs capitalize", mobileTab === t ? "text-foreground" : "text-muted")}
              >
                {uiLabel(t)}
              </button>
            ))}
          </nav>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-surface px-2" aria-label={tr("Bố cục không gian làm việc")}>
            <span className="mr-2 hidden text-xs text-muted lg:block">{tr("Không gian làm việc")}</span>
            <Button size="sm" variant={explorerOpen ? "secondary" : "ghost"} aria-expanded={explorerOpen} aria-controls="workspace-explorer" title={tr(explorerOpen ? "Thu gọn danh sách tệp" : "Mở danh sách tệp")} onClick={() => setWorkspaceLayout({ explorerCollapsed: explorerOpen, focusMode: false })}>{explorerOpen ? <PanelLeftClose /> : <PanelLeftOpen />}{tr("Danh sách tệp")}</Button>
            <Button size="sm" variant={inspectorOpen ? "secondary" : "ghost"} aria-expanded={inspectorOpen} aria-controls="workspace-inspector" title={tr(inspectorOpen ? "Thu gọn thông tin" : "Mở thông tin")} onClick={() => setWorkspaceLayout({ inspectorCollapsed: inspectorOpen, focusMode: false })}>{inspectorOpen ? <PanelRightClose /> : <PanelRightOpen />}{tr("Thông tin")}</Button>
            <Button size="sm" variant={jobsOpen ? "secondary" : "ghost"} aria-expanded={jobsOpen} aria-controls="workspace-jobs" title={tr(jobsOpen ? "Thu gọn tác vụ" : "Mở tác vụ")} onClick={() => setWorkspaceLayout({ bottomCollapsed: jobsOpen, focusMode: false })}>{jobsOpen ? <PanelBottomClose /> : <PanelBottomOpen />}{tr("Tác vụ")}{running > 0 && <Badge tone="info">{running}</Badge>}</Button>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant={layout.focusMode ? "secondary" : "ghost"} aria-pressed={layout.focusMode} title={tr("Chế độ tập trung · Esc để thoát")} onClick={() => setWorkspaceLayout({ focusMode: !layout.focusMode })}>{layout.focusMode ? <Minimize2 /> : <Maximize2 />}{tr(layout.focusMode ? "Thoát tập trung" : "Tập trung")}</Button>
              <Button size="icon" variant="ghost" title={tr("Khôi phục các panel")} aria-label={tr("Khôi phục các panel")} onClick={() => { setWorkspaceLayout({ explorerCollapsed: false, inspectorCollapsed: false, bottomCollapsed: false, stepsCollapsed: false, minimapVisible: true, focusMode: false, explorerSize: 20, inspectorSize: 24, bottomSize: 22, stepsSize: 240, stepsClosedGroups: [], inspectorClosedSections: ["metadata", "lineage", "recent"] }); setLayoutRevision((value) => value + 1); }}><RotateCcw /></Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
          {activityRail}
          <Group key={layoutRevision} orientation="horizontal" className="min-h-0 min-w-0 flex-1" onLayoutChanged={(sizes, meta) => {
            if (!meta.isUserInteraction) return;
            setWorkspaceLayout({ ...(sizes.explorer ? { explorerSize: sizes.explorer } : {}), ...(sizes.inspector ? { inspectorSize: sizes.inspector } : {}) });
          }}>
          {explorerOpen && <Panel key="explorer" id="explorer" defaultSize={`${layout.explorerSize}%`} minSize="12%" maxSize="30%" className="bg-sidebar"><div id="workspace-explorer" className="h-full">{left}</div></Panel>}
          {explorerOpen && <Separator key="explorer-resize" className="w-1 bg-border hover:bg-accent/40" />}
          <Panel key="main" id="main" minSize="40%">
            <Group orientation="vertical" className="h-full" onLayoutChanged={(sizes, meta) => {
              if (meta.isUserInteraction && sizes.jobs) setWorkspaceLayout({ bottomSize: sizes.jobs });
            }}>
              <Panel key="editor" id="editor" minSize="40%">
                {center}
              </Panel>
              {jobsOpen && <Separator key="jobs-resize" className="h-1 bg-border hover:bg-accent/40" />}
              {jobsOpen && <Panel key="jobs" id="jobs" defaultSize={`${layout.bottomSize}%`} minSize="12%" maxSize="40%" className="bg-surface"><div id="workspace-jobs" className="h-full">{bottom}</div></Panel>}
            </Group>
          </Panel>
          {inspectorOpen && <Separator key="inspector-resize" className="w-1 bg-border hover:bg-accent/40" />}
          {inspectorOpen && <Panel key="inspector" id="inspector" defaultSize={`${layout.inspectorSize}%`} minSize="16%" maxSize="36%" className="bg-surface"><div id="workspace-inspector" className="flex h-full min-h-0 flex-col">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-2"><span className="text-xs font-medium">{tr("Thông tin tệp")}</span><Button size="icon" variant="ghost" aria-label={tr("Thu gọn thông tin")} title={tr("Thu gọn thông tin")} onClick={() => setWorkspaceLayout({ inspectorCollapsed: true })}><PanelRightClose /></Button></div>
            <div className="min-h-0 flex-1"><Inspector /></div>
          </div></Panel>}
          </Group>
          </div>
        </div>
      )}

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-[10px] uppercase tracking-wide text-muted">
        <span className="flex items-center gap-1">
          <Activity className="size-3" /> {hydrated ? tr("Sẵn sàng") : tr("Đang tải")}
        </span>
        <span>{Object.keys(files).length} {tr("tệp")}</span>
        <span className="ml-auto">{tr("Hoàn tác")} {history.pointer + 1}/{history.ops.length}</span>
      </footer>

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-overlay">
          <div className="rounded-xl border border-accent bg-surface px-8 py-6 text-sm">{tr("Thả tệp để nhập — xử lý cục bộ")}</div>
        </div>
      )}

      <CommandPalette />
      <Toaster theme={theme} position="bottom-right" richColors={false} />

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} fileIds={contextMenu.fileIds} />
      )}
      {dropMenu && <DropMenu menu={dropMenu} />}

      {diagnosticsOpen && (
        <div className="fixed bottom-10 right-4 z-40 w-64 rounded-lg border border-border bg-surface p-3 font-mono text-[11px] shadow-[var(--shadow-pop)]">
          <div className="mb-1 flex items-center justify-between font-sans text-[10px] uppercase text-muted">{tr("Chẩn đoán")}
            <Pin className="size-3" />
          </div>
          <div>files {diag.files}</div>
          <div>docs {diag.documents}</div>
          <div>jobs {diag.jobs}</div>
          <div>tabs {diag.tabs}</div>
          <div>workers {diag.workers}</div>
          <div>plugins {listPlugins().length}</div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: () => void }) {
  useLanguage();
  const files = useWorkspace((s) => s.files);
  function findSample(name: string) {
    return Object.values(files).find((f) => f.name === name);
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <p className="text-lg font-medium tracking-tight">{tr("Thả tệp để xem nội dung")}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-pretty text-muted">{tr("Xem và xử lý PDF, bảng tính, hình ảnh, tệp nén và văn bản. Mỗi thao tác tạo tệp mới và lưu lại nguồn gốc.")}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onPick}>{tr("Mở tệp")}</Button>
        <Button variant="secondary" onClick={() => void seedDemoWorkspace(true)}>{tr("Tải lại tệp mẫu")}
        </Button>
      </div>
      <div className="mt-2 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
        {RECIPES.filter((r) => r.sampleFile).map((r) => (
          <button
            key={r.id}
            className="rounded-lg border border-border bg-surface p-3 text-left hover:border-accent"
            onClick={() => {
              const sample = r.sampleFile ? findSample(r.sampleFile) : undefined;
              if (sample) void runRecipeUi(r.id, [sample.id]);
              else toast.message(tr("Hãy tải tệp mẫu trước khi chạy quy trình này."));
            }}
          >
            <div className="text-[12px] font-medium">{tr(r.title)}</div>
            <p className="mt-1 text-[11px] text-muted">{tr(r.description)}</p>
            {r.sampleFile && <p className="mt-2 text-[10px] uppercase tracking-wide text-faint">{r.sampleFile}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceSearch() {
  useLanguage();
  const [q, setQ] = useStateQuery();
  const [hits, setHits] = useState<Array<{ fileId: string; name: string; snippet: string }>>([]);
  useEffect(() => {
    let gone = false;
    void import("@/core/engine").then(({ searchWorkspace }) =>
      searchWorkspace(q).then((h) => {
        if (!gone) setHits(h.map((x) => ({ fileId: x.fileId, name: x.name, snippet: x.snippet })));
      }),
    );
    return () => {
      gone = true;
    };
  }, [q]);
  return (
    <div className="flex h-full flex-col p-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Tìm trong không gian làm việc")} className="mb-2 h-8 rounded-md border border-border bg-surface px-2 text-xs" />
      <div className="flex-1 overflow-auto">
        {hits.map((h, i) => (
          <button key={i} className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-surface-2" onClick={() => openTab(h.fileId)}>
            <div className="font-medium">{h.name}</div>
            <div className="truncate text-[11px] text-muted">{h.snippet}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function useStateQuery(): [string, (v: string) => void] {
  const [q, setQ] = useState("");
  return [q, setQ];
}

function ContextMenu({ x, y, fileIds }: { x: number; y: number; fileIds: string[] }) {
  useLanguage();
  const actions = availableActions(fileIds);
  const files = workspaceStore.getState().files;
  return (
    <div
      className="fixed z-50 min-w-48 rounded-lg border border-border bg-surface py-1 shadow-[var(--shadow-pop)]"
      style={{ left: x, top: y }}
      onMouseLeave={() => workspaceStore.setState((s) => ({ ui: { ...s.ui, contextMenu: null } }))}
    >
      <MenuItem
        label={tr("Mở")}
        onClick={() => {
          fileIds.forEach(openTab);
          closeMenu();
        }}
      />
      <MenuItem
        label={tr("Đổi tên")}
        onClick={() => {
          const id = fileIds[0];
          const name = id ? prompt(tr("Đổi tên"), files[id]?.name) : null;
          if (id && name) void renameFile(id, name);
          closeMenu();
        }}
      />
      <MenuItem
        label={tr("Tạo bản sao")}
        onClick={() => {
          if (fileIds[0]) void duplicateFile(fileIds[0]);
          closeMenu();
        }}
      />
      <MenuItem
        label={tr("So sánh với tệp tiếp theo…")}
        onClick={() => {
          if (fileIds.length >= 2) workspaceStore.setState({ compare: { leftId: fileIds[0]!, rightId: fileIds[1]! } });
          closeMenu();
        }}
      />
      <div className="my-1 h-px bg-border" />
      {actions.slice(0, 8).map((a) => (
        <MenuItem
          key={a.id}
          label={tr(a.title)}
          onClick={() => {
            void runActionUi(a.id, fileIds);
            closeMenu();
          }}
        />
      ))}
      <div className="my-1 h-px bg-border" />
      <MenuItem
        label={tr("Xóa")}
        onClick={() => {
          void deleteFiles(fileIds);
          closeMenu();
        }}
      />
    </div>
  );
}

function DropMenu({
  menu,
}: {
  menu: NonNullable<ReturnType<typeof workspaceStore.getState>["ui"]["dropMenu"]>;
}) {
  useLanguage();
  return (
    <div
      className="fixed z-50 min-w-56 rounded-lg border border-border bg-surface py-1 shadow-[var(--shadow-pop)]"
      style={{ left: menu.x, top: menu.y }}
      onMouseLeave={() => workspaceStore.setState((s) => ({ ui: { ...s.ui, dropMenu: null } }))}
    >
      <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted">{tr("Thả lên tệp")}</p>
      {menu.options.map((opt) => (
        <button
          key={opt.actionId}
          className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-surface-2"
          onClick={() => {
            workspaceStore.setState((s) => ({ ui: { ...s.ui, dropMenu: null } }));
            if (opt.actionId === "compare" && menu.targetId) {
              workspaceStore.setState({ compare: { leftId: menu.sourceIds[0]!, rightId: menu.targetId } });
              return;
            }
            if (opt.actionId === "table.merge" && menu.targetId) {
              void runActionUi(opt.actionId, [...menu.sourceIds, menu.targetId]);
              return;
            }
            if (opt.actionId) void runActionUi(opt.actionId, menu.sourceIds);
          }}
        >
          <span className="text-[12px]">{tr(opt.title)}</span>
          <span className="text-[11px] text-muted">{tr(opt.detail)}</span>
        </button>
      ))}
    </div>
  );
}

function closeMenu() {
  workspaceStore.setState((s) => ({ ui: { ...s.ui, contextMenu: null } }));
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  useLanguage();
  return (
    <button className="flex w-full px-3 py-1.5 text-left text-[12px] hover:bg-surface-2" onClick={onClick}>
      {tr(label)}
    </button>
  );
}

void formatBytes;
void saveUi;
void selectFiles;
