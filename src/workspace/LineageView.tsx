import { useMemo } from "react";
import { useWorkspace } from "@/core/store";
import { openTab } from "@/core/engine";
import { FileKindIcon } from "./FileIcon";

export function LineageView({ compact = false }: { compact?: boolean }) {
  const lineage = useWorkspace((s) => s.lineage);
  const files = useWorkspace((s) => s.files);
  const selected = useWorkspace((s) => s.selectedIds[0]);

  const nodes = useMemo(() => {
    const ids = new Set<string>();
    for (const e of lineage) {
      e.fromIds.forEach((id) => ids.add(id));
      e.toIds.forEach((id) => ids.add(id));
    }
    if (selected) ids.add(selected);
    return [...ids].map((id) => files[id]).filter(Boolean);
  }, [files, lineage, selected]);

  if (!lineage.length) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
        Derived files will appear here with the actions that created them.
      </div>
    );
  }

  if (compact) {
    return (
      <div className="h-full overflow-auto p-2 text-[12px]">
        {lineage.map((e) => (
          <button
            key={e.id}
            className="mb-1 w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
            onClick={() => e.toIds[0] && openTab(e.toIds[0])}
          >
            <div className="font-medium">{e.actionTitle}</div>
            <div className="truncate text-[11px] text-muted">
              {e.fromIds.map((id) => files[id]?.name ?? "?").join(", ")} → {e.toIds.map((id) => files[id]?.name ?? "?").join(", ")}
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {lineage.map((e) => (
          <div key={e.id} className="rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">{e.actionTitle}</div>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              {e.fromIds.map((id) => (
                <FileChip key={id} id={id} />
              ))}
              <span className="text-faint">→</span>
              {e.toIds.map((id) => (
                <FileChip key={id} id={id} />
              ))}
            </div>
          </div>
        ))}
        <div className="mt-4 grid gap-2">
          {nodes.map((f) => (
            <button
              key={f.id}
              onClick={() => openTab(f.id)}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-left text-[12px] hover:border-accent"
            >
              <FileKindIcon kind={f.kind} />
              <span className="flex-1 truncate">{f.name}</span>
              {f.source.type === "derived" && <span className="text-faint">{f.source.actionId}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FileChip({ id }: { id: string }) {
  const file = useWorkspace((s) => s.files[id]);
  if (!file) return <span className="text-faint">{id.slice(0, 8)}</span>;
  return (
    <button onClick={() => openTab(id)} className="inline-flex items-center gap-1 rounded-sm bg-surface-3 px-2 py-1">
      <FileKindIcon kind={file.kind} />
      {file.name}
    </button>
  );
}
