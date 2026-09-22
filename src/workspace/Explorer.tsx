import { useLanguage } from "@/lib/use-language";
import { t as tr } from "@/lib/locale";
import { normalizeSearch } from "@/lib/locale";
import { useMemo, useState } from "react";
import { ChevronRight, FolderPlus } from "lucide-react";
import { ensureFolder, openTab, selectFiles } from "@/core/engine";
import { filesList, useWorkspace, workspaceStore } from "@/core/store";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { FileKindIcon } from "./FileIcon";
import { resolveFileDrop } from "@/core/recipes";

export function Explorer() {
  useLanguage();
  const files = useWorkspace((s) => filesList(s));
  const folders = useWorkspace((s) => Object.values(s.folders));
  const selected = useWorkspace((s) => s.selectedIds);
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const visible = useMemo(() => {
    const needle = normalizeSearch(q.trim());
    return needle ? files.filter((f) => normalizeSearch(f.name).includes(needle)) : files;
  }, [files, q]);

  const roots = folders.filter((f) => !f.parentId);
  const unfiled = visible.filter((f) => !f.folderId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("Lọc tệp")}
          className="h-7 w-full rounded-md border border-border bg-surface px-2 text-xs"
        />
        <button
          className="size-7 rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
          title={tr("Thư mục mới")}
          onClick={() => ensureFolder(tr("Thư mục chưa đặt tên"))}
        >
          <FolderPlus className="mx-auto size-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-1 text-[12px]">
        {roots.map((folder) => {
          const kids = visible.filter((f) => f.folderId === folder.id);
          const open = !collapsed[folder.id];
          return (
            <div key={folder.id} className="mb-1">
              <button
                className="flex w-full items-center gap-1 rounded-sm px-1.5 py-1 text-left text-muted hover:bg-surface-2 hover:text-foreground"
                onClick={() => setCollapsed((c) => ({ ...c, [folder.id]: !c[folder.id] }))}
              >
                <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
                <span className="font-medium">{folder.name}</span>
                <span className="ml-auto mono text-[10px] text-faint">{kids.length}</span>
              </button>
              {open &&
                kids.map((f) => (
                  <FileRow key={f.id} id={f.id} name={f.name} kind={f.kind} size={f.size} selected={selected.includes(f.id)} depth={1} />
                ))}
            </div>
          );
        })}
        {unfiled.map((f) => (
          <FileRow key={f.id} id={f.id} name={f.name} kind={f.kind} size={f.size} selected={selected.includes(f.id)} depth={0} />
        ))}
        {!visible.length && <p className="px-2 py-6 text-center text-[11px] text-faint">{tr("Thả tệp để nhập")}</p>}
      </div>
    </div>
  );
}

function FileRow({
  id,
  name,
  kind,
  size,
  selected,
  depth,
}: {
  id: string;
  name: string;
  kind: Parameters<typeof FileKindIcon>[0]["kind"];
  size: number;
  selected: boolean;
  depth: number;
}) {
  useLanguage();
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/omnifile-id", id);
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/omnifile-id")) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={(e) => {
        const src = e.dataTransfer.getData("application/omnifile-id");
        if (!src || src === id) return;
        e.preventDefault();
        e.stopPropagation();
        const state = workspaceStore.getState();
        const source = state.files[src];
        const target = state.files[id];
        if (!source || !target) return;
        const options = resolveFileDrop(source, target);
        workspaceStore.setState((s) => ({
          ui: {
            ...s.ui,
            dropMenu: {
              x: e.clientX,
              y: e.clientY,
              sourceIds: [src],
              targetId: id,
              intent: "file-on-file",
              options: options.map((o) => ({
                actionId: o.actionId ?? o.id,
                title: o.title,
                detail: o.detail,
              })),
            },
          },
        }));
      }}
      onClick={(e) => {
        selectFiles([id], e.metaKey || e.ctrlKey);
        openTab(id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        selectFiles([id]);
        workspaceStore.setState((s) => ({
          ui: { ...s.ui, contextMenu: { x: e.clientX, y: e.clientY, fileIds: [id] } },
        }));
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-surface-2",
        selected && "bg-surface-3 text-foreground",
      )}
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <FileKindIcon kind={kind} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="mono text-[10px] text-faint">{formatBytes(size)}</span>
    </button>
  );
}
