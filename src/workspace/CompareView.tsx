import { useMemo } from "react";
import { compareFiles } from "@/core/compare";
import { useWorkspace, workspaceStore } from "@/core/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CompareView() {
  const compare = useWorkspace((s) => s.compare);
  const files = useWorkspace((s) => s.files);
  const selected = useWorkspace((s) => s.selectedIds);
  const left = compare ? files[compare.leftId] : files[selected[0] ?? ""];
  const right = compare ? files[compare.rightId] : files[selected[1] ?? ""];

  const result = useMemo(() => {
    if (!left || !right) return null;
    return compareFiles(left, right);
  }, [left, right]);

  if (!left || !right) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted">Chọn hai tệp để so sánh hoặc thả một tệp lên tệp còn lại.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[12px]">
        <span className="font-medium">{left.name}</span>
        <span className="text-faint">vs</span>
        <span className="font-medium">{right.name}</span>
        <span className="ml-auto text-muted">{result?.summary}</span>
        <Button size="xs" variant="ghost" onClick={() => workspaceStore.setState({ compare: null })}>Đóng
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-5">
        {result?.hunks.map((h, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap px-2 py-0.5",
              h.type === "add" && "bg-success/10 text-success",
              h.type === "remove" && "bg-danger/10 text-danger",
              h.type === "change" && "bg-warn/10",
            )}
          >
            {h.path && <span className="mr-2 text-faint">{h.path}</span>}
            {h.type === "add" ? "+ " : h.type === "remove" ? "− " : h.type === "change" ? "± " : "  "}
            {h.left && h.type !== "add" ? h.left : ""}
            {h.type === "change" ? " → " : ""}
            {h.right && h.type !== "remove" ? h.right : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
