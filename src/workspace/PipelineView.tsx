import { useLanguage } from "@/lib/use-language";
import { t as tr, uiLabel, normalizeSearch } from "@/lib/locale";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  ChevronDown,
  FileInput,
  ListTree,
  LoaderCircle,
  Map as MapIcon,
  Maximize,
  PanelLeftClose,
  Play,
  Plus,
  Search,
  Workflow,
  X,
} from "lucide-react";
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
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./pipeline.css";
import { actionRegistry } from "@/core/registries";
import { canConnect } from "@/core/table-ops";
import { createPipeline, createPipelineFromRecipe, runPipeline, savePipeline } from "@/core/engine";
import { RECIPES } from "@/core/recipes";
import { useWorkspace, workspaceStore } from "@/core/store";
import { makeId } from "@/core/ids";
import type { DocumentKind, Pipeline, PipelineNodeData } from "@/core/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setWorkspaceLayout } from "@/workspace/layout";
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
    <div
      className={cn(
        "min-w-44 rounded-md border bg-surface-2 px-3 py-2 shadow-[var(--shadow-border)]",
        tone,
      )}
    >
      {d.kind !== "input" && <Handle type="target" position={Position.Left} />}
      <div className="text-[10px] uppercase tracking-wide text-muted">{uiLabel(d.kind)}</div>
      <div className="text-[12px] font-medium">
        {d.actionId ? tr(actionRegistry.get(d.actionId)?.title ?? d.title) : d.title}
      </div>
      <div className="status-color text-[10px]" data-status={d.status}>
        {uiLabel(d.status)}
      </div>
      {d.error && <div className="mt-1 max-w-48 text-[10px] text-danger">{tr(d.error)}</div>}
      {d.kind !== "output" && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

const nodeTypes = { omni: OmniNode };

export function PipelineView() {
  const language = useLanguage();
  const theme = useWorkspace((s) => s.ui.theme);
  const pipeline = useWorkspace(
    (s) =>
      (s.activePipelineId ? s.pipelines[s.activePipelineId] : undefined) ??
      Object.values(s.pipelines)[0],
  );
  const files = useWorkspace((s) => s.files);
  const selected = useWorkspace((s) => s.selectedIds[0] ?? s.tabs.find((tab) => tab.id === s.activeTabId)?.fileId);
  const layout = useWorkspace((s) => s.layout);
  const [query, setQuery] = useState("");
  const closedGroups = new Set(layout.stepsClosedGroups ?? []);
  const stepsPanelRef = useRef<HTMLDivElement>(null);
  const [runPending, setRunPending] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const stepsTrigger = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const paletteVisible = !layout.stepsCollapsed && !layout.focusMode;
  const minimapVisible = layout.minimapVisible && !layout.focusMode && !mobile;
  const selectedFile = selected ? files[selected] : undefined;

  const [nodes, setNodes, onNodesChange] = useNodesState(toRfNodes(pipeline));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRfEdges(pipeline));
  const isRunning = runPending || nodes.some((node) => asData(node).status === "running");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => {
      setMobile(media.matches);
      setDrawerOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setNodes(toRfNodes(pipeline));
    setEdges(toRfEdges(pipeline));
  }, [pipeline?.id, pipeline?.modifiedAt, pipeline, setEdges, setNodes]);

  // Only a different pipeline gets a new initial viewport. Status updates and
  // opening panels must leave the user's pan and zoom alone.
  useEffect(() => {
    if (!flow || !pipeline?.id) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.2, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [flow, pipeline?.id]);

  function closeSteps() {
    setDrawerOpen(false);
    setWorkspaceLayout({ stepsCollapsed: true });
    if (!mobile) stepsTrigger.current?.querySelector("button")?.focus();
  }

  function openSteps() {
    setWorkspaceLayout({ stepsCollapsed: false, focusMode: false });
    if (mobile) setDrawerOpen(true);
  }

  function finishAddingStep() {
    if (mobile) closeSteps();
  }

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
  const search = normalizeSearch(query.trim());
  const actionGroups = useMemo(() => {
    const groups = new Map<string, typeof actions>();
    for (const action of actions) {
      const searchable = [
        action.title,
        tr(action.title, "vi"),
        tr(action.title, "en"),
        action.description,
        tr(action.description, "vi"),
        tr(action.description, "en"),
        action.category,
        tr(action.category, "vi"),
        tr(action.category, "en"),
        ...action.keywords,
      ].join(" ");
      if (search && !normalizeSearch(searchable).includes(search)) continue;
      const group = groups.get(action.category) ?? [];
      group.push(action);
      groups.set(action.category, group);
    }
    return [...groups.entries()];
  }, [actions, search, language]);
  const matchingRecipes = RECIPES.filter(
    (recipe) =>
      !search ||
      normalizeSearch(
        [
          recipe.title,
          tr(recipe.title, "en"),
          recipe.description,
          tr(recipe.description, "en"),
        ].join(" "),
      ).includes(search),
  );

  function toggleGroup(group: string, open: boolean) {
    if (search) return;
    const next = new Set(workspaceStore.getState().layout.stepsClosedGroups ?? []);
    if (next.has(group) === !open) return;
    if (open) next.delete(group);
    else next.add(group);
    setWorkspaceLayout({ stepsClosedGroups: [...next] });
  }

  function addAction(actionId: string) {
    if (isRunning) return;
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
    finishAddingStep();
  }

  function addInput() {
    if (isRunning || !selectedFile) return;
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
    finishAddingStep();
  }

  async function run() {
    if (!pipeline || isRunning || !nodes.length) return;
    setRunPending(true);
    try {
      await runPipeline(pipeline.id);
      toast.success(tr("Đã hoàn tất quy trình"));
    } catch (error) {
      toast.error(tr(error instanceof Error ? error.message : String(error)));
    } finally {
      setRunPending(false);
    }
  }

  const palette = (
    <div className="pipeline-palette-content">
      <div className="pipeline-palette-heading">
        <div>
          <h2 id="pipeline-steps-title">{tr("Các bước")}</h2>
          <p>{tr("Thêm bước vào quy trình")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={tr("Thu gọn các bước")}
          title={tr("Thu gọn các bước")}
          onClick={closeSteps}
        >
          {mobile ? <X aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        </Button>
      </div>
      <div className="pipeline-search" ref={searchRef}>
        <Search aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={tr("Tìm bước hoặc mẫu")}
          placeholder={tr("Tìm bước hoặc mẫu...")}
        />
      </div>
      <div className="pipeline-group-tools">
        <Button
          size="xs"
          variant="ghost"
          disabled={Boolean(search)}
          onClick={() =>
            setWorkspaceLayout({
              stepsClosedGroups: closedGroups.size
                ? []
                : ["templates", ...new Set(actions.map((action) => action.category))],
            })
          }
        >
          {tr(closedGroups.size ? "Mở các nhóm" : "Thu gọn các nhóm")}
        </Button>
      </div>
      <div className="pipeline-palette-scroll">
        <div className="pipeline-input-section">
          <Button
            variant="secondary"
            className="pipeline-add-input"
            onClick={addInput}
            disabled={!selectedFile || isRunning}
          >
            <FileInput aria-hidden="true" />
            {tr("Thêm tệp đầu vào")}
          </Button>
          <p title={selectedFile?.name}>
            {selectedFile?.name ?? tr("Chọn một tệp trong danh sách để thêm đầu vào.")}
          </p>
        </div>
        {matchingRecipes.length > 0 && (
          <details
            className="pipeline-group"
            open={Boolean(search) || !closedGroups.has("templates")}
            onToggle={(event) => toggleGroup("templates", event.currentTarget.open)}
          >
            <summary>
              <ChevronDown aria-hidden="true" />
              <span>{tr("Mẫu quy trình")}</span>
              <span className="pipeline-group-count">{matchingRecipes.length}</span>
            </summary>
            <div className="pipeline-group-items">
              {matchingRecipes.map((recipe) => (
                <Button
                  key={recipe.id}
                  variant="ghost"
                  className="pipeline-palette-item"
                  title={tr(recipe.description)}
                  disabled={isRunning}
                  onClick={() => {
                    void createPipelineFromRecipe(recipe.id, selected)
                      .then(finishAddingStep)
                      .catch((error: unknown) =>
                        toast.error(tr(error instanceof Error ? error.message : String(error))),
                      );
                  }}
                >
                  <Workflow aria-hidden="true" />
                  <span>{tr(recipe.title)}</span>
                </Button>
              ))}
            </div>
          </details>
        )}
        {actionGroups.map(([category, group]) => (
          <details
            key={category}
            className="pipeline-group"
            open={Boolean(search) || !closedGroups.has(category)}
            onToggle={(event) => toggleGroup(category, event.currentTarget.open)}
          >
            <summary>
              <ChevronDown aria-hidden="true" />
              <span>{tr(category)}</span>
              <span className="pipeline-group-count">{group.length}</span>
            </summary>
            <div className="pipeline-group-items">
              {group.map((action) => (
                <Button
                  key={action.id}
                  variant="ghost"
                  className="pipeline-palette-item"
                  disabled={isRunning}
                  title={tr(action.description)}
                  onClick={() => addAction(action.id)}
                >
                  <Plus aria-hidden="true" />
                  <span>{tr(action.title)}</span>
                </Button>
              ))}
            </div>
          </details>
        ))}
        {search && actionGroups.length === 0 && matchingRecipes.length === 0 && (
          <div className="pipeline-no-results" role="status">
            <p>{tr("Không tìm thấy bước phù hợp.")}</p>
            <Button variant="ghost" onClick={() => setQuery("")}>
              {tr("Xóa tìm kiếm")}
            </Button>
          </div>
        )}
      </div>
      <p className="pipeline-palette-help">
        {tr("Bấm để thêm bước. Kéo nối các điểm trên sơ đồ.")}
      </p>
    </div>
  );

  if (!pipeline) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">{tr("Chưa có quy trình.")}</p>
        <Button onClick={() => void createPipeline(tr("Quy trình mới"))}>
          {tr("Tạo quy trình")}
        </Button>
      </div>
    );
  }

  return (
    <div className="pipeline-workspace">
      <div className="pipeline-toolbar">
        <div ref={stepsTrigger}>
          <Button
            variant={paletteVisible && (!mobile || drawerOpen) ? "secondary" : "ghost"}
            className="pipeline-steps-toggle"
            aria-expanded={paletteVisible && (!mobile || drawerOpen)}
            aria-controls="pipeline-steps-panel"
            onClick={() => (paletteVisible && (!mobile || drawerOpen) ? closeSteps() : openSteps())}
          >
            <ListTree aria-hidden="true" />
            {tr("Các bước")}
          </Button>
        </div>
        <div className="pipeline-heading">
          <h1 title={pipeline.name}>{tr(pipeline.name)}</h1>
          <span>{tr("{0} bước").replace("{0}", String(nodes.length))}</span>
        </div>
        <div className="pipeline-toolbar-actions">
          <Button
            variant="ghost"
            size="icon"
            aria-label={tr("Vừa khung nhìn")}
            title={tr("Vừa khung nhìn")}
            onClick={() => void flow?.fitView({ padding: 0.2, maxZoom: 1 })}
          >
            <Maximize aria-hidden="true" />
          </Button>
          {!mobile && (
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={minimapVisible}
              aria-label={tr(minimapVisible ? "Ẩn sơ đồ thu nhỏ" : "Hiện sơ đồ thu nhỏ")}
              title={tr(minimapVisible ? "Ẩn sơ đồ thu nhỏ" : "Hiện sơ đồ thu nhỏ")}
              onClick={() =>
                setWorkspaceLayout(
                  minimapVisible
                    ? { minimapVisible: false }
                    : { minimapVisible: true, focusMode: false },
                )
              }
            >
              <MapIcon aria-hidden="true" />
            </Button>
          )}
          <Button
            className="pipeline-run"
            onClick={() => void run()}
            disabled={isRunning || !nodes.length}
            aria-busy={isRunning}
            aria-label={tr(isRunning ? "Đang chạy quy trình" : "Chạy quy trình")}
          >
            {isRunning ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
            <span>{tr(isRunning ? "Đang chạy" : "Chạy quy trình")}</span>
          </Button>
        </div>
      </div>
      <Group
        orientation="horizontal"
        className="pipeline-body"
        onLayoutChanged={(sizes, meta) => {
          const panel = stepsPanelRef.current;
          const group = panel?.parentElement;
          if (!meta.isUserInteraction || !group || !sizes.steps) return;
          // The callback runs before the DOM reflects the new panel width.
          // Use the committed percentage and the available group width instead.
          const divider = group.querySelector<HTMLElement>(".workspace-resize");
          const available = group.clientWidth - (divider?.offsetWidth ?? 0);
          setWorkspaceLayout({ stepsSize: (available * sizes.steps) / 100 });
        }}
      >
        {!mobile && paletteVisible && (
          <Panel
            id="steps"
            elementRef={stepsPanelRef}
            defaultSize={layout.stepsSize ?? 240}
            minSize={160}
            maxSize="55%"
          >
            <aside
              id="pipeline-steps-panel"
              className="pipeline-palette"
              aria-labelledby="pipeline-steps-title"
            >
              {palette}
            </aside>
          </Panel>
        )}
        {!mobile && paletteVisible && (
          <Separator
            className="workspace-resize"
            aria-label={tr("Đổi chiều rộng các bước")}
            title={tr("Kéo để đổi chiều rộng các bước")}
          />
        )}
        <Dialog.Root
          open={mobile && paletteVisible && drawerOpen}
          onOpenChange={(open) => {
            if (!open) closeSteps();
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="pipeline-drawer-overlay" />
            <Dialog.Content
              id="pipeline-steps-panel"
              className="pipeline-drawer"
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                searchRef.current?.querySelector("input")?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                stepsTrigger.current?.querySelector("button")?.focus();
              }}
            >
              <Dialog.Title className="sr-only">{tr("Các bước")}</Dialog.Title>
              <Dialog.Description className="sr-only">
                {tr("Thêm bước vào quy trình")}
              </Dialog.Description>
              {palette}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Panel id="canvas" minSize={120}>
          <div className="pipeline-canvas">
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
            minZoom={0.15}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              onInit={setFlow}
              nodesDraggable={!isRunning}
              nodesConnectable={!isRunning}
              deleteKeyCode={isRunning ? null : ["Backspace", "Delete"]}
              proOptions={{ hideAttribution: true }}
              onNodeDragStop={() => persist()}
            >
              <Background gap={18} color="var(--color-border)" />
              <Controls />
              {minimapVisible && (
                <MiniMap
                  className="pipeline-minimap"
                  pannable
                  zoomable
                  style={{ width: 140, height: 90 }}
                />
              )}
            </ReactFlow>
            {!nodes.length && (
              <div className="pipeline-empty">
                <Workflow aria-hidden="true" />
                <h2>{tr("Bắt đầu quy trình của bạn")}</h2>
                <p>{tr("Thêm tệp đầu vào và các bước, rồi nối chúng để tạo quy trình.")}</p>
                <Button variant="secondary" onClick={openSteps}>
                  <Plus aria-hidden="true" />
                  {tr("Thêm bước")}
                </Button>
              </div>
            )}
          </div>
        </Panel>
      </Group>
    </div>
  );
}

function toRfNodes(p?: Pipeline): Node[] {
  if (!p) return [];
  return p.nodes.map((n) => ({
    id: n.id,
    type: "omni",
    position: n.position,
    data: { ...n.data },
  }));
}
function toRfEdges(p?: Pipeline): Edge[] {
  if (!p) return [];
  return p.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
}
