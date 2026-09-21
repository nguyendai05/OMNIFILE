import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { availableActions, openTab, searchWorkspace, setTheme } from "@/core/engine";
import { RECIPES } from "@/core/recipes";
import { runActionUi, runRecipeUi } from "./run";
import { useWorkspace, workspaceStore, filesList } from "@/core/store";
import { scoreSearch } from "@/core/table-ops";
import { actionRegistry } from "@/core/registries";
import { FileKindIcon } from "./FileIcon";

export function CommandPalette() {
  const open = useWorkspace((s) => s.ui.commandOpen);
  const selected = useWorkspace((s) => s.selectedIds);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof searchWorkspace>>>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        workspaceStore.setState((s) => ({ ui: { ...s.ui, commandOpen: !s.ui.commandOpen } }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    void searchWorkspace(query).then(setHits);
  }, [query, open]);

  const files = useWorkspace((s) => filesList(s));
  const fileHits = useMemo(
    () =>
      files
        .map((f) => ({ f, score: scoreSearch(query, [f.name, f.kind]) }))
        .filter((x) => !query || x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    [files, query],
  );

  const recipeHits = useMemo(
    () =>
      RECIPES.map((r) => ({ r, score: scoreSearch(query, [r.title, r.description, r.id]) }))
        .filter((x) => !query || x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6),
    [query],
  );

  const actionHits = useMemo(() => {
    const pool = selected.length ? availableActions(selected) : actionRegistry.all();
    return pool
      .map((a) => ({ a, score: scoreSearch(query, [a.title, a.id, a.description, ...a.keywords]) }))
      .filter((x) => !query || x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [query, selected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-overlay pt-[12vh]" onClick={() => workspaceStore.setState((s) => ({ ui: { ...s.ui, commandOpen: false } }))}>
      <Command
        className="w-[min(560px,92vw)] overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search files, actions, commands"
          className="h-11 w-full border-b border-border bg-transparent px-4 text-sm outline-none"
        />
        <Command.List className="max-h-[min(420px,60vh)] overflow-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-xs text-muted">Nothing matches.</Command.Empty>
          <Command.Group heading="Files" className="mb-2 text-[10px] uppercase tracking-wide text-muted">
            {fileHits.map(({ f }) => (
              <Command.Item
                key={f.id}
                value={`file-${f.id}-${f.name}`}
                onSelect={() => {
                  openTab(f.id);
                  workspaceStore.setState((s) => ({ ui: { ...s.ui, commandOpen: false } }));
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground data-[selected=true]:bg-surface-3"
              >
                <FileKindIcon kind={f.kind} />
                {f.name}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Recipes" className="mb-2 text-[10px] uppercase tracking-wide text-muted">
            {recipeHits.map(({ r }) => (
              <Command.Item
                key={r.id}
                value={`recipe-${r.id}`}
                onSelect={() => {
                  const ids = selected.length ? selected : [];
                  if (ids.length) void runRecipeUi(r.id, ids);
                  workspaceStore.setState((s) => ({ ui: { ...s.ui, commandOpen: false } }));
                }}
                className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-3"
              >
                <span>{r.title}</span>
                <span className="text-[10px] uppercase text-faint">recipe</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Actions" className="mb-2 text-[10px] uppercase tracking-wide text-muted">
            {actionHits.map(({ a }) => (
              <Command.Item
                key={a.id}
                value={`action-${a.id}`}
                onSelect={() => {
                  const ids = selected.length ? selected : [];
                  if (ids.length) void runActionUi(a.id, ids);
                  workspaceStore.setState((s) => ({ ui: { ...s.ui, commandOpen: false } }));
                }}
                className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-3"
              >
                <span>{a.title}</span>
                <span className="text-[10px] uppercase text-faint">{a.execution}</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Commands" className="text-[10px] uppercase tracking-wide text-muted">
            <Command.Item
              value="theme-toggle"
              onSelect={() => {
                const t = workspaceStore.getState().ui.theme === "dark" ? "light" : "dark";
                setTheme(t);
                workspaceStore.setState((s) => ({ ui: { ...s.ui, commandOpen: false } }));
              }}
              className="rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-3"
            >
              Toggle theme
            </Command.Item>
          </Command.Group>
          {hits.filter((h) => h.field === "text").slice(0, 6).map((h) => (
            <Command.Item
              key={`${h.fileId}-${h.snippet}`}
              value={`hit-${h.fileId}-${h.snippet}`}
              onSelect={() => {
                openTab(h.fileId);
                workspaceStore.setState((s) => ({ ui: { ...s.ui, commandOpen: false } }));
              }}
              className="rounded-md px-2 py-1.5 text-[12px] data-[selected=true]:bg-surface-3"
            >
              <span className="text-muted">{h.name}: </span>
              {h.snippet}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
