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

bootstrapRegistries();

const activities = [
  { id: "files", icon: Files, label: "Tệp" },
  { id: "pipelines", icon: Layers, label: "Quy trình" },
  { id: "history", icon: History, label: "Lịch sử" },
  { id: "lineage", icon: GitBranch, label: "Nguồn gốc" },
  { id: "search", icon: Search, label: "Tìm kiếm" },
] as const;

export function Shell() {
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
  const [diag, setDiag] = useState(diagnosticsSnapshot());

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
          toast.error("Không thể tải tệp mẫu");
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
        workspaceStore.setState((s) => ({ layout: { ...s.layout, activity: "search" } }));
      }
      if (e.key === "Escape") {
        workspaceStore.setState((s) => ({ ui: { ...s.ui, contextMenu: null, dropMenu: null, commandOpen: false } }));
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
    toast.message(`Đang nhập ${arr.length} tệp`);
    await importBrowserFiles(arr, "drop");
  }

  const left = (
    <div className="flex h-full min-h-0">
      <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-2">
        {activities.map((a) => (
          <button
            key={a.id}
            title={a.label}
            onClick={() => workspaceStore.setState((s) => ({ layout: { ...s.layout, activity: a.id } }))}
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground",
              layout.activity === a.id && "bg-surface-3 text-foreground",
            )}
          >
            <a.icon className="size-4" />
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {layout.activity === "files" && <Explorer />}
        {layout.activity === "pipelines" && (
          <div className="p-2">
            <Button size="sm" className="mb-2 w-full" onClick={() => void createPipeline()}>Quy trình mới
            </Button>
            <p className="px-1 text-[11px] text-muted">Mở và chỉnh sửa quy trình trong vùng làm việc chính.</p>
          </div>
        )}
        {layout.activity === "history" && (
          <div className="overflow-auto p-2 text-[12px]">
            {history.ops.map((op, i) => (
              <div key={op.id} className={cn("rounded-sm px-2 py-1.5", i === history.pointer && "bg-surface-3")}>
                <div className="font-medium">{op.label}</div>
                <div className="text-[10px] text-faint">{new Date(op.at).toLocaleTimeString("vi-VN")}</div>
              </div>
            ))}
            {!history.ops.length && <p className="p-3 text-muted">Chưa có thao tác nào.</p>}
          </div>
        )}
        {layout.activity === "lineage" && <LineageView compact />}
        {layout.activity === "search" && <WorkspaceSearch />}
      </div>
    </div>
  );

  const center = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-1">
        {tabs.map((t) => {
          const f = files[t.fileId];
          return (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 border-r border-border px-2 py-1.5 text-[12px]",
                t.id === activeTabId ? "bg-background" : "text-muted hover:bg-surface-2",
              )}
              onContextMenu={(e) => {
                e.preventDefault();
                togglePinTab(t.id);
              }}
            >
              <button className="flex items-center gap-1" onClick={() => workspaceStore.setState({ activeTabId: t.id, selectedIds: [t.fileId] })}>
                {f && <FileKindIcon kind={f.kind} />}
                <span className="max-w-40 truncate">{t.title}</span>
                {t.pinned && <Pin className="size-2.5 text-accent" />}
              </button>
              <button className="rounded-sm p-0.5 opacity-0 hover:bg-surface-3 group-hover:opacity-100" onClick={() => closeTab(t.id)} aria-label="Đóng thẻ">
                <X className="size-3" />
              </button>
            </div>
          );
        })}
        {!tabs.length && <span className="px-3 py-2 text-[12px] text-faint">Chưa mở tài liệu</span>}
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
        <span className="font-medium">Tác vụ</span>
        <Badge tone={running ? "info" : "muted"}>{running ? `${running} đang chạy` : "chờ"}</Badge>
        <span className="ml-auto text-faint">CỤC BỘ · tệp được xử lý trong trình duyệt</span>
      </div>
      <div className="flex-1 overflow-auto">
        {jobs
          .slice()
          .reverse()
          .map((j) => (
            <div key={j.id} className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[12px]">
              <span className="status-color w-20 capitalize" data-status={uiLabel(j.status)}>{uiLabel(j.status)}</span>
              <span className="min-w-0 flex-1 truncate">{j.title}</span>
              <span className="w-36 truncate text-faint">{j.message ?? j.error?.message}</span>
              <span className="w-16 text-right mono text-faint">{j.progress === null ? "—" : `${Math.round((j.progress ?? 0) * 100)}%`}</span>
              {(j.status === "running" || j.status === "queued") && (
                <button className="text-[11px] text-muted hover:text-foreground" onClick={() => cancelJob(j.id)}>Hủy
                </button>
              )}
              {j.status === "failed" && j.actionId && (
                <button
                  className="text-[11px] text-muted hover:text-foreground"
                  onClick={() => void retryJob(j.id).catch((err: unknown) => toast.error(errorMessage(err)))}
                >Thử lại
                </button>
              )}
            </div>
          ))}
        {!jobs.length && <p className="p-3 text-[12px] text-faint">Chưa có tác vụ nào.</p>}
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
          <span className="hidden text-[11px] text-muted sm:inline">Công cụ xử lý tệp</span>
        </div>
        <button
          className="ml-4 hidden h-7 min-w-48 items-center gap-2 rounded-md border border-border bg-background px-2 text-[12px] text-muted md:flex"
          onClick={() => workspaceStore.setState((s) => ({ ui: { ...s.ui, commandOpen: true } }))}
        >
          <CommandIcon className="size-3.5" />Tìm kiếm hoặc chạy
          <kbd className="ml-auto text-[10px] text-faint">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Badge tone="accent">CỤC BỘ</Badge>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" />Mở
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void importFromDirectoryPicker().catch((err: unknown) => {
                const msg = errorMessage(err);
                if (!/abort|cancel/i.test(msg)) toast.error(msg);
              })
            }
            aria-label="Mở thư mục"
            title="Mở thư mục"
          >
            <FolderOpen className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Đổi giao diện sáng/tối">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </header>

      {suggestions.length > 0 && (
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
              <span className="font-medium">{s.title}</span>
              <span className="ml-2 text-muted">{s.detail}</span>
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
        <Group orientation="horizontal" className="min-h-0 flex-1">
          <Panel id="explorer" defaultSize="18%" minSize="12%" maxSize="32%" className="bg-sidebar">
            {left}
          </Panel>
          <Separator className="w-1 bg-border hover:bg-accent/40" />
          <Panel id="main" minSize="40%">
            <Group orientation="vertical" className="h-full">
              <Panel id="editor" minSize="40%">
                {center}
              </Panel>
              <Separator className="h-1 bg-border hover:bg-accent/40" />
              <Panel id="jobs" defaultSize="22%" minSize="12%" maxSize="40%" className="bg-surface">
                {bottom}
              </Panel>
            </Group>
          </Panel>
          <Separator className="w-1 bg-border hover:bg-accent/40" />
          <Panel id="inspector" defaultSize="22%" minSize="16%" maxSize="36%" className="bg-surface">
            <Inspector />
          </Panel>
        </Group>
      )}

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-[10px] uppercase tracking-wide text-muted">
        <span className="flex items-center gap-1">
          <Activity className="size-3" /> {hydrated ? "Sẵn sàng" : "Đang tải"}
        </span>
        <span>{Object.keys(files).length} tệp</span>
        <span className="ml-auto">Hoàn tác {history.pointer + 1}/{history.ops.length}</span>
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
          <div className="rounded-xl border border-accent bg-surface px-8 py-6 text-sm">Thả tệp để nhập — xử lý cục bộ</div>
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
          <div className="mb-1 flex items-center justify-between font-sans text-[10px] uppercase text-muted">Chẩn đoán
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
  const files = useWorkspace((s) => s.files);
  function findSample(name: string) {
    return Object.values(files).find((f) => f.name === name);
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <p className="text-lg font-medium tracking-tight">Thả tệp để xem nội dung</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-pretty text-muted">Xem và xử lý PDF, bảng tính, hình ảnh, tệp nén và văn bản. Mỗi thao tác tạo tệp mới và lưu lại nguồn gốc.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onPick}>Mở tệp</Button>
        <Button variant="secondary" onClick={() => void seedDemoWorkspace(true)}>Tải lại tệp mẫu
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
              else toast.message("Hãy tải tệp mẫu trước khi chạy quy trình này.");
            }}
          >
            <div className="text-[12px] font-medium">{r.title}</div>
            <p className="mt-1 text-[11px] text-muted">{r.description}</p>
            {r.sampleFile && <p className="mt-2 text-[10px] uppercase tracking-wide text-faint">{r.sampleFile}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceSearch() {
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
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong không gian làm việc" className="mb-2 h-8 rounded-md border border-border bg-surface px-2 text-xs" />
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
  const actions = availableActions(fileIds);
  const files = workspaceStore.getState().files;
  return (
    <div
      className="fixed z-50 min-w-48 rounded-lg border border-border bg-surface py-1 shadow-[var(--shadow-pop)]"
      style={{ left: x, top: y }}
      onMouseLeave={() => workspaceStore.setState((s) => ({ ui: { ...s.ui, contextMenu: null } }))}
    >
      <MenuItem
        label="Mở"
        onClick={() => {
          fileIds.forEach(openTab);
          closeMenu();
        }}
      />
      <MenuItem
        label="Đổi tên"
        onClick={() => {
          const id = fileIds[0];
          const name = id ? prompt("Đổi tên", files[id]?.name) : null;
          if (id && name) void renameFile(id, name);
          closeMenu();
        }}
      />
      <MenuItem
        label="Tạo bản sao"
        onClick={() => {
          if (fileIds[0]) void duplicateFile(fileIds[0]);
          closeMenu();
        }}
      />
      <MenuItem
        label="So sánh với tệp tiếp theo…"
        onClick={() => {
          if (fileIds.length >= 2) workspaceStore.setState({ compare: { leftId: fileIds[0]!, rightId: fileIds[1]! } });
          closeMenu();
        }}
      />
      <div className="my-1 h-px bg-border" />
      {actions.slice(0, 8).map((a) => (
        <MenuItem
          key={a.id}
          label={a.title}
          onClick={() => {
            void runActionUi(a.id, fileIds);
            closeMenu();
          }}
        />
      ))}
      <div className="my-1 h-px bg-border" />
      <MenuItem
        label="Xóa"
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
  return (
    <div
      className="fixed z-50 min-w-56 rounded-lg border border-border bg-surface py-1 shadow-[var(--shadow-pop)]"
      style={{ left: menu.x, top: menu.y }}
      onMouseLeave={() => workspaceStore.setState((s) => ({ ui: { ...s.ui, dropMenu: null } }))}
    >
      <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted">Thả lên tệp</p>
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
          <span className="text-[12px]">{opt.title}</span>
          <span className="text-[11px] text-muted">{opt.detail}</span>
        </button>
      ))}
    </div>
  );
}

function closeMenu() {
  workspaceStore.setState((s) => ({ ui: { ...s.ui, contextMenu: null } }));
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="flex w-full px-3 py-1.5 text-left text-[12px] hover:bg-surface-2" onClick={onClick}>
      {label}
    </button>
  );
}

void formatBytes;
void saveUi;
void selectFiles;
