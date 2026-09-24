import { saveUi } from "@/core/engine";
import { workspaceStore } from "@/core/store";
import type { LayoutState } from "@/core/types";

export function setWorkspaceLayout(patch: Partial<LayoutState>) {
  workspaceStore.setState((state) => ({ layout: { ...state.layout, ...patch } }));
  // A storage failure must not prevent opening or closing a panel.
  void saveUi().catch((error: unknown) => console.warn("Unable to save workspace layout", error));
}
