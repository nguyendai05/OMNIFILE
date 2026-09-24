import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  FileRecord,
  FolderRecord,
  HistoryState,
  Job,
  LayoutState,
  LineageEdge,
  Note,
  Pipeline,
  Suggestion,
  TabState,
  UiState,
} from "./types";

export interface WorkspaceState {
  hydrated: boolean;
  files: Record<string, FileRecord>;
  folders: Record<string, FolderRecord>;
  tabs: TabState[];
  activeTabId: string | null;
  selectedIds: string[];
  pipelines: Record<string, Pipeline>;
  activePipelineId: string | null;
  jobs: Record<string, Job>;
  history: HistoryState;
  lineage: LineageEdge[];
  notes: Record<string, Note>;
  suggestions: Suggestion[];
  compare: { leftId: string; rightId: string } | null;
  closedTabs: TabState[];
  layout: LayoutState;
  ui: UiState;
  concurrency: number;
  fps: number;
}

const defaultLayout: LayoutState = {
  explorerSize: 20,
  inspectorSize: 24,
  bottomSize: 22,
  activity: "files",
  bottomTab: "jobs",
  explorerCollapsed: false,
  inspectorCollapsed: false,
  bottomCollapsed: false,
  stepsCollapsed: false,
  minimapVisible: true,
  focusMode: false,
};

const defaultUi: UiState = {
  theme: "dark",
  commandOpen: false,
  diagnosticsOpen: false,
  contextMenu: null,
  dropMenu: null,
  actionDialog: null,
  renameId: null,
  documentSearch: "",
  workspaceSearch: "",
  hexOffset: 0,
};

export const workspaceStore = createStore<WorkspaceState>(() => ({
  hydrated: false,
  files: {},
  folders: {},
  tabs: [],
  activeTabId: null,
  selectedIds: [],
  pipelines: {},
  activePipelineId: null,
  jobs: {},
  history: { ops: [], pointer: -1 },
  lineage: [],
  notes: {},
  suggestions: [],
  compare: null,
  closedTabs: [],
  layout: defaultLayout,
  ui: defaultUi,
  concurrency: 4,
  fps: 0,
}));

export function useWorkspace<T>(selector: (s: WorkspaceState) => T): T {
  return useStore(workspaceStore, useShallow(selector));
}

export function filesList(state: WorkspaceState): FileRecord[] {
  return Object.values(state.files).filter((f) => !f.hidden);
}
