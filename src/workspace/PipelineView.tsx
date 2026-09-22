import { useLanguage } from "@/lib/use-language";
import { t as tr } from "@/lib/locale";
import { uiLabel } from "@/lib/locale";
import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  Handle,
  Position,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { actionRegistry } from "@/core/registries";
import { canConnect } from "@/core/table-ops";
import { createPipeline, createPipelineFromRecipe, runPipeline, savePipeline } from "@/core/engine";
import { RECIPES } from "@/core/recipes";
import { useWorkspace } from "@/core/store";
import { makeId } from "@/core/ids";
import type { DocumentKind, Pipeline, PipelineNodeData } from "@/core/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function asData(node: Node): PipelineNodeData {
  return node.data as unknown as PipelineNodeData;
}

function OmniNode({ data }: NodeProps) {
  useLanguage();
  const d = data as unknown as PipelineNodeData;
  const tone =
    d.status === "running"
      ? "border-accent"
      : d.status === "success"
        ? "border-success"
        : d.status === "failed"
          ? "border-danger"
          : d.status === "warning"
            ? "border-warn"
            : "border-control-border";
  return (
    <div className={cn("min-w-44 rounded-md border bg-surface-2 px-3 py-2 shadow-[var(--shadow-border)]", tone)}>
      {d.kind !== "input" && <Handle type="target" position={Position.Left} />}
      <div className="text-[10px] uppercase tracking-wide text-muted">{uiLabel(d.kind)}</div>
      <div className="text-[12px] font-medium">{d.actionId ? tr(actionRegistry.get(d.actionId)?.title ?? d.title) : d.title}</div>
      <div className="status-color text-[10px]" data-status={uiLabel(d.status)}>{uiLabel(d.status)}</div>
      {d.error && <div className="mt-1 max-w-48 text-[10px] text-danger">{tr(d.error)}</div>}
      {d.kind !== "output" && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

const nodeTypes = { omni: OmniNode };

export function PipelineView() {
  useLanguage();
  const theme = useWorkspace((s) => s.ui.theme);
  const pipelines = useWorkspace((s) => Object.values(s.pipelines));
  const activeId = useWorkspace((s) => s.activePipelineId);
  const files = useWorkspace((s) => s.files);
  const selected = useWorkspace((s) => s.selectedIds[0]);
  const pipeline = pipelines.find((p) => p.id === activeId) ?? pipelines[0];

  const [nodes, setNodes, onNodesChange] = useNodesState(toRfNodes(pipeline));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRfEdges(pipeline));

  useEffect(() => {
    setNodes(toRfNodes(pipeline));
    setEdges(toRfEdges(pipeline));
  }, [pipeline?.id, pipeline?.modifiedAt, pipeline, setEdges, setNodes]);

  const persist = useCallback(
    (n = nodes, e = edges) => {
      if (!pipeline) return;
      const next: Pipeline = {
        ...pipeline,
        nodes: n.map((node) => ({
          id: node.id,
          position: node.position,
          data: asData(node),
        })),
        edges: e.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
      };
      savePipeline(next);
    },
    [edges, nodes, pipeline],
  );

  const isValidConnection = useCallback(
    (c: Edge | Connection) => {
      const src = nodes.find((n) => n.id === c.source);
      const tgt = nodes.find((n) => n.id === c.target);
      if (!src || !tgt) return false;
      const check = canConnect(asData(src).produces, asData(tgt).accepts);
      if (!check.ok) toast.error(tr(check.reason ?? "Không thể kết nối"));
      return check.ok;
    },
    [nodes],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      setEdges((eds) => {
        const next = addEdge({ ...c, id: makeId("eg") }, eds);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist, setEdges],
  );

  const actions = useMemo(() => actionRegistry.all(), []);

  function addAction(actionId: string) {
    const action = actionRegistry.get(actionId);
    if (!action) return;
    const node: Node = {
      id: makeId("nd"),
      type: "omni",
      position: { x: 220 + nodes.length * 30, y: 80 + nodes.length * 40 },
      data: {
        kind: "action",
        actionId,
        title: action.title,
        accepts: action.accepts,
        produces: action.produces,
        config: {},
        status: "idle",
        outputFileIds: [],
        logs: [],
      },
    };
    const next = [...nodes, node];
    setNodes(next);
    persist(next, edges);
  }

  function addInput() {
    const file = selected ? files[selected] : undefined;
    const node: Node = {
      id: makeId("nd"),
      type: "omni",
      position: { x: 40, y: 80 + nodes.length * 50 },
      data: {
        kind: "input",
        fileId: file?.id,
        title: file ? file.name : tr("Tệp đầu vào"),
        accepts: [],
        produces: file ? [file.kind] : (["pdf"] as DocumentKind[]),
        config: {},
        status: "idle",
        outputFileIds: file ? [file.id] : [],
        logs: [],
      },
    };
    const next = [...nodes, node];
    setNodes(next);
    persist(next, edges);
  }

  if (!pipeline) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">{tr("Chưa có quy trình.")}</p>
        <Button onClick={() => void createPipeline("PDF to Excel")}>{tr("Tạo quy trình")}</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-52 shrink-0 overflow-auto border-r border-border p-2">
        <p className="px-1 pb-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Các bước")}</p>
        <Button size="sm" variant="secondary" className="mb-2 w-full" onClick={addInput}>{tr("Đầu vào (tệp đã chọn)")}
        </Button>
        <p className="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Mẫu")}</p>
        {RECIPES.slice(0, 4).map((r) => (
          <button
            key={r.id}
            onClick={() => void createPipelineFromRecipe(r.id, selected)}
            className="mb-0.5 w-full rounded-sm px-2 py-1 text-left text-[11px] hover:bg-surface-2"
          >
            {tr(r.title)}
          </button>
        ))}
        <p className="px-1 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted">{tr("Thao tác")}</p>
        {actions.map((a) => (
          <button
            key={a.id}
            onClick={() => addAction(a.id)}
            className="mb-0.5 flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-[11px] hover:bg-surface-2"
          >
            <span>{tr(a.title)}</span>
          </button>
        ))}
      </aside>
      <div className="relative min-w-0 flex-1">
        <div className="absolute right-3 top-3 z-10 flex gap-1">
          <Button
            size="sm"
            onClick={() =>
              void runPipeline(pipeline.id)
                .then(() => toast.success(tr("Đã hoàn tất quy trình")))
                .catch((e: unknown) => toast.error(tr(e instanceof Error ? e.message : String(e))))
            }
          >{tr("Chạy quy trình")}
          </Button>
        </div>
        <ReactFlow
          className="omni-flow"
          ariaLabelConfig={{
            "controls.ariaLabel": tr("Điều khiển quy trình"),
            "controls.zoomIn.ariaLabel": tr("Phóng to"),
            "controls.zoomOut.ariaLabel": tr("Thu nhỏ"),
            "controls.fitView.ariaLabel": tr("Vừa khung nhìn"),
            "controls.interactive.ariaLabel": tr("Bật/tắt tương tác"),
            "minimap.ariaLabel": tr("Sơ đồ thu nhỏ"),
          }}
          colorMode={theme}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          onNodeDragStop={() => persist()}
        >
          <Background gap={18} color="var(--color-border)" />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

function toRfNodes(p?: Pipeline): Node[] {
  if (!p) return [];
  return p.nodes.map((n) => ({ id: n.id, type: "omni", position: n.position, data: { ...n.data } }));
}
function toRfEdges(p?: Pipeline): Edge[] {
  if (!p) return [];
  return p.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
}
